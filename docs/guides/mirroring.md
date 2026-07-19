# Mirror and control a device

Select a connected, authorized device and start mirroring. Mirin launches an
embedded scrcpy session, receives video frames, and sends supported input over
the control connection. Ending the session stops the associated mirror
transport.

## Controls

The mirror view supports touch, key input, text input, scrolling, and portrait
or landscape orientation controls. Orientation is requested on the device and
can be affected by the device's own auto-rotate policy or ROM.

## Quality and display options

Use the settings page to change resolution, bitrate, maximum FPS, stay-awake,
turn-screen-off, and always-on-top behavior. Higher bitrate and frame-rate
values increase quality and resource use; lower values can improve a constrained
wireless connection. See [settings](../reference/settings.md) for defaults and
limits.

## End a session

Disconnect the mirror when finished, especially before changing ADB connection
methods. If a view remains blank or input stops responding, end the session,
refresh the device list, and retry; use [troubleshooting](troubleshooting.md)
for resource and connection diagnostics.
