# MCP resources reference

`mirin://devices/{id}/logcat` returns the most recent 200 logcat entries for a
device serial as `text/plain`. It is a snapshot, not a live subscription. Logs
can contain sensitive app and device information.
