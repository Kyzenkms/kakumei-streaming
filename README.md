# Kakumei

Kakumei is a streaming site for **movies, series and anime** — browse a large catalog with multi-language dubs, multiple playback servers, watch party, continue watching and profiles.

**Live site:** https://stream.kyzenhub.site

## Downloads

All builds are attached to the [latest release](https://github.com/Kyzenkms/kyzen-stream/releases).

| App | Download | Also on the site |
| --- | --- | --- |
| Windows (installer) | [Kakumei-Setup-0.1.6.exe](https://github.com/Kyzenkms/kakumei-streaming/releases/download/v1.0.2/Kakumei-Setup-0.1.6.exe) | https://stream.kyzenhub.site/downloads/Kakumei-Setup-0.1.6.exe |
| Android — arm64-v8a (most phones) | [kakumei-1.0.2-arm64-v8a.apk](https://github.com/Kyzenkms/kakumei-streaming/releases/download/v1.0.2/kakumei-1.0.2-arm64-v8a.apk) | https://stream.kyzenhub.site/downloads/kakumei-1.0.2.apk |
| Android — armeabi-v7a (older 32-bit) | [kakumei-1.0.2-armeabi-v7a.apk](https://github.com/Kyzenkms/kakumei-streaming/releases/download/v1.0.2/kakumei-1.0.2-armeabi-v7a.apk) | https://stream.kyzenhub.site/downloads/kakumei-1.0.2.apk |

The universal APK (~146 MB) exceeds GitHub's 100 MB commit limit, so it lives on the site and on the release page. If you don't know your phone's architecture, pick arm64-v8a — every modern Android device uses it.

### Windows: install via command (skip the SmartScreen prompt)

The installer is not code-signed, so Windows shows a SmartScreen warning when it's downloaded in a browser. To skip it, download from the command line instead — open Command Prompt (Win + R → `cmd`) and run:

```cmd
curl -Lo %TEMP%\Kakumei.exe https://stream.kyzenhub.site/downloads/Kakumei-Setup-0.1.6.exe && %TEMP%\Kakumei.exe
```

Files fetched this way don't carry the browser's Mark of the Web, so the installer opens without the warning.

## Updates

- **Windows** — checks GitHub releases on launch and auto-installs new versions (a restart prompt appears once downloaded).
- **Android** — checks `/version.json` on launch: minor updates show a dismissible banner, builds below the minimum supported version are locked until updated.
- **Web** — updates itself on every deploy.

## What's inside this repo

- `src/` — web app (React + Vite): catalog, player, watch party, profiles
- `desktop/` — Windows desktop app (Electron) built from the same UI
- `mobile/` — Android app source (Expo / React Native)
- `landing/` — landing page with download links
- `deploy/` — deploy + release verification scripts
- `downloads/` — published installers and APKs

The streaming backend is private and is not part of this repository.

## Development

```bash
npm install
npm run dev
```

Desktop app:

```bash
cd desktop
npm install
npm run dev      # run
npm run pack     # build win-unpacked
npm run dist     # build installer
```
