# ADB Binary Files

## Setup Instructions

1. Download the Android SDK Platform Tools from:
   https://developer.android.com/studio/releases/platform-tools

2. Extract the following files into this directory:
   - adb.exe
   - AdbWinApi.dll
   - AdbWinUsbApi.dll

3. The final structure should look like:
   ```
   adb/
     ├── adb.exe
     ├── AdbWinApi.dll
     └── AdbWinUsbApi.dll
   ```

## Important Notes

- ADB requires its DLL dependencies to function properly
- Do not rename the files
- The app will bundle these files when building for production
- These files are gitignored to keep the repository clean
