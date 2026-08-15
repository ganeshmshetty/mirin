use base64::Engine;
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::sync::Notify;
use tokio::time::{timeout, Duration};

const FLAG_CONFIG: u64 = 1 << 63;
const FLAG_KEY_FRAME: u64 = 1 << 62;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VideoCodec {
    H264,
    H265,
}

impl VideoCodec {
    pub fn from_str(s: &str) -> Self {
        if s.eq_ignore_ascii_case("h265") || s.eq_ignore_ascii_case("hevc") {
            VideoCodec::H265
        } else {
            VideoCodec::H264
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            VideoCodec::H264 => "h264",
            VideoCodec::H265 => "h265",
        }
    }
}

#[derive(Clone, serde::Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "event", content = "data")]
pub enum FrameEvent {
    #[serde(rename = "config")]
    Config { codec: String, description: String },
    #[serde(rename = "packet")]
    Packet {
        key: bool,
        data: String,
        timestamp: u64,
    },
    #[serde(rename = "disconnected")]
    Disconnected { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamExitReason {
    /// The stream was stopped via shutdown notification (e.g. session replaced or stopped by user)
    Shutdown,
    /// The frontend receiver dropped the channel (page refresh, window closed, navigation)
    ChannelClosed,
    /// Disconnected due to device disconnection, socket closure, or timeout
    Disconnected(String),
}

#[derive(Debug)]
#[allow(dead_code)]
enum ForwardError {
    ChannelSend(String),
    Timeout,
    DeviceDisconnected,
    Io(std::io::Error),
    FrameTooLarge(usize),
}

pub async fn stream_video<F, E>(
    mut video_socket: TcpStream,
    on_event: F,
    shutdown: Arc<Notify>,
    codec: VideoCodec,
) -> StreamExitReason
where
    F: Fn(FrameEvent) -> Result<(), E> + Send + Sync + 'static,
    E: std::fmt::Display + Send + 'static,
{
    let result = tokio::select! {
        r = forward_loop(&mut video_socket, &on_event, codec) => r,
        // Intentional stop/replace — do not emit "disconnected" or the UI will
        // schedule another reconnect on top of the replacement session.
        _ = shutdown.notified() => {
            return StreamExitReason::Shutdown;
        }
    };

    match result {
        Ok(()) => {
            let reason = "Stream closed cleanly".to_string();
            let _ = on_event(FrameEvent::Disconnected {
                reason: reason.clone(),
            });
            StreamExitReason::Disconnected(reason)
        }
        Err(ForwardError::ChannelSend(_)) => {
            // Channel receiver dropped (e.g. window closed or page refreshed).
            // Do not attempt to send on broken channel.
            StreamExitReason::ChannelClosed
        }
        Err(ForwardError::Timeout) => {
            let reason = "Connection timed out".to_string();
            let _ = on_event(FrameEvent::Disconnected {
                reason: reason.clone(),
            });
            StreamExitReason::Disconnected(reason)
        }
        Err(ForwardError::DeviceDisconnected) => {
            let reason = "Device disconnected".to_string();
            let _ = on_event(FrameEvent::Disconnected {
                reason: reason.clone(),
            });
            StreamExitReason::Disconnected(reason)
        }
        Err(ForwardError::FrameTooLarge(size)) => {
            let reason = format!("Frame size exceeds maximum allowed size ({size} bytes)");
            let _ = on_event(FrameEvent::Disconnected {
                reason: reason.clone(),
            });
            StreamExitReason::Disconnected(reason)
        }
        Err(ForwardError::Io(e)) => {
            let reason = format!("Device disconnected: {e}");
            let _ = on_event(FrameEvent::Disconnected {
                reason: reason.clone(),
            });
            StreamExitReason::Disconnected(reason)
        }
    }
}

const READ_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_FRAME_SIZE: usize = 32 * 1024 * 1024; // 32MB max frame buffer

async fn forward_loop<F, E>(
    socket: &mut TcpStream,
    on_event: &F,
    codec: VideoCodec,
) -> Result<(), ForwardError>
where
    F: Fn(FrameEvent) -> Result<(), E> + Send + Sync + 'static,
    E: std::fmt::Display,
{
    loop {
        let mut header = [0u8; 12];
        match timeout(READ_TIMEOUT, socket.read_exact(&mut header)).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                if e.kind() == std::io::ErrorKind::UnexpectedEof {
                    return Err(ForwardError::DeviceDisconnected);
                } else {
                    return Err(ForwardError::Io(e));
                }
            }
            Err(_) => {
                return Err(ForwardError::Timeout);
            }
        }

        let pts_flags = u64::from_be_bytes([
            header[0], header[1], header[2], header[3],
            header[4], header[5], header[6], header[7],
        ]);
        let is_config = pts_flags & FLAG_CONFIG != 0;
        let is_key = pts_flags & FLAG_KEY_FRAME != 0;
        let pts = pts_flags & !(FLAG_CONFIG | FLAG_KEY_FRAME);

        let size = u32::from_be_bytes([header[8], header[9], header[10], header[11]]) as usize;
        if size == 0 {
            continue;
        }

        if size > MAX_FRAME_SIZE {
            return Err(ForwardError::FrameTooLarge(size));
        }

        let mut data = vec![0u8; size];
        match timeout(READ_TIMEOUT, socket.read_exact(&mut data)).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                if e.kind() == std::io::ErrorKind::UnexpectedEof {
                    return Err(ForwardError::DeviceDisconnected);
                } else {
                    return Err(ForwardError::Io(e));
                }
            }
            Err(_) => {
                return Err(ForwardError::Timeout);
            }
        }

        let nals = split_nal_units(&data);
        if is_config {
            let (codec_str, desc) = match codec {
                VideoCodec::H264 => parse_h264_config(&nals),
                VideoCodec::H265 => parse_h265_config(&nals),
            };
            if !desc.is_empty() {
                on_event(FrameEvent::Config {
                    codec: codec_str,
                    description: base64::engine::general_purpose::STANDARD.encode(&desc),
                })
                .map_err(|e| ForwardError::ChannelSend(e.to_string()))?;
            }
        } else {
            // Check for in-band parameter sets on keyframes (mid-stream resolution/config updates)
            if is_key {
                let has_inband_config = match codec {
                    VideoCodec::H264 => nals.iter().any(|n| !n.is_empty() && (n[0] & 0x1F == 7)),
                    VideoCodec::H265 => nals
                        .iter()
                        .any(|n| n.len() >= 2 && (((n[0] >> 1) & 0x3F) == 33)),
                };
                if has_inband_config {
                    let (codec_str, desc) = match codec {
                        VideoCodec::H264 => parse_h264_config(&nals),
                        VideoCodec::H265 => parse_h265_config(&nals),
                    };
                    if !desc.is_empty() {
                        on_event(FrameEvent::Config {
                            codec: codec_str,
                            description: base64::engine::general_purpose::STANDARD.encode(&desc),
                        })
                        .map_err(|e| ForwardError::ChannelSend(e.to_string()))?;
                    }
                }
            }

            let avcc = nals_to_avcc(&data);
            if !avcc.is_empty() {
                on_event(FrameEvent::Packet {
                    key: is_key,
                    data: base64::engine::general_purpose::STANDARD.encode(&avcc),
                    timestamp: pts,
                })
                .map_err(|e| ForwardError::ChannelSend(e.to_string()))?;
            }
        }
    }
}

// ============================================================================
// Bitstream Reader (Exp-Golomb & Bit-level operations)
// ============================================================================

#[derive(Debug, Clone)]
pub struct BitReader<'a> {
    data: &'a [u8],
    byte_offset: usize,
    bit_offset: u8, // 0 to 7 (0 = MSB, 7 = LSB)
}

impl<'a> BitReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            data,
            byte_offset: 0,
            bit_offset: 0,
        }
    }

    #[inline]
    pub fn read_bit(&mut self) -> Option<u8> {
        if self.byte_offset >= self.data.len() {
            return None;
        }
        let byte = self.data[self.byte_offset];
        let bit = (byte >> (7 - self.bit_offset)) & 0x01;
        self.bit_offset += 1;
        if self.bit_offset == 8 {
            self.bit_offset = 0;
            self.byte_offset += 1;
        }
        Some(bit)
    }

    pub fn read_bits(&mut self, n: usize) -> Option<u32> {
        if n == 0 {
            return Some(0);
        }
        if n > 32 {
            return None;
        }
        let mut result = 0u32;
        for _ in 0..n {
            let bit = self.read_bit()?;
            result = (result << 1) | (bit as u32);
        }
        Some(result)
    }

    pub fn read_ue(&mut self) -> Option<u32> {
        let mut zero_count = 0usize;
        while self.read_bit()? == 0 {
            zero_count += 1;
            if zero_count > 31 {
                return None; // Protect against overflow beyond u32
            }
        }
        if zero_count == 0 {
            return Some(0);
        }
        let info = self.read_bits(zero_count)?;
        let base = (1u32.checked_shl(zero_count as u32))?.checked_sub(1)?;
        base.checked_add(info)
    }

    pub fn read_se(&mut self) -> Option<i32> {
        let ue = self.read_ue()?;
        if ue & 1 == 1 {
            Some(((ue + 1) / 2) as i32)
        } else {
            Some(-((ue / 2) as i32))
        }
    }

    pub fn skip_bits(&mut self, n: usize) -> Option<()> {
        for _ in 0..n {
            self.read_bit()?;
        }
        Some(())
    }

    pub fn has_more_bits(&self) -> bool {
        self.byte_offset < self.data.len()
    }
}

// ============================================================================
// Emulation Prevention Unescaping (EBSP -> RBSP)
// ============================================================================

pub fn unescape_ebsp(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut i = 0;
    let len = data.len();

    while i < len {
        if i + 2 < len && data[i] == 0x00 && data[i + 1] == 0x00 && data[i + 2] == 0x03 {
            out.push(0x00);
            out.push(0x00);
            i += 3;
            // 0x03 was discarded (emulation prevention byte)
        } else {
            out.push(data[i]);
            i += 1;
        }
    }
    out
}

// ============================================================================
// H.264 SPS & Config Parsing
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct H264SpsInfo {
    pub profile_idc: u8,
    pub constraint_set_flags: u8,
    pub level_idc: u8,
    pub sps_id: u32,
    pub width: u32,
    pub height: u32,
    pub codec_string: String,
}

pub fn parse_h264_sps(sps_nal: &[u8]) -> Option<H264SpsInfo> {
    if sps_nal.len() < 4 {
        return None;
    }
    let nal_type = sps_nal[0] & 0x1F;
    if nal_type != 7 {
        return None;
    }

    let profile_idc = sps_nal[1];
    let constraint_set_flags = sps_nal[2];
    let level_idc = sps_nal[3];
    let codec_string = format!(
        "avc1.{:02x}{:02x}{:02x}",
        profile_idc, constraint_set_flags, level_idc
    );

    // Unescape EBSP starting after the 1-byte NAL header
    let rbsp = unescape_ebsp(&sps_nal[1..]);
    if rbsp.len() < 3 {
        return None;
    }

    // Skip the 3 bytes profile/constraint/level in RBSP and start bit reader at byte 3
    let mut reader = BitReader::new(&rbsp[3..]);
    let sps_id = reader.read_ue()?;

    let mut chroma_format_idc = 1u32; // Default 4:2:0
    if matches!(
        profile_idc,
        100 | 110 | 122 | 244 | 44 | 83 | 86 | 118 | 128 | 138 | 139 | 134 | 135
    ) {
        chroma_format_idc = reader.read_ue()?;
        if chroma_format_idc == 3 {
            reader.read_bit()?; // separate_colour_plane_flag
        }
        let _bit_depth_luma_minus8 = reader.read_ue()?;
        let _bit_depth_chroma_minus8 = reader.read_ue()?;
        reader.read_bit()?; // qpprime_y_zero_transform_bypass_flag
        let seq_scaling_matrix_present_flag = reader.read_bit()?;
        if seq_scaling_matrix_present_flag == 1 {
            let num_lists = if chroma_format_idc != 3 { 8 } else { 12 };
            for _ in 0..num_lists {
                let seq_scaling_list_present_flag = reader.read_bit()?;
                if seq_scaling_list_present_flag == 1 {
                    let size = 16;
                    let mut last_scale = 8i32;
                    let mut next_scale = 8i32;
                    for _ in 0..size {
                        if next_scale != 0 {
                            let delta_scale = reader.read_se()?;
                            next_scale = (last_scale + delta_scale + 256) % 256;
                        }
                        last_scale = if next_scale == 0 {
                            last_scale
                        } else {
                            next_scale
                        };
                    }
                }
            }
        }
    }

    let _log2_max_frame_num_minus4 = reader.read_ue()?;
    let pic_order_cnt_type = reader.read_ue()?;
    if pic_order_cnt_type == 0 {
        let _log2_max_pic_order_cnt_lsb_minus4 = reader.read_ue()?;
    } else if pic_order_cnt_type == 1 {
        let _delta_pic_order_always_zero_flag = reader.read_bit()?;
        let _offset_for_non_ref_pic = reader.read_se()?;
        let _offset_for_top_to_bottom_field = reader.read_se()?;
        let num_ref_frames_in_pic_order_cnt_cycle = reader.read_ue()?;
        for _ in 0..num_ref_frames_in_pic_order_cnt_cycle {
            let _offset_for_ref_frame = reader.read_se()?;
        }
    }

    let _max_num_ref_frames = reader.read_ue()?;
    let _gaps_in_frame_num_value_allowed_flag = reader.read_bit()?;
    let pic_width_in_mbs_minus1 = reader.read_ue()?;
    let pic_height_in_map_units_minus1 = reader.read_ue()?;
    let frame_mbs_only_flag = reader.read_bit()?;
    if frame_mbs_only_flag == 0 {
        let _mb_adaptive_frame_field_flag = reader.read_bit()?;
    }
    let _direct_8x8_inference_flag = reader.read_bit()?;

    let mut width = pic_width_in_mbs_minus1
        .checked_add(1)?
        .checked_mul(16)?;
    let height_multiplier = if frame_mbs_only_flag == 1 { 1 } else { 2 };
    let mut height = pic_height_in_map_units_minus1
        .checked_add(1)?
        .checked_mul(16)?
        .checked_mul(height_multiplier)?;

    let frame_cropping_flag = reader.read_bit()?;
    if frame_cropping_flag == 1 {
        let crop_left = reader.read_ue()?;
        let crop_right = reader.read_ue()?;
        let crop_top = reader.read_ue()?;
        let crop_bottom = reader.read_ue()?;

        let crop_unit_x = match chroma_format_idc {
            1 | 2 => 2,
            3 => 1,
            _ => 1,
        };
        let crop_unit_y = match chroma_format_idc {
            1 => 2 * height_multiplier,
            2 | 3 => 1 * height_multiplier,
            _ => 1 * height_multiplier,
        };

        let total_crop_x = (crop_left.checked_add(crop_right)?).checked_mul(crop_unit_x)?;
        let total_crop_y = (crop_top.checked_add(crop_bottom)?).checked_mul(crop_unit_y)?;

        width = width.saturating_sub(total_crop_x);
        height = height.saturating_sub(total_crop_y);
    }

    Some(H264SpsInfo {
        profile_idc,
        constraint_set_flags,
        level_idc,
        sps_id,
        width,
        height,
        codec_string,
    })
}

pub fn parse_h264_config(nals: &[&[u8]]) -> (String, Vec<u8>) {
    let mut sps_list: Vec<&[u8]> = Vec::new();
    let mut pps_list: Vec<&[u8]> = Vec::new();
    let mut codec = String::from("avc1.42001e");

    for nal in nals {
        if nal.is_empty() {
            continue;
        }
        let nal_type = nal[0] & 0x1F;
        if nal_type == 7 && nal.len() >= 4 {
            if let Some(sps_info) = parse_h264_sps(nal) {
                codec = sps_info.codec_string;
            } else {
                codec = format!("avc1.{:02x}{:02x}{:02x}", nal[1], nal[2], nal[3]);
            }
            sps_list.push(nal);
        } else if nal_type == 8 {
            pps_list.push(nal);
        }
    }

    let avcc = build_avcc_extradata(&sps_list, &pps_list);
    (codec, avcc)
}

pub fn build_avcc_extradata(sps_list: &[&[u8]], pps_list: &[&[u8]]) -> Vec<u8> {
    let valid_sps: Vec<&[u8]> = sps_list
        .iter()
        .copied()
        .filter(|s| s.len() >= 4 && (s[0] & 0x1F == 7))
        .collect();
    let valid_pps: Vec<&[u8]> = pps_list
        .iter()
        .copied()
        .filter(|p| !p.is_empty() && (p[0] & 0x1F == 8))
        .collect();

    if valid_sps.is_empty() {
        return Vec::new();
    }

    let sps = valid_sps[0];
    let num_sps = (valid_sps.len().min(31)) as u8;
    let mut out = Vec::with_capacity(64);
    out.push(1); // configurationVersion
    out.push(sps[1]); // AVCProfileIndication
    out.push(sps[2]); // profile_compatibility
    out.push(sps[3]); // AVCLevelIndication
    out.push(0xFF); // 6 bits reserved (111111b) + lengthSizeMinusOne (3 = 4 bytes)
    out.push(0xE0 | num_sps); // 3 bits reserved (111b) + numOfSequenceParameterSets

    for s in valid_sps.iter().take(num_sps as usize) {
        if s.len() > u16::MAX as usize {
            continue;
        }
        let len = s.len() as u16;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(s);
    }

    let num_pps = (valid_pps.len().min(255)) as u8;
    out.push(num_pps);
    for p in valid_pps.iter().take(num_pps as usize) {
        if p.len() > u16::MAX as usize {
            continue;
        }
        let len = p.len() as u16;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(p);
    }

    out
}

#[inline]
pub fn build_avcc(sps_list: &[&[u8]], pps_list: &[&[u8]]) -> Vec<u8> {
    build_avcc_extradata(sps_list, pps_list)
}

// ============================================================================
// H.265 (HEVC) SPS & Config Parsing
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct H265SpsInfo {
    pub profile_idc: u8,
    pub tier_flag: u8,
    pub level_idc: u8,
    pub compatibility_flags: u32,
    pub constraint_flags: [u8; 6],
    pub width: u32,
    pub height: u32,
    pub chroma_format_idc: u8,
    pub bit_depth_luma_minus8: u8,
    pub bit_depth_chroma_minus8: u8,
    pub codec_string: String,
}

pub fn parse_h265_sps(sps_nal: &[u8]) -> Option<H265SpsInfo> {
    if sps_nal.len() < 15 {
        return None;
    }
    let nal_type = (sps_nal[0] >> 1) & 0x3F;
    if nal_type != 33 {
        return None;
    }

    let rbsp = unescape_ebsp(&sps_nal[2..]);
    if rbsp.len() < 13 {
        return None;
    }

    let mut reader = BitReader::new(&rbsp);
    let _sps_video_parameter_set_id = reader.read_bits(4)?;
    let sps_max_sub_layers_minus1 = reader.read_bits(3)? as usize;
    let _sps_temporal_id_nesting_flag = reader.read_bit()?;

    // Profile Tier Level
    let _general_profile_space = reader.read_bits(2)?;
    let general_tier_flag = reader.read_bit()?;
    let general_profile_idc = reader.read_bits(5)? as u8;
    let general_profile_compatibility_flags = reader.read_bits(32)?;

    let mut constraint_flags = [0u8; 6];
    for b in &mut constraint_flags {
        *b = reader.read_bits(8)? as u8;
    }
    let general_level_idc = reader.read_bits(8)? as u8;

    // Sublayer flags if any
    let mut sub_layer_profile_present_flag = Vec::new();
    let mut sub_layer_level_present_flag = Vec::new();
    for _ in 0..sps_max_sub_layers_minus1 {
        sub_layer_profile_present_flag.push(reader.read_bit()?);
        sub_layer_level_present_flag.push(reader.read_bit()?);
    }
    if sps_max_sub_layers_minus1 > 0 {
        for _ in sps_max_sub_layers_minus1..8 {
            let _reserved_zero_2bits = reader.read_bits(2)?;
        }
    }
    for i in 0..sps_max_sub_layers_minus1 {
        if sub_layer_profile_present_flag.get(i).copied().unwrap_or(0) == 1 {
            let _sub_profile_space = reader.read_bits(2)?;
            let _sub_tier_flag = reader.read_bit()?;
            let _sub_profile_idc = reader.read_bits(5)?;
            let _sub_compat = reader.read_bits(32)?;
            let _sub_constraints = reader.skip_bits(48)?;
        }
        if sub_layer_level_present_flag.get(i).copied().unwrap_or(0) == 1 {
            let _sub_level_idc = reader.read_bits(8)?;
        }
    }

    let _sps_seq_parameter_set_id = reader.read_ue()?;
    let chroma_format_idc = reader.read_ue().unwrap_or(1) as u8;
    if chroma_format_idc == 3 {
        let _separate_colour_plane_flag = reader.read_bit()?;
    }
    let pic_width_in_luma_samples = reader.read_ue()?;
    let pic_height_in_luma_samples = reader.read_ue()?;

    let mut width = pic_width_in_luma_samples;
    let mut height = pic_height_in_luma_samples;

    let conformance_window_flag = reader.read_bit().unwrap_or(0);
    if conformance_window_flag == 1 {
        let conf_win_left_offset = reader.read_ue()?;
        let conf_win_right_offset = reader.read_ue()?;
        let conf_win_top_offset = reader.read_ue()?;
        let conf_win_bottom_offset = reader.read_ue()?;

        let sub_width_c = if chroma_format_idc == 1 || chroma_format_idc == 2 {
            2
        } else {
            1
        };
        let sub_height_c = if chroma_format_idc == 1 { 2 } else { 1 };

        let total_crop_x = (conf_win_left_offset.checked_add(conf_win_right_offset)?)
            .checked_mul(sub_width_c)?;
        let total_crop_y = (conf_win_top_offset.checked_add(conf_win_bottom_offset)?)
            .checked_mul(sub_height_c)?;

        width = width.saturating_sub(total_crop_x);
        height = height.saturating_sub(total_crop_y);
    }

    let bit_depth_luma_minus8 = reader.read_ue().unwrap_or(0) as u8;
    let bit_depth_chroma_minus8 = reader.read_ue().unwrap_or(0) as u8;

    let tier_str = if general_tier_flag == 1 { "H" } else { "L" };
    let mut hex_parts: Vec<String> = constraint_flags
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect();
    while hex_parts.last().map_or(false, |s| s == "00") && hex_parts.len() > 1 {
        hex_parts.pop();
    }
    let codec_string = format!(
        "hev1.{}.{:X}.{}{}.{}",
        general_profile_idc,
        general_profile_compatibility_flags.reverse_bits(),
        tier_str,
        general_level_idc,
        hex_parts.join(".")
    );

    Some(H265SpsInfo {
        profile_idc: general_profile_idc,
        tier_flag: general_tier_flag,
        level_idc: general_level_idc,
        compatibility_flags: general_profile_compatibility_flags,
        constraint_flags,
        width,
        height,
        chroma_format_idc,
        bit_depth_luma_minus8,
        bit_depth_chroma_minus8,
        codec_string,
    })
}

pub fn parse_h265_vps_sps_pps<'a>(
    nals: &[&'a [u8]],
) -> (Vec<&'a [u8]>, Vec<&'a [u8]>, Vec<&'a [u8]>) {
    let mut vps_list = Vec::new();
    let mut sps_list = Vec::new();
    let mut pps_list = Vec::new();

    for &nal in nals {
        if nal.len() < 2 {
            continue;
        }
        let nal_type = (nal[0] >> 1) & 0x3F;
        match nal_type {
            32 => vps_list.push(nal),
            33 => sps_list.push(nal),
            34 => pps_list.push(nal),
            _ => {}
        }
    }

    (vps_list, sps_list, pps_list)
}

pub fn parse_h265_config(nals: &[&[u8]]) -> (String, Vec<u8>) {
    let (vps_list, sps_list, pps_list) = parse_h265_vps_sps_pps(nals);
    let mut codec = String::from("hev1.1.6.L93.B0");

    for sps in &sps_list {
        if let Some(sps_info) = parse_h265_sps(sps) {
            codec = sps_info.codec_string;
            break;
        } else if let Some(fallback) = build_hevc_codec_string_fallback(sps) {
            codec = fallback;
            break;
        }
    }

    let hvcc = build_hvcc_extradata(&vps_list, &sps_list, &pps_list);
    (codec, hvcc)
}

fn build_hevc_codec_string_fallback(sps: &[u8]) -> Option<String> {
    if sps.len() < 15 {
        return None;
    }
    let ptl = 2;
    let profile_byte = sps[ptl + 1];
    let profile_idc = profile_byte & 0x1F;
    let tier_flag = (profile_byte >> 5) & 0x01;
    let compat = u32::from_be_bytes([sps[ptl + 2], sps[ptl + 3], sps[ptl + 4], sps[ptl + 5]]);
    let level_idc = sps[ptl + 12];
    let tier = if tier_flag == 1 { "H" } else { "L" };
    let constraints = sps.get(ptl + 6..ptl + 12)?;
    let mut hex_parts: Vec<String> = constraints.iter().map(|b| format!("{:02X}", b)).collect();
    while hex_parts.last().map_or(false, |s| s == "00") && hex_parts.len() > 1 {
        hex_parts.pop();
    }
    Some(format!(
        "hev1.{}.{:X}.{}{}.{}",
        profile_idc,
        compat.reverse_bits(),
        tier,
        level_idc,
        hex_parts.join(".")
    ))
}

pub fn build_hvcc_extradata(
    vps_list: &[&[u8]],
    sps_list: &[&[u8]],
    pps_list: &[&[u8]],
) -> Vec<u8> {
    let valid_vps: Vec<&[u8]> = vps_list
        .iter()
        .copied()
        .filter(|v| v.len() >= 2 && (((v[0] >> 1) & 0x3F) == 32))
        .collect();
    let valid_sps: Vec<&[u8]> = sps_list
        .iter()
        .copied()
        .filter(|s| s.len() >= 15 && (((s[0] >> 1) & 0x3F) == 33))
        .collect();
    let valid_pps: Vec<&[u8]> = pps_list
        .iter()
        .copied()
        .filter(|p| p.len() >= 2 && (((p[0] >> 1) & 0x3F) == 34))
        .collect();

    if valid_sps.is_empty() {
        return Vec::new();
    }

    let sps = valid_sps[0];
    let sps_info = parse_h265_sps(sps);

    let (profile_byte, compat_bytes, constraint_bytes, level_idc, chroma_idc, bit_depth_luma, bit_depth_chroma) =
        if let Some(info) = &sps_info {
            let p_byte = (info.tier_flag << 5) | (info.profile_idc & 0x1F);
            (
                p_byte,
                info.compatibility_flags.to_be_bytes(),
                info.constraint_flags,
                info.level_idc,
                0xFC | (info.chroma_format_idc & 0x03),
                0xF8 | (info.bit_depth_luma_minus8 & 0x07),
                0xF8 | (info.bit_depth_chroma_minus8 & 0x07),
            )
        } else {
            let ptl = 2;
            let p_byte = sps[ptl + 1];
            let mut compat = [0u8; 4];
            compat.copy_from_slice(&sps[ptl + 2..ptl + 6]);
            let mut constr = [0u8; 6];
            constr.copy_from_slice(&sps[ptl + 6..ptl + 12]);
            let lvl = sps[ptl + 12];
            (p_byte, compat, constr, lvl, 0xFD, 0xF8, 0xF8)
        };

    let mut out = Vec::with_capacity(128);
    out.push(1); // configurationVersion
    out.push(profile_byte); // general_profile_space + tier_flag + profile_idc
    out.extend_from_slice(&compat_bytes); // general_profile_compatibility_flags
    out.extend_from_slice(&constraint_bytes); // general_constraint_indicator_flags
    out.push(level_idc); // general_level_idc
    out.extend_from_slice(&[0xF0, 0x00]); // min_spatial_segmentation_idc (reserved + 0)
    out.push(0xFC); // parallelismType (reserved + 0)
    out.push(chroma_idc); // chromaFormatIdc (reserved + 1 = 4:2:0)
    out.push(bit_depth_luma); // bitDepthLumaMinus8 (reserved + 0 = 8-bit)
    out.push(bit_depth_chroma); // bitDepthChromaMinus8 (reserved + 0 = 8-bit)
    out.extend_from_slice(&[0x00, 0x00]); // avgFrameRate = 0
    out.push(0x03); // constantFrameRate(0) + numTemporalLayers(0) + temporalIdNested(0) + lengthSizeMinusOne(3)

    let arrays: &[(&[&[u8]], u8)] = &[
        (&valid_vps, 32),
        (&valid_sps, 33),
        (&valid_pps, 34),
    ];
    let num_arrays = arrays.iter().filter(|(list, _)| !list.is_empty()).count();
    out.push(num_arrays as u8);

    for (list, nal_type) in arrays {
        if list.is_empty() {
            continue;
        }
        out.push(0x80 | nal_type); // array_completeness=1 + reserved=0 + NAL_unit_type
        let num_nalus = list.len().min(u16::MAX as usize) as u16;
        out.extend_from_slice(&num_nalus.to_be_bytes());
        for nalu in list.iter().take(num_nalus as usize) {
            if nalu.len() > u16::MAX as usize {
                continue;
            }
            let nalu_len = nalu.len() as u16;
            out.extend_from_slice(&nalu_len.to_be_bytes());
            out.extend_from_slice(nalu);
        }
    }

    out
}

#[inline]
pub fn build_hvcc(vps_list: &[&[u8]], sps_list: &[&[u8]], pps_list: &[&[u8]]) -> Vec<u8> {
    build_hvcc_extradata(vps_list, sps_list, pps_list)
}

// ============================================================================
// NAL Unit Demuxing & AVCC Packing
// ============================================================================

pub fn split_nal_units(data: &[u8]) -> Vec<&[u8]> {
    let mut nals = Vec::new();
    let len = data.len();
    if len == 0 {
        return nals;
    }

    let mut sc_positions: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;

    while i + 2 < len {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            let (pos, sc_len) = if i > 0 && data[i - 1] == 0 {
                (i - 1, 4)
            } else {
                (i, 3)
            };
            sc_positions.push((pos, sc_len));
            i += 3;
        } else {
            i += 1;
        }
    }

    if sc_positions.is_empty() {
        // If data contains no start code but has non-zero content, treat as single NAL
        if !data.iter().all(|&b| b == 0) {
            nals.push(data);
        }
        return nals;
    }

    for (idx, &(pos, sc_len)) in sc_positions.iter().enumerate() {
        let nal_start = pos + sc_len;
        let nal_end = if idx + 1 < sc_positions.len() {
            sc_positions[idx + 1].0
        } else {
            len
        };

        if nal_start < nal_end && nal_end <= len {
            let nal = &data[nal_start..nal_end];
            if !nal.is_empty() {
                nals.push(nal);
            }
        }
    }

    nals
}

#[inline]
pub fn split_nals(data: &[u8]) -> Vec<&[u8]> {
    split_nal_units(data)
}

pub fn nals_to_avcc(data: &[u8]) -> Vec<u8> {
    let nals = split_nal_units(data);
    let mut out = Vec::with_capacity(data.len() + nals.len() * 4);
    for nal in nals {
        if nal.is_empty() {
            continue;
        }
        if nal.len() > u32::MAX as usize {
            continue;
        }
        let len = nal.len() as u32;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(nal);
    }
    out
}
