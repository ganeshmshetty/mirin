# Install Mirin

Mirin is a desktop application for mirroring Android devices. The current
application bundles the ADB and scrcpy executables it uses on supported macOS
and Windows builds, so a separate system-wide installation is not normally
required.

## Supported installation routes

### macOS

Choose either route:

- **Homebrew Cask:**

  ```sh
  brew tap ganeshmshetty/tap
  brew trust --cask ganeshmshetty/tap/mirin
  brew install --cask ganeshmshetty/tap/mirin
  ```

- **Release installer:** download the macOS `.dmg` from the
  [Mirin releases page](https://github.com/ganeshmshetty/mirin/releases), open
  it, and install Mirin according to the installer prompts.

If macOS prevents an installed app from opening, follow the warning shown by
macOS first. Gatekeeper behavior, signing state, and organization-managed
security settings are environment-dependent. If the warning specifically says
the app is damaged because of quarantine, the project README documents this
recovery command:

```sh
xattr -cr /Applications/Mirin.app
```

Run it only after confirming that `/Applications/Mirin.app` is the app you
installed.

### Windows

Download the Windows `.msi` from the
[Mirin releases page](https://github.com/ganeshmshetty/mirin/releases), run
the installer, then launch Mirin from the Start menu or its installed location.

Windows SmartScreen, antivirus products, and organization policies can affect
whether an installer opens. Follow your organization’s policy or contact its
administrator if Windows blocks an installer.

## Prepare the Android device

For the first connection, you need an Android device running Android 5.0 or
newer, a data-capable USB cable, and USB debugging enabled.

1. On the device, open **Settings** and enable **Developer options**. Android
   vendors place this differently; commonly, tap **Build number** repeatedly
   under **About phone** until Developer options become available.
2. In **Developer options**, turn on **USB debugging**.
3. Connect the device to the computer with USB. If Android offers a USB mode,
   choose a data-capable mode rather than charge-only.
4. Unlock the device. When Android asks whether to allow USB debugging from
   this computer, review the computer fingerprint and choose **Allow**.

The exact Settings labels, cable behavior, and authorization prompt vary by
Android version and device vendor. Continue to [Mirror your first device](first-mirror.md)
once the device is connected.

## Development setup

For a local development build, install the current Rust toolchain, Node.js,
and npm. Then clone the repository and run:

```sh
npm install
npm run tauri dev
```

The package scripts also provide `npm run check` for TypeScript and Rust
checks. Development resource resolution falls back to `src-tauri/resources`
when packaged resources are unavailable.

## Next step

Continue with [Mirror your first device](first-mirror.md), or go to
[troubleshooting](../guides/troubleshooting.md) if Mirin does not list the
device.
