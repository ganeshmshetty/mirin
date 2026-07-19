# Mirror your first Android device over USB

This tutorial uses USB because it gives Mirin a direct ADB connection and
avoids wireless-network variables during first setup.

## Before you begin

Complete the Android and installation prerequisites in
[Install Mirin](installation.md). Keep the phone unlocked and connected with a
data-capable USB cable.

## Connect and mirror

1. Launch Mirin.
2. On the device list, select **Connect Device** if no devices are shown.
3. Connect the Android device by USB and wait for it to appear in the list.
4. If Android asks to allow USB debugging, confirm the prompt on the device.
5. Select the connected device to open its screen workspace.
6. Select **Start Mirroring**.

Mirin starts an embedded scrcpy-backed video stream for the selected device.
The phone’s screen should appear in the workspace. The app can also send
supported touch, keyboard, and scroll input through the active mirror session.

## What success looks like

You have a successful first mirror when all of the following are true:

- The device appears as **Connected** rather than **Unauthorized**, **Offline**,
  or **Disconnected**.
- The screen workspace displays the device’s video stream.
- The device row can show a mirroring status while streaming.

Use the on-screen stop control to end the session. Disconnecting the USB cable
will also interrupt the connection.

## If the flow stops

- **The device does not appear:** verify that USB debugging is enabled, the
  cable transfers data, and the device is unlocked. Then see
  [Device not detected](../guides/troubleshooting.md#device-is-not-detected).
- **The device is Unauthorized:** accept the USB-debugging authorization prompt
  on the device. See
  [Device is Unauthorized](../guides/troubleshooting.md#device-is-unauthorized).
- **Mirroring does not start or stops immediately:** see
  [Mirror session fails](../guides/troubleshooting.md#mirror-session-fails).

## After the first mirror

Mirin also supports wireless device connections. Wireless setup depends on the
device’s Android version, debugging mode, current network, and local network
policy. For failures while pairing or connecting wirelessly, use
[Wireless connection fails](../guides/troubleshooting.md#wireless-connection-fails).
