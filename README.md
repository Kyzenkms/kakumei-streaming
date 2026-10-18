# Kakumei

Kakumei is a streaming site for **movies, series and anime** — browse a large catalog with multi-language dubs, multiple playback servers, watch party, continue watching and profiles.

**Live site:** https://stream.kyzenhub.site

## Downloads

| App | Download | Also on the site |
| --- | --- | --- |
| Windows (installer) | [Kakumei-Setup-0.1.5.exe](downloads/Kakumei-Setup-0.1.5.exe) | https://stream.kyzenhub.site/downloads/Kakumei-Setup-0.1.5.exe |
| Android (APK) | [kakumei-1.0.0.apk](https://stream.kyzenhub.site/downloads/kakumei-1.0.0.apk) | https://stream.kyzenhub.site/downloads/kakumei-1.0.0.apk |

The current APK is distributed via the site (larger than GitHub's 100 MB file limit); per-architecture builds under `Kyzenkms/kyzen-mobile` are small enough for GitHub. Older APKs stay under `downloads/`.

### Windows: install via command (skip the SmartScreen prompt)

The installer is not code-signed, so Windows shows a SmartScreen warning when it's downloaded in a browser. To skip it, download from the command line instead — open Command Prompt (Win + R → `cmd`) and run:

```cmd
curl -Lo %TEMP%\Kakumei.exe https://stream.kyzenhub.site/downloads/Kakumei-Setup-0.1.5.exe && %TEMP%\Kakumei.exe
```

Files fetched this way don't carry the browser's Mark of the Web, so the installer opens without the warning.

Android source lives in [Kyzenkms/kyzen-mobile](https://github.com/Kyzenkms/kyzen-mobile).

## What's inside this repo

- `src/` — web app (React + Vite): catalog, player, watch party, profiles
- `desktop/` — Windows desktop app (Electron) built from the same UI
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
