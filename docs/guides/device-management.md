# Manage devices

Mirin presents USB and wireless ADB devices together. A device can be
**Connected**, **Disconnected**, **Unauthorized**, or **Offline**. Only a
connected, authorized device can start a mirror session.

## Refresh and inspect

Use refresh after attaching a cable, enabling wireless debugging, or resolving
an authorization prompt. Mirin can retrieve manufacturer, model, Android
version, battery, and storage details for a selected device when ADB permits
those queries.

## Save and forget

Saving stores a device in Mirin's local history so it remains visible after a
temporary disconnect. It does not keep an ADB connection alive and does not
grant future authorization.

Use **Forget** when an entry is obsolete or shared-device history should be
removed. Forgetting removes the saved record and disconnects the device when
applicable. It does not erase the Android device or revoke developer options.

## Names and identity

Mirin identifies a device by its ADB connection identity. A physical phone can
appear with different USB and wireless identifiers; Mirin resolves known
connections where possible. Do not rely on a display name alone when choosing a
device for a destructive action.
