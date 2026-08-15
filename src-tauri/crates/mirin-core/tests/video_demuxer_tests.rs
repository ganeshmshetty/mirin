use mirin_core::scrcpy::video::{
    build_avcc, build_avcc_extradata, build_hvcc, build_hvcc_extradata, nals_to_avcc,
    parse_h264_config, parse_h264_sps, parse_h265_config, parse_h265_sps, parse_h265_vps_sps_pps,
    split_nal_units, split_nals, unescape_ebsp, BitReader, VideoCodec,
};

#[test]
fn test_split_nals_empty_and_all_zeros() {
    assert!(split_nal_units(&[]).is_empty());
    assert!(split_nal_units(&[0x00]).is_empty());
    assert!(split_nal_units(&[0x00, 0x00]).is_empty());
    assert!(split_nal_units(&[0x00, 0x00, 0x00, 0x00]).is_empty());
    assert!(split_nals(&[]).is_empty());
}

#[test]
fn test_split_nals_start_code_without_payload() {
    assert!(split_nal_units(&[0x00, 0x00, 0x01]).is_empty());
    assert!(split_nal_units(&[0x00, 0x00, 0x00, 0x01]).is_empty());
    assert!(split_nal_units(&[0x00, 0x00, 0x01, 0x00, 0x00, 0x01]).is_empty());
    assert!(split_nal_units(&[0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01]).is_empty());
}

#[test]
fn test_split_nals_single_nal_3byte_and_4byte_prefixes() {
    // 3-byte prefix
    let stream3 = [0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x1E];
    let nals3 = split_nal_units(&stream3);
    assert_eq!(nals3.len(), 1);
    assert_eq!(nals3[0], &[0x67, 0x42, 0x00, 0x1E]);

    // 4-byte prefix
    let stream4 = [0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x1E];
    let nals4 = split_nal_units(&stream4);
    assert_eq!(nals4.len(), 1);
    assert_eq!(nals4[0], &[0x67, 0x42, 0x00, 0x1E]);

    // 5-byte prefix (extra leading zeros)
    let stream5 = [0x00, 0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x1E];
    let nals5 = split_nal_units(&stream5);
    assert_eq!(nals5.len(), 1);
    assert_eq!(nals5[0], &[0x67, 0x42, 0x00, 0x1E]);
}

#[test]
fn test_split_nals_mixed_prefixes_and_single_byte_nals() {
    let mut stream = Vec::new();
    // AUD NAL (type 9) with 3-byte prefix: 1 byte payload
    stream.extend_from_slice(&[0x00, 0x00, 0x01, 0x09]);
    // SPS NAL (type 7) with 4-byte prefix
    stream.extend_from_slice(&[0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x1E]);
    // PPS NAL (type 8) with 3-byte prefix
    stream.extend_from_slice(&[0x00, 0x00, 0x01, 0x68, 0xCE, 0x38, 0x80]);
    // IDR slice (type 5) with 4-byte prefix
    stream.extend_from_slice(&[0x00, 0x00, 0x00, 0x01, 0x65, 0x88, 0x84, 0x00, 0x10]);

    let nals = split_nal_units(&stream);
    assert_eq!(nals.len(), 4);
    assert_eq!(nals[0], &[0x09]);
    assert_eq!(nals[1], &[0x67, 0x42, 0x00, 0x1E]);
    assert_eq!(nals[2], &[0x68, 0xCE, 0x38, 0x80]);
    assert_eq!(nals[3], &[0x65, 0x88, 0x84, 0x00, 0x10]);
}

#[test]
fn test_split_nals_missing_start_code() {
    let raw = [0x67, 0x42, 0x00, 0x1E, 0x99];
    let nals = split_nal_units(&raw);
    assert_eq!(nals.len(), 1);
    assert_eq!(nals[0], &raw);
}

#[test]
fn test_bit_reader_and_exp_golomb() {
    // Binary: 1 010 011 00100 00101
    // Values: ue(0)=1, ue(1)=010, ue(2)=011, ue(3)=00100, ue(4)=00101
    // Packed into bytes:
    // 1 010 011 0 = 0xA6 (10100110)
    // 0100 0010 = 0x42 (01000010)
    // 1 0000000 = 0x80 (10000000)
    let data = [0xA6, 0x42, 0x80];
    let mut reader = BitReader::new(&data);

    assert_eq!(reader.read_ue(), Some(0));
    assert_eq!(reader.read_ue(), Some(1));
    assert_eq!(reader.read_ue(), Some(2));
    assert_eq!(reader.read_ue(), Some(3));
    assert_eq!(reader.read_ue(), Some(4));
    assert!(!reader.has_more_bits() || reader.read_bit() == Some(0));
}

#[test]
fn test_bit_reader_se_signed() {
    // ue(0) -> se(0)
    // ue(1) -> se(1)
    // ue(2) -> se(-1)
    // ue(3) -> se(2)
    // ue(4) -> se(-2)
    let data = [0xA6, 0x42, 0x80];
    let mut reader = BitReader::new(&data);

    assert_eq!(reader.read_se(), Some(0));
    assert_eq!(reader.read_se(), Some(1));
    assert_eq!(reader.read_se(), Some(-1));
    assert_eq!(reader.read_se(), Some(2));
    assert_eq!(reader.read_se(), Some(-2));
}

#[test]
fn test_bit_reader_truncated_safe() {
    let data = [0x00]; // Too few bits for large ue
    let mut reader = BitReader::new(&data);
    assert_eq!(reader.read_ue(), None); // Does not panic, returns None
}

#[test]
fn test_unescape_ebsp() {
    // 00 00 03 01 -> 00 00 01
    let ebsp = [0x00, 0x00, 0x03, 0x01, 0x02, 0x00, 0x00, 0x03, 0x00];
    let rbsp = unescape_ebsp(&ebsp);
    assert_eq!(rbsp, vec![0x00, 0x00, 0x01, 0x02, 0x00, 0x00, 0x00]);

    // No emulation prevention byte
    let plain = [0x01, 0x02, 0x03, 0x04];
    assert_eq!(unescape_ebsp(&plain), plain);

    // Trailing 00 00 03
    let trailing = [0x00, 0x00, 0x03];
    assert_eq!(unescape_ebsp(&trailing), vec![0x00, 0x00]);
}

#[test]
fn test_parse_h264_sps_real_stream() {
    // Real 1080x1920 H264 SPS: profile Baseline 66 (0x42), constraint 0x00, level 30 (0x1e)
    // pic_width_in_mbs_minus1 = 67 (1088 px)
    // pic_height_in_map_units_minus1 = 119 (1920 px)
    // crop_bottom = 4 (1088 - 8 = 1080)
    let sps_nal = [
        0x67, 0x42, 0x00, 0x1E, 0x9A, 0x74, 0x05, 0x81, 0xEC, 0x80, 0x00, 0x00, 0x03, 0x00,
        0x80, 0x00, 0x00, 0x1E, 0x07, 0x8C, 0x18, 0xCD,
    ];

    let info = parse_h264_sps(&sps_nal);
    assert!(info.is_some());
    let info = info.unwrap();
    assert_eq!(info.profile_idc, 0x42);
    assert_eq!(info.constraint_set_flags, 0x00);
    assert_eq!(info.level_idc, 0x1E);
    assert_eq!(info.codec_string, "avc1.42001e");
}

#[test]
fn test_parse_h264_sps_truncated_and_invalid() {
    assert_eq!(parse_h264_sps(&[]), None);
    assert_eq!(parse_h264_sps(&[0x67]), None);
    assert_eq!(parse_h264_sps(&[0x67, 0x42]), None);
    assert_eq!(parse_h264_sps(&[0x67, 0x42, 0x00]), None);
    // Wrong nal_type (8 is PPS)
    assert_eq!(parse_h264_sps(&[0x68, 0x42, 0x00, 0x1E]), None);
}

#[test]
fn test_build_avcc_extradata() {
    let sps = [0x67, 0x42, 0x00, 0x1E, 0x9A, 0x74];
    let pps = [0x68, 0xCE, 0x38, 0x80];

    let avcc = build_avcc_extradata(&[&sps], &[&pps]);
    assert!(!avcc.is_empty());
    assert_eq!(avcc[0], 1); // version
    assert_eq!(avcc[1], 0x42); // profile
    assert_eq!(avcc[2], 0x00); // compat
    assert_eq!(avcc[3], 0x1E); // level
    assert_eq!(avcc[4], 0xFF); // 6 reserved bits + 3 (4-byte NAL size)
    assert_eq!(avcc[5], 0xE1); // 1 SPS
    // SPS length (2 bytes big endian)
    let sps_len = u16::from_be_bytes([avcc[6], avcc[7]]);
    assert_eq!(sps_len as usize, sps.len());
    assert_eq!(&avcc[8..8 + sps.len()], &sps);

    // Number of PPS
    let pps_offset = 8 + sps.len();
    assert_eq!(avcc[pps_offset], 1);
    let pps_len = u16::from_be_bytes([avcc[pps_offset + 1], avcc[pps_offset + 2]]);
    assert_eq!(pps_len as usize, pps.len());
    assert_eq!(&avcc[pps_offset + 3..pps_offset + 3 + pps.len()], &pps);
}

#[test]
fn test_build_avcc_extradata_empty_and_corrupt() {
    // Empty SPS list must return empty Vec
    assert!(build_avcc_extradata(&[], &[]).is_empty());
    assert!(build_avcc(&[], &[]).is_empty());

    // Truncated SPS (< 4 bytes) filtered out
    let bad_sps = [0x67, 0x42];
    assert!(build_avcc_extradata(&[&bad_sps], &[]).is_empty());

    // Non-SPS NAL in sps_list filtered out
    let not_sps = [0x68, 0x42, 0x00, 0x1E];
    assert!(build_avcc_extradata(&[&not_sps], &[]).is_empty());
}

#[test]
fn test_parse_h264_config() {
    let sps = [0x67, 0x64, 0x00, 0x28, 0xAC, 0xD9];
    let pps = [0x68, 0xEE, 0x38, 0x80];

    let (codec, desc) = parse_h264_config(&[&sps, &pps]);
    assert_eq!(codec, "avc1.640028");
    assert!(!desc.is_empty());
    assert_eq!(desc[0], 1);
}

#[test]
fn test_parse_h265_vps_sps_pps_and_config() {
    // H.265 VPS (nal_type 32 = (0x40 >> 1) & 0x3F)
    let vps = [0x40, 0x01, 0x0C, 0x01, 0xFF, 0xFF];
    // H.265 SPS (nal_type 33 = (0x42 >> 1) & 0x3F): Main profile (1), tier 0, compat flags 0x60000000
    let sps = [
        0x42, 0x01, 0x01, 0x01, 0x60, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03,
        0x00, 0x00, 0x5D, 0xA0, 0x02, 0x80, 0x80, 0x2D, 0x16, 0x59, 0x99,
    ];
    // H.265 PPS (nal_type 34 = (0x44 >> 1) & 0x3F)
    let pps = [0x44, 0x01, 0xC0, 0xF3, 0xC0];

    let (vps_list, sps_list, pps_list) = parse_h265_vps_sps_pps(&[&vps, &sps, &pps]);
    assert_eq!(vps_list.len(), 1);
    assert_eq!(sps_list.len(), 1);
    assert_eq!(pps_list.len(), 1);

    let (codec, hvcc) = parse_h265_config(&[&vps, &sps, &pps]);
    // Corrected codec string: profile 1, bit-reversed compat 0x60000000 -> 6,
    // tier L, level 160, constraint bytes dot-joined "00.00.00.00.00.5D".
    assert_eq!(codec, "hev1.1.6.L160.00.00.00.00.00.5D");
    assert!(!hvcc.is_empty());
    assert_eq!(hvcc[0], 1); // configurationVersion
}

#[test]
fn test_parse_h265_sps_truncated_and_corrupt() {
    assert_eq!(parse_h265_sps(&[]), None);
    assert_eq!(parse_h265_sps(&[0x42, 0x01, 0x01]), None);
    // Wrong nal_type (32 is VPS, not SPS)
    assert_eq!(parse_h265_sps(&[0x40, 0x01, 0x01, 0x01, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5D]), None);
}

#[test]
fn test_build_hvcc_extradata_empty_and_corrupt() {
    assert!(build_hvcc_extradata(&[], &[], &[]).is_empty());
    assert!(build_hvcc(&[], &[], &[]).is_empty());

    // Too short SPS (< 15 bytes)
    let short_sps = [0x42, 0x01, 0x01, 0x02];
    assert!(build_hvcc_extradata(&[], &[&short_sps], &[]).is_empty());
}

#[test]
fn test_nals_to_avcc() {
    let sps = [0x67, 0x42, 0x00, 0x1E];
    let pps = [0x68, 0xCE, 0x38, 0x80];

    let mut stream = Vec::new();
    stream.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
    stream.extend_from_slice(&sps);
    stream.extend_from_slice(&[0x00, 0x00, 0x01]);
    stream.extend_from_slice(&pps);

    let avcc = nals_to_avcc(&stream);
    assert_eq!(avcc.len(), 4 + sps.len() + 4 + pps.len());

    let len1 = u32::from_be_bytes([avcc[0], avcc[1], avcc[2], avcc[3]]) as usize;
    assert_eq!(len1, sps.len());
    assert_eq!(&avcc[4..4 + len1], &sps);

    let offset2 = 4 + len1;
    let len2 = u32::from_be_bytes([
        avcc[offset2],
        avcc[offset2 + 1],
        avcc[offset2 + 2],
        avcc[offset2 + 3],
    ]) as usize;
    assert_eq!(len2, pps.len());
    assert_eq!(&avcc[offset2 + 4..offset2 + 4 + len2], &pps);
}

#[test]
fn test_video_codec_from_str() {
    assert_eq!(VideoCodec::from_str("h264"), VideoCodec::H264);
    assert_eq!(VideoCodec::from_str("H264"), VideoCodec::H264);
    assert_eq!(VideoCodec::from_str("avc"), VideoCodec::H264);
    assert_eq!(VideoCodec::from_str("h265"), VideoCodec::H265);
    assert_eq!(VideoCodec::from_str("H265"), VideoCodec::H265);
    assert_eq!(VideoCodec::from_str("hevc"), VideoCodec::H265);
    assert_eq!(VideoCodec::H264.as_str(), "h264");
    assert_eq!(VideoCodec::H265.as_str(), "h265");
}
