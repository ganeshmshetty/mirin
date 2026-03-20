# Scrcpy Binary Files

## Setup Instructions

1. Download the latest scrcpy release for Windows from:
   https://github.com/Genymobile/scrcpy/releases

2. Extract all files from the scrcpy archive into this directory:
   - scrcpy.exe
   - scrcpy-server
   - All DLL files (SDL2.dll, avcodec*.dll, avformat*.dll, etc.)
   - Any other dependencies

3. The final structure should look like:
   ```
   scrcpy/
     ├── scrcpy.exe
     ├── scrcpy-server
     ├── SDL2.dll
     ├── avcodec-*.dll
     ├── avformat-*.dll
     ├── avutil-*.dll
     └── (other DLL files)
   ```

## Important Notes

- Keep all files together - scrcpy requires its DLL dependencies
- Do not rename the files
- The app will bundle these files when building for production
- These files are gitignored to keep the repository clean
