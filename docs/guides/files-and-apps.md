# Manage files and apps

These tools operate on the currently selected Android device through ADB.
Confirm the device identity before making changes.

## Files

Browse the device file tree, download a remote file with **Pull**, choose a
local file to upload with **Push**, and create directories. Mirin opens native
file dialogs for local source and destination choices.

**Delete permanently removes the selected remote file.** It is not moved to a
trash folder by Mirin. Verify the path and keep a backup before deleting.

## Apps

Mirin can list installed packages, install an APK chosen from the computer,
launch an app, stop it, clear its app data, and uninstall it.

- Clearing app data resets that application's local state on the Android
  device.
- Uninstalling removes the selected package and its app data subject to Android
  policy.
- System packages may be protected by the device and can reject changes.

These actions affect the Android device, not the Mirin desktop installation.
