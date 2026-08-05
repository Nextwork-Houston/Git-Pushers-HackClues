# Building Orbit Desktop

Orbit Desktop uses Electron Builder to create native installers. Production packages include Electron and all runtime assets; end users do not need Node.js or npm.

## Prerequisites

- Node.js 22 or newer
- npm
- The native operating system for the package being built

Install dependencies from the project root:

```bash
npm install
```

## Development

```bash
npm run dev
npm run check
```

The convenience launchers perform the dependency check automatically:

- Windows: `launch-orbit.bat` or `launch-orbit.ps1`
- macOS: `launch-orbit.command`
- Linux: `launch-orbit.sh`

## Production builds

Build on the operating system that will run the resulting package:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

`npm run dist` builds the configured targets for the current operating system. `npm run build` creates an unpacked application for local package inspection.

Artifacts are written to `release/`:

- Windows x64: `release/Orbit-Setup-x64.exe`
- macOS x64: `release/Orbit-1.0.0-x64.dmg`
- macOS arm64: `release/Orbit-1.0.0-arm64.dmg`
- Linux x64: `release/Orbit-1.0.0-x86_64.AppImage`
- Linux x64 Debian package: `release/Orbit-1.0.0-amd64.deb`

Artifact architecture labels are selected by Electron Builder and can vary slightly between target formats.

## Application data

Packaged defaults remain in `desktop/desktop-config.json`. Mutable preferences are written to Electron's `userData` directory as `settings.json`; window position and browser local storage live there as well. Uninstall and application upgrades do not delete these files by default.

Approximate locations:

- Windows: `%APPDATA%\Orbit`
- macOS: `~/Library/Application Support/Orbit`
- Linux: `~/.config/Orbit`

Logs are stored at `userData/logs/orbit.log`.

## Icons

`build/icon.png` is the canonical 512 x 512 transparent Orbit icon. Electron Builder derives platform package icons from it. Replace it with an approved square Orbit image of at least 512 x 512 pixels before a major branded release.

## Signing and notarization

Current builds are unsigned. Windows users may see a SmartScreen warning, and macOS users may need to use the standard Open confirmation for an identified unsigned application. Do not disable operating-system security globally.

Future release CI should provide signing credentials through repository secrets. macOS signing and notarization must run on a macOS runner; Windows code signing should run on a Windows runner.

## CI releases

`.github/workflows/build-desktop.yml` builds each platform on its matching GitHub-hosted runner and uploads installers as workflow artifacts. It does not cross-compile or claim to sign packages.

For a public release:

1. Update the semantic version in `package.json`.
2. Run `npm run check`.
3. Build and smoke-test on each native operating system.
4. Add signing credentials when available.
5. Publish the generated files from `release/` to a GitHub Release.
