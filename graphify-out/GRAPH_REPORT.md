# Graph Report - .  (2026-07-17)

## Corpus Check
- 228 files · ~387,597 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1044 nodes · 1901 edges · 97 communities (82 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]

## God Nodes (most connected - your core abstractions)
1. `Adb` - 48 edges
2. `EmbeddedScrcpyState` - 24 edges
3. `make_mock_adb()` - 22 edges
4. `get_saved_devices_impl()` - 19 edges
5. `UiExtractor` - 17 edges
6. `compilerOptions` - 16 edges
7. `save_device_impl()` - 16 edges
8. `DeviceRegistry` - 16 edges
9. `ScreenshotRegistry` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Mirin Application Root` --semantically_similar_to--> `Mirin`  [INFERRED] [semantically similar]
  index.html → CONTEXT.md
- `Device Connection Testing` --semantically_similar_to--> `Wireless Pairing`  [INFERRED] [semantically similar]
  todo.md → README.md
- `Settings Testing` --semantically_similar_to--> `Advanced Mirror Profiles`  [INFERRED] [semantically similar]
  todo.md → ROADMAP.md
- `MCP Tools Testing` --semantically_similar_to--> `Mirroring MCP Tools`  [INFERRED] [semantically similar]
  todo.md → ROADMAP.md
- `start_logcat()` --references--> `State`  [EXTRACTED]
  src-tauri/src/commands/console.rs → src/components/ErrorBoundary.tsx

## Import Cycles
- 1-file cycle: `src-tauri/src/commands/scrcpy.rs -> src-tauri/src/commands/scrcpy.rs`

## Hyperedges (group relationships)
- **MCP Agent Device Control** — roadmap_mcp_server_integration, roadmap_mcp_tools, roadmap_capture_utilities [EXTRACTED 1.00]
- **Device Reliability Testing** — todo_mcp_tools_testing, todo_device_connection_testing, todo_adb_server_management [INFERRED 0.85]
- **Device Management UI** — mirin_website_public_hero_screenshot_device_dashboard, mirin_website_public_hero_screenshot_device_connection_status, mirin_website_public_hero_screenshot_mirror_action, mirin_website_public_hero_screenshot_quick_mirror [EXTRACTED 1.00]
- **Streaming Configuration UI** — mirin_website_public_setup_config_screenshot_quality_performance_settings, mirin_website_public_setup_config_screenshot_streaming_quality_presets, mirin_website_public_setup_config_screenshot_streaming_resolution, mirin_website_public_setup_config_screenshot_streaming_bitrate, mirin_website_public_setup_config_screenshot_max_fps [EXTRACTED 1.00]

## Communities (97 total, 15 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (33): Adb, AdbDevice, MdnsService, read_response(), Child, Option, PathBuf, Result (+25 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (43): DeviceConnection, DeviceStatus, HashSet, ConnectionType, Device, DeviceConnection, DeviceRegistry, DeviceStatus (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (33): Channel, EmbeddedStreamSettings, FrameEvent, State, check_available(), EmbeddedScrcpyState, EmbeddedSessionInfo, get_version() (+25 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (30): Sender, AppHandle, Arc, HashMap, R, Result, Self, String (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (31): dependencies, lucide-react, react, react-dom, react-router-dom, @tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-opener (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (24): get_auth_token_path(), McpBridge, McpBridge<R>, AppHandle, Arc, OpenMirrorWindowCallback, Option, PathBuf (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (27): dependencies, gsap, @gsap/react, lenis, lucide-react, next, react, react-dom (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (18): DeviceTable(), DeviceTableProps, EmbeddedMirrorViewProps, useInputDialog(), IPInputDialogProps, MirrorButton(), MirrorButtonProps, WirelessSetupWizardProps (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (20): capture_fallback(), digit_bitmap(), Option, PathBuf, Result, String, Vec, ScreenshotResult (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (20): Box, Future, Output, Pin, Send, parse_clipboard_parcel(), AppHandle, Arc (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (21): make_mock_adb(), Path, test_connect_already_connected(), test_connect_refused(), test_devices_empty(), test_devices_mixed_states(), test_devices_offline(), test_devices_unauthorized() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (20): F, build_avcc(), build_hevc_codec_string(), build_hvcc(), forward_loop(), FrameEvent, nals_to_avcc(), parse_h264_config() (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.28
Nodes (22): connect_wireless_device(), DeviceDetails, disconnect_device(), enable_wireless_mode(), forget_device(), get_connected_devices(), get_device_details(), get_mdns_services() (+14 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (13): ConnectDeviceModal(), ConnectDeviceModalProps, EmbeddedMirrorPopup(), DeviceRailInfo, deviceTools, Sidebar(), SidebarProps, Step (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (16): SettingsPanel(), SettingsPanelProps, TabType, Theme, ThemeContext, ThemeContextType, ThemeProvider(), useTheme() (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (15): AppManager(), AppManagerProps, useDebouncedValue(), ConsoleManager(), ConsoleManagerProps, EmbeddedMirrorView(), FileManager(), useToast() (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (19): app, macOSPrivateApi, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (15): Settings, clear_app_cache(), clear_directory_contents(), dir_size(), format_bytes(), get_settings_path(), load_settings(), remove_path() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (6): FileManagerProps, consoleService, LogcatPayload, fileService, mcpService, FileInfo

### Community 21 - "Community 21"
Cohesion: 0.36
Nodes (14): AppInfo, clear_app_data_impl(), install_app_impl(), launch_app_impl(), list_apps_impl(), parse_package_list(), PathBuf, Result (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (16): anyOf, description, definitions, Application, Number, PermissionEntry, ShellScopeEntryAllowedArg, Target (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (16): anyOf, description, definitions, Application, Number, PermissionEntry, ShellScopeEntryAllowedArg, Target (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.27
Nodes (13): JoinHandle, execute_shell_command(), LogcatPayload, LogcatState, AppHandle, Arc, HashMap, Mutex (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (10): ConfirmDialogContext, ConfirmDialogContextType, ConfirmDialogOptions, ConfirmDialogProvider(), ConfirmDialogProviderProps, DialogState, useConfirmDialog(), SavedDevicesList() (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (11): MirrorStatus, UseMirrorDecoderProps, ConnectionType, Device, DeviceConnection, DeviceStatus, EmbeddedStreamSettings, FrameEvent (+3 more)

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (12): create_directory_impl(), delete_file_impl(), FileInfo, list_files_impl(), normalize_device_path(), pull_file_impl(), push_file_impl(), PathBuf (+4 more)

### Community 28 - "Community 28"
Cohesion: 0.36
Nodes (14): action_from_str(), build_touch_msg(), get_clipboard(), inject_keycode(), inject_scroll(), inject_text(), inject_touch(), rotate_device() (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.60
Nodes (12): get_adb_dir(), get_adb_path(), get_platform_subpath(), get_resource_base_path(), get_scrcpy_dir(), get_scrcpy_path(), get_scrcpy_server_path(), AppHandle (+4 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (13): properties, Identifier, description, oneOf, type, default, description, type (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (13): properties, Identifier, description, oneOf, type, default, description, type (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.41
Nodes (11): AppInfo, clear_app_data(), install_app(), launch_app(), list_apps(), AppHandle, Result, String (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.42
Nodes (10): FileInfo, create_directory(), delete_file(), list_files(), pull_file(), push_file(), AppHandle, Result (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (8): Toast(), ToastProps, ToastType, typeConfig, ToastContext, ToastContextType, ToastMessage, ToastProvider()

### Community 35 - "Community 35"
Cohesion: 0.38
Nodes (8): load_settings_impl(), Default, PathBuf, Result, Self, String, save_settings_impl(), Settings

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (10): $ref, description, items, type, uniqueItems, description, items, type (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (10): type, webviews, windows, items, description, items, type, description (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (10): $ref, description, items, type, uniqueItems, description, items, type (+2 more)

### Community 39 - "Community 39"
Cohesion: 0.20
Nodes (10): type, webviews, windows, items, description, items, type, description (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.25
Nodes (8): description, properties, required, type, CapabilityRemote, urls, description, type

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (8): description, properties, required, type, CapabilityRemote, urls, description, type

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (4): geistMono, inter, metadata, SmoothScrollProvider()

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (6): DialogState, InputDialogContext, InputDialogContextType, InputDialogOptions, InputDialogProvider(), InputDialogProviderProps

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (6): Mirin, scrcpy, Session Management, Wireless Pairing, Device Connection Testing, Performance Improvements

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 48 - "Community 48"
Cohesion: 0.40
Nodes (5): Mirin, Service Layer Pattern, Tauri IPC, Type Safety Bridge, Mirin Application Root

### Community 49 - "Community 49"
Cohesion: 0.40
Nodes (5): Maximum FPS, Quality and Performance Settings, Streaming Bitrate, Streaming Quality Presets, Streaming Resolution

### Community 53 - "Community 53"
Cohesion: 0.40
Nodes (4): anyOf, description, $schema, title

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (4): anyOf, description, $schema, title

### Community 56 - "Community 56"
Cohesion: 0.50
Nodes (4): Capture Utilities, MCP Server Integration, Mirroring MCP Tools, MCP Tools Testing

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (4): description, required, type, Capability

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (4): default, description, type, description

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (4): description, required, type, Capability

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (4): default, description, type, description

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (3): Homebrew Tap Update, Multi-Platform Release, Release Workflow

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (3): Next.js Version Guidance, Agent Rules Reference, Next.js Website

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (3): Device Connection Status, Device Dashboard, Mirror Action

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (3): Advanced Mirror Profiles, Audio Forwarding, Settings Testing

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (3): ShellScopeEntryAllowedArgs, anyOf, description

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (3): Value, anyOf, description

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (3): ShellScopeEntryAllowedArgs, anyOf, description

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): Value, anyOf, description

## Knowledge Gaps
- **282 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+277 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `State` connect `Community 2` to `Community 40`, `Community 24`, `Community 3`, `Community 12`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Why does `Adb` connect `Community 0` to `Community 8`, `Community 9`, `Community 10`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `EmbeddedScrcpyState` connect `Community 2` to `Community 9`, `Community 5`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _285 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09109730848861283 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10505050505050505 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1173054587688734 - nodes in this community are weakly interconnected._