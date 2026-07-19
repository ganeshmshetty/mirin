# Mirin — Testing & Hardening Plan

---

## 1. MCP Tools

### Setup & Teardown

- [ ] `list_devices` — verify connected devices show up
- [ ] `connect_device` — basic connect (with serial)
- [ ] `connect_device` — without serial (relies on persistent state)
- [ ] `connect_device` — twice (should reuse existing session)
- [ ] `connect_device` — with `popup: true` (opens mirror window)
- [ ] `disconnect_device` — clean disconnect
- [ ] `disconnect_device` — when not connected (should error gracefully)

### Screen / UI

- [ ] `get_screen` — default (sanitized tree with `[id]` badges)
- [ ] `get_screen` — `raw: true` (full uiautomator XML)
- [ ] `get_screenshot` — plain screenshot
- [ ] `get_screenshot` — `annotate: true` (numbered bounding boxes)
- [ ] `find_element` — by text (exact match), substring, numeric ID, `[id]` bracket format, content-desc, resource-id
- [ ] `find_element` — non-existent selector (error)

### Touch / Input

- [ ] `tap` — by selector, absolute x/y, normalized x/y, invalid coords (clamp)
- [ ] `long_press` — by selector, custom duration_ms
- [ ] `swipe` — start/end coords, normalized, from selector center
- [ ] `drag` — same as swipe but verify 200ms hold
- [ ] `scroll_to` — up, down, selector never visible (max_swipes hit)
- [ ] `type_text` — plain text, special chars, empty (skip), >10k chars (error)
- [ ] `press_key` — HOME (3), BACK (4), ENTER (66), keycode >300 (error)
- [ ] `hide_keyboard` — with keyboard open, without (harmless)

### Clipboard

- [ ] `clipboard` — get/set with active scrcpy session
- [ ] `clipboard` — get/set without session (ADB fallback)
- [ ] `clipboard` — set on MIUI/encrypted (graceful failure)
- [ ] `clipboard` — missing `action` param (error), set with empty text

### Device Settings & Apps

- [ ] `set_orientation` — portrait, landscape, invalid value (error)
- [ ] `list_apps` — third_party_only true/false
- [ ] `launch_app` — by package (auto-resolve), with explicit activity, non-existent package
- [ ] `stop_app` — running, non-running (harmless)
- [ ] `get_current_activity` — with app open, home screen
- [ ] `grant_permission` / `revoke_permission` — valid permission, invalid (error)
- [ ] `handle_dialog` — accept, dismiss, no dialog visible
- [ ] `get_logcat` — default, custom lines, package_filter, tag_filter, both

### Scripts

- [ ] `run_script` — tap → type_text → press_key sequence
- [ ] `run_script` — swipe/drag step (x/y → start_x/start_y mapping)
- [ ] `run_script` — step fails (aborts with step error)
- [ ] `run_script` — empty steps (error), >50 steps (error)

### Edge Cases

- [ ] All tools with explicit serial override, without serial (no device connected), non-existent serial
- [ ] Missing required params, invalid param types, empty strings rejected
- [ ] Two devices — connect to first, verify tools use it, switch to second
- [ ] Concurrent calls (rapid taps, overlapping scripts)
- [ ] Popup window: stop button, OS close, reopen after close
- [ ] Reconnect after disconnect

---

## 2. Settings

### UI & Navigation

- [ ] Navigate to Settings page, back button returns
- [ ] All sections render: General, Scrcpy, MCP Server
- [ ] Toggle switches, sliders, dropdowns render with current values
- [ ] Reset to defaults button works

### General

- [ ] Theme: light → dark → system, persists on reload
- [ ] Always on Top: toggle on (stays above), toggle off (normal)
- [ ] Stay Awake: toggle on (device doesn't sleep during mirroring)
- [ ] Storage path shown (if applicable)

### Scrcpy

- [ ] Resolution presets (Performance / Balanced / High Quality) and custom
- [ ] Bitrate slider updates displayed Mbps value
- [ ] Max FPS slider updates value
- [ ] Turn Screen Off: toggle on → screen off during mirror, off → screen stays on

### MCP Server

- [ ] MCP Enabled: toggle off (server stops, tools/list fails), on (starts)
- [ ] MCP Port: change → server restarts on new port
- [ ] MCP Require Auth: on (needs token), off (no auth)
- [ ] MCP Log Level: error/info/debug changes log output

### Persistence

- [ ] Change setting → reload app → persists
- [ ] Reset to defaults → reload → defaults loaded
- [ ] Delete settings.json from app data dir → reload → defaults applied

### Edge Cases

- [x] Invalid port number (clamped 1–65535 in UI + sanitize on save/load)
- [x] Empty/null resolution value (sanitized to "default")
- [ ] Rapid toggling (no race conditions or UI freeze)
- [ ] Change scrcpy param while mirroring active — affects next start, not current session
- [ ] Multiple changes before save — all persisted
- [x] Bitrate 0 or out-of-range (sanitized on save/load)

### Persistence (code)

- [x] Corrupt settings.json → defaults (no crash)
- [x] Settings values sanitized on load/save

---

## 3. File Explorer

### Navigation

- [ ] Load default path (`/sdcard`) — files and folders display correctly
- [ ] Navigate into subdirectory (double-click folder)
- [ ] Navigate up via `..` button
- [ ] Breadcrumb navigation: click each segment to jump back, root navigates to `/`
- [ ] Deep directory structures (10+ levels)
- [ ] Symlinks shown as navigable directories
- [ ] Hidden files (`.` prefix) visible in listing
- [ ] Empty directory shows "Folder is empty"

### File Operations

- [ ] Upload small file, large file (100MB+), file with special chars in name
- [ ] Upload from non-existent local path (error)
- [ ] Push to read-only device path (error)
- [ ] Download file (save dialog appears), cancel download (no error)
- [ ] Pull to non-existent local directory (error)
- [ ] Delete file/dir with confirm dialog, cancel delete (no action)
- [ ] Delete system directory (`/system`) — should fail or warn
- [ ] Create folder, create folder with existing name (error)
- [ ] Create folder with special characters in name
- [ ] Device disconnected mid-operation — graceful error, no crash
- [ ] Permission denied directory — graceful error message

### Path Safety

- [ ] Path traversal (`../../etc/hosts`) — should it be allowed?
- [x] Shell metacharacters in path (`` ` $ | ; ``) — rejected by validate_device_path
- [x] Very long paths (>1024 chars) — rejected
- [x] Empty path — error handling
- [ ] Trailing/leading slashes — normalized correctly
- [x] Protected roots (`/`, `/system`, `/data`) refused on delete

### ls -al Parsing Robustness

- [x] Files with colons in name (`file:name.txt`) — time_idx detection (year/time token)
- [x] Filenames with multiple spaces — `parts.join(" ")` reconstructs correctly
- [x] Symlinks with `->` in name — real name extracted via split_once
- [ ] `ls -al` failure (no permissions) — fallback path works
- [ ] Refresh after mutation returns updated listing (no ADB race condition)

### Performance

- [ ] Directory with thousands of files — UI doesn't lag
- [ ] Cache directory listings, invalidate only affected directory after mutations
- [ ] Cache parent directories for breadcrumb navigation
- [ ] Consider virtual scrolling for very large directories
- [ ] Large upload/pull: no progress bar, UI appears frozen — consider streaming with progress events
- [ ] No way to cancel a large transfer — consider abort support
- [ ] Limit concurrent transfers to one at a time (or queue)
- [ ] Rust: `ls -al` parsing for 5000+ files could be slow — streaming parser?
- [ ] `rm -rf` on large directory blocks the async thread
- [ ] ADB command output buffering: very large listings consume memory

---

## 4. App Manager

### Listing & Search

- [ ] Load app list — third-party apps appear
- [ ] Search filter: partial match, case insensitive, no matches ("No apps found.")
- [ ] Empty search — shows all apps
- [ ] Very long package name pasted in search (no crash)
- [ ] Toggle grid/list view — layout switches correctly
- [ ] Refresh button reloads the list
- [ ] App count updates correctly after search filter
- [x] `list_apps` lists third-party + system with accurate `is_system` (toggle in UI)
- [ ] Cache app list across tab switches, invalidate after install/uninstall
- [ ] 500+ apps: scroll lag in grid/list — consider virtual scrolling
- [ ] Hover opacity (`group-hover:opacity-100`) causes repaints on scroll — check for jank
- [x] Search filter runs on every keystroke — add debounce (300ms)

### App Actions

- [ ] Launch an app — opens on device
- [ ] Launch non-existent package — error
- [x] Launch uses `cmd package resolve-activity` + `am start` (monkey fallback only)
- [x] Force stop available in grid + list views
- [ ] Force stop an app that isn't running — harmless (manual device check)
- [ ] Uninstall with confirm dialog, cancel (no action), verify removed from list
- [x] Uninstall hidden for system packages in UI
- [x] Package name with shell metacharacters rejected server-side
- [x] Empty package name passed to launch/stop/uninstall — error
- [x] Grid view: force-stop + clear-data buttons added
- [x] Grid/list show short name + full package on hover/secondary line
- [x] `clear_app_data` wired in UI (confirm dialog)

### Installation

- [ ] Install APK — file picker opens with `.apk` filter only
- [ ] Successful install — app appears in list after refresh
- [ ] Cancel install file picker — no error
- [ ] Install failure (USB verify disabled) — helpful dialog shown
- [ ] Install APK already installed (version mismatch/downgrade) — error handling
- [ ] Install from path with spaces/special chars — ADB command handles it
- [ ] Device goes offline during install — graceful error
- [ ] Install progress: button shows "Installing..." but no progress bar for long installs (200MB+ APK)
- [ ] Large APK transfer over ADB has no progress events — user sees no feedback

### Performance

- [ ] 500+ apps in list: check for scroll lag in both grid and list view
- [ ] Key prop is `package_name` (stable) — good for React reconciliation
- [ ] Hover overlay opacity transitions cause repaints during scroll
- [ ] `pm list packages` output parsing for thousands of packages — fine for typical usage
- [ ] ADB commands (`install`, `uninstall`) block the async thread — large installs block other operations
- [ ] No streaming/progress events for install — user sees no feedback during long installs

---

## 5. Device Connection Flow

### USB Connection

- [ ] Connect device via USB — appears in device list
- [ ] USB device with debugging not authorized — shows authorization prompt/guide
- [ ] Plug/unplug USB — device list updates without manual refresh
- [ ] Multiple USB devices — all appear with correct serials
- [ ] USB device disconnected during active mirroring — graceful error, cleanup

### Wireless (TCP/IP) Connection

- [ ] Connect by IP:port — device appears and connects
- [ ] Connect with invalid IP — error handling
- [ ] Connect to unreachable IP (timeout) — timeout handled, not hanging forever
- [ ] Reconnect to previously saved wireless device — works from history
- [ ] Wireless device disconnects (leaves network) — graceful handling

### mDNS Auto-Discovery

- [ ] mDNS discovery finds devices on same network
- [ ] Pair with discovered device — pairing flow works
- [ ] Pairing code entry — correct and incorrect code handled
- [ ] Device found via mDNS but not yet paired — shows pairing required state

### Persistence & History

- [ ] Saved devices appear on next app launch
- [ ] Connect to saved device from history — re-establishes session
- [ ] Remove device from history — gone on next launch
- [ ] History survives app restart

### Reconnection & Retry

- [ ] Device temporarily disconnected (USB unplug/replug) — auto-reconnect or clear state
- [ ] Connection retry backoff — doesn't hammer ADB in a tight loop
- [ ] Reconnect after device authorization revoked — shows error, not crash

---

## 6. Console / Logcat Tab

### Log Streaming

- [ ] Open Console tab — logcat output streams in real time
- [ ] Logs continue streaming when switching to another tab and back
- [x] Pause/resume log streaming (drops new lines while paused)
- [x] Clear log output (replaces buffer so memory is freed)
- [x] Auto-scroll follows new log lines (toggleable)
- [x] Large volume of logs — ring buffer capped at 2000 lines

### Filtering

- [ ] Filter by package name — only matching logs shown
- [ ] Filter by log level (error/warning/info/debug)
- [ ] Filter by tag
- [ ] Multiple filters combined
- [ ] Clear filters — full log stream resumes
- [ ] Empty filter — shows all logs

### Performance

- [x] Log lines accumulating in memory — ring buffer (MAX_LOG_LINES=2000)
- [ ] Rapid log output doesn't cause UI jank
- [ ] Filter re-renders debounced (not on every new log line)
- [x] Clear button actually frees memory (not just clears the displayed list)
- [x] Pause stops display buffering (drops lines while paused)

---

## 7. Main Mirror View (EmbeddedMirrorView, non-popup)

### Start / Stop

- [ ] Start mirroring from idle state — video appears
- [ ] Stop mirroring — stream ends, back to idle with start button
- [ ] Stop and re-start — works without full page reload
- [ ] Start when device disconnected — error handled

### Video Rendering

- [ ] Video renders smoothly at configured resolution
- [ ] Rotate device — video orientation follows (or locked)
- [ ] Resolution changes take effect on next start
- [ ] Bitrate/fps changes take effect on next start
- [ ] Screen-off toggle works during mirror session
- [ ] Long sessions (30+ min) — no memory leak, no frame drop accumulation

### Controls

- [ ] Sidebar toggle (show/hide controls)
- [ ] Screenshot button captures current frame
- [ ] Quality preset buttons (Performance / Balanced / High Quality)
- [ ] Pop-out button stops local stream and opens popup window
- [ ] Landscape mode detection — sidebar layout adjusts

### Rotation & Orientation

- [ ] Landscape/portrait detection rotates the mirror view
- [ ] Orientation lock follows device setting
- [ ] Sidebar repositioned correctly in landscape mode

---

## 8. ADB Server Management

### Server Lifecycle

- [ ] ADB server starts on app launch (if not running)
- [ ] ADB server stops on app quit
- [ ] Killing ADB externally — app detects and restarts (self-healing)
- [ ] Self-healing restart doesn't create runaway ADB forks (verify process count)

### Command Execution

- [ ] ADB command failure — retry logic works (don't surface transient errors to user)
- [ ] Multiple concurrent ADB commands — no race conditions on device state
- [ ] Very long ADB command output — handled without OOM
- [ ] ADB command timeout — handled, doesn't block indefinitely

### Device Detection

- [ ] Device list polling interval is appropriate (not too frequent)
- [ ] Device added/removed mid-poll — list updates correctly
- [ ] Unauthorized device shows in list with correct status

---

## 9. Sidebar & Navigation

### Rail Navigation

- [ ] All nav items visible and correctly highlighted for active route
- [ ] Device mode nav (back, Home, Console, Files, Apps) appears when device selected
- [ ] Settings icon navigates to Settings page
- [ ] Active state syncs with URL path
- [ ] Back button returns to previous page

### Route Transitions

- [ ] Navigating between Home and Device Dashboard — no flash of wrong content
- [ ] Navigating to Settings and back — state preserved
- [ ] Direct URL entry (`/settings`, `/device/:id`) — correct page loads
- [ ] Invalid route — shows 404 or redirects

### Device Tab Switching

- [ ] Switch between Console, Files, Apps tabs — each loads correctly
- [ ] Tab state (search, scroll position) preserved on switch
- [ ] Rapid tab switching — no race condition (stale responses from previous tab)

---

## 10. App Startup & Initialization

### Boot Sequence

- [ ] App launches without crash on clean install
- [ ] Settings loaded from disk (or defaults if missing)
- [ ] ADB detected/started (or error shown if not found)
- [ ] Theme applied before first render (no flash of wrong colors)
- [ ] Window size/position restored from last session
- [ ] MCP server auto-starts if enabled in settings

### First Launch

- [ ] First launch with no devices — shows welcome/empty state
- [ ] First launch with USB device already plugged — detected immediately
- [ ] First launch with saved devices from previous install — loaded from history

### State Restoration

- [ ] App reopen after being minimized to tray — state intact
- [ ] App reopen after crash — clean state, no stale sessions
- [ ] Quit while mirroring is active — scrcpy server killed, no orphan processes
- [ ] Quit while file transfer in progress — clean up, no corruption

---

## 11. Error Boundaries & Crash Recovery

### Frontend Errors

- [x] React error boundary catches unhandled component errors — shows fallback UI, not white screen
- [ ] Tauri IPC invoke failure — shown as toast or error state, not silent hang
- [ ] Invalid route data (device ID doesn't exist) — graceful redirect
- [x] Corrupt settings.json (malformed JSON) — falls back to defaults, doesn't crash

### Rust / Backend Errors

- [ ] Rust command panics — caught by Tauri, error returned to frontend (no app crash)
- [ ] Out of memory during large file operation — handled gracefully
- [ ] ADB binary missing on system PATH — clear setup guide shown on first launch
- [ ] Scrcpy server JAR missing — clear error, not silent failure

### Network / Device Errors

- [ ] Device disconnected during long operation — error surfaces, state cleaned up
- [ ] ADB daemon crash — self-healing restarts it, operations retried
- [ ] MCP server bind port already in use — error shown with suggestion to change port
- [ ] Multiple instances of app — second instance detected and warned (or prevented)

---

## 12. Performance Improvements

### Caching & Preloading

- [ ] Device list: cached across tab switches, not re-fetched on every Home visit
- [ ] ScreenshotRegistry: verify TTL/eviction policy so memory doesn't grow unbounded
- [ ] UI tree: `get_screen` fetches uiautomator XML every call — cache with invalidation on user interaction
- [x] MCP tool schemas: `tools/list` built once via OnceLock (cached)
- [ ] Device details (model, Android version, battery): fetch once on connect, cache

### Tab & Page Navigation

- [ ] React routes: lazy-loaded or bundled all at once?
- [ ] Device state preserved across tab switches (Home ↔ Console ↔ Files ↔ Apps)
- [ ] Timers/intervals cleared on page unmount; Tauri `listen()` handlers unregistered (no accumulation)

### Window Management

- [ ] Popup windows tracked so app quit cleans them up
- [ ] Multiple popups: should they be limited?
- [ ] OS close button: session and webview fully destroyed (no zombie processes)
- [ ] `onCloseRequested`: async cleanup actually awaits before destroying (race?)
- [ ] Reopen popup for same device: reuse existing window instead of creating new
- [ ] Main window minimized to tray: popups hidden/restored consistently

### Memory Management

- [ ] Scrcpy video decoder: frames processed and released in bounded time (no accumulator leak)
- [ ] Control socket buffer: no unbounded growth from unexpected device data
- [ ] Large UI tree XML: parsed and released, not held across calls
- [ ] Screenshot images: decoded buffers freed after encoding to JPEG/PNG
- [ ] ADB command output: very large logcat output — streaming vs buffering all in memory
- [ ] Rust heap: `Arc`/`Mutex` state that grows without bound (session list, screenshot registry)
- [ ] React state: log lines accumulating in memory instead of ring buffer

### Process Lifecycle

- [ ] scrcpy server killed on disconnect, popup close, app quit (no orphaned Java processes)
- [ ] ADB self-healing restart doesn't create runaway ADB forks
- [ ] MCP server: graceful shutdown on settings change (port) and app quit
- [ ] Cleanup order on quit: webviews → scrcpy → MCP server → ADB
