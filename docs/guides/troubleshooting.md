# Troubleshooting

Start with the symptom that most closely matches what Mirin shows. Preserve the
exact error message when escalating an issue; it helps distinguish device,
resource, and network failures.

## Device is not detected

**Symptoms:** Mirin’s device list is empty after a USB connection, or the
connection window continues searching without listing the phone.

**Action:**

1. Unlock the phone and confirm **USB debugging** is enabled in Developer
   options.
2. Reconnect it with a known data-capable USB cable; do not rely on a
   charge-only cable.
3. Try another USB port and, if the phone offers USB modes, select a
   data-capable mode.
4. Reopen or refresh the connection flow in Mirin.

**Escalation:** If the device is still absent, record the Android version,
device model, operating system, cable/port attempts, and whether another ADB
tool can see the device. Include this information in a GitHub issue.

## Device is Unauthorized

**Symptoms:** The device appears in Mirin with the **Unauthorized** status, or
Mirin cannot open a device workspace after it is detected.

**Action:** Unlock the phone and accept its **Allow USB debugging?** prompt for
the computer. If no prompt appears, disconnect and reconnect the cable, then
recheck Developer options. As a device-side recovery, revoke USB debugging
authorizations in Developer options and reconnect so Android can show a fresh
prompt.

**Escalation:** If authorization repeatedly fails, report the device model,
Android version, and the exact status/error. Do not share the computer’s USB
debugging RSA fingerprint.

## ADB or scrcpy resources are missing

**Symptoms:** Mirin reports that an ADB executable, scrcpy executable, server,
or resource directory cannot be found; mirroring may fail before a stream
starts.

**Action:** Reinstall Mirin from its official release or reinstall the
[Homebrew Cask](../getting-started/installation.md#macos). Do not copy a
system ADB or scrcpy binary into the application bundle: Mirin resolves its
bundled platform-specific resources. For a development build, run it from the
repository after dependencies are installed so `src-tauri/resources` is
available.

**Escalation:** File an issue with the full error, Mirin version, operating
system and architecture, installation route, and whether this is a packaged or
development build.

## Wireless connection fails

**Symptoms:** pairing fails, Mirin cannot discover a wireless device, or a
connection to an IP address and port is refused or times out.

**Action:**

1. Confirm the computer and device are on the same local network.
2. Confirm USB debugging remains enabled. For Android 11+ pairing, start the
   pairing flow from the device’s Wireless debugging settings and use the
   pairing address, port, and six-digit code currently shown there.
3. Use the device’s connect address and port after pairing; pairing and connect
   ports can differ.
4. Check that the network does not isolate wireless clients (often called AP
   isolation or client isolation). If appropriate, try a different trusted
   network or a direct phone hotspot.

**Escalation:** Include the Android version, whether the failure occurred at
pairing, discovery, or connection, the error text, and the network type. Do
not publish pairing codes or private IP addresses in a public issue.

## Mirror session fails

**Symptoms:** **Start Mirroring** never shows video, reports a failure or
timeout, or the stream starts and then stops.

**Action:**

1. Return to the device list and verify the selected connection is still
   **Connected** and not **Unauthorized**, **Offline**, or **Disconnected**.
2. Stop the current session if a stop control is available, then start
   mirroring again.
3. For USB, reconnect the device and accept any renewed debugging prompt. For
   wireless, confirm the device is still reachable on the same network.
4. Restart Mirin. If an ADB or scrcpy resource error appears, follow
   [ADB or scrcpy resources are missing](#adb-or-scrcpy-resources-are-missing).

**Escalation:** Open an issue with the complete error message, Mirin version,
operating system/architecture, Android device/version, connection type (USB or
wireless), and exact steps that reproduce the failure. Remove personal data,
pairing codes, and private network details before posting.

## Get help

Report reproducible problems through the
[Mirin issue tracker](https://github.com/ganeshmshetty/mirin/issues). Include
the escalation details from the relevant section and say whether the first
mirror tutorial in [First USB mirror](../getting-started/first-mirror.md) was
completed successfully.
