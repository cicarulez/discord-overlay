Discord Overlay — Monorepo
==========================

Overview
This repository contains multiple projects that work together to display, as a desktop/web overlay, the participants of a Discord voice channel and their status (mute/deaf) in real time.

Supported runtime models:
- Standalone: the Electron app connects directly to Discord (requires a local bot token).
- Client + Backend: a local/remote backend service exposes data via HTTP/WS, and the clients (Electron in client‑only mode or the Angular app) connect to the backend without running a bot locally.

Projects
- apps/electron: Electron desktop client. Can run in Standalone or Client‑Only mode by connecting to the backend.
- apps/angular: Angular web client that connects to the backend.
- services/discord-service: Backend service that connects to Discord and publishes the voice channel state via HTTP and WebSocket.

Language
- Default repository language for documentation, issues, PRs, and commit messages is English.
- Optional localized docs can live alongside as README.<lang>.md files (e.g., README.it.md) and should be linked from the English README.

Requirements
- Node.js 18 LTS or newer
- For Standalone or the backend: a Discord Bot token with the required gateway intents enabled
- Windows, macOS, or Linux

Quick start scenarios
1) Electron Standalone (no backend)
   - cd apps/electron
   - npm install
   - Start the app and open Settings to enter botToken, guildId, voiceChannelId (see the Electron README for details on settings.json)
   - npm start

2) Backend + Electron (client‑only)
   - Start the backend:
     - cd services/discord-service
     - npm install
     - Copy .env.sample to .env and set DISCORD_BOT_TOKEN, optionally VOICE_CHANNEL_ID
     - npm start (defaults to http://127.0.0.1:5090)
   - Start Electron in client‑only mode:
     - cd apps/electron
     - npm install
     - In Settings enable clientOnly=true and set backendBaseUrl (e.g., http://localhost:5090)
     - npm start

3) Backend + Angular (web)
   - Start the backend as above
   - cd apps/angular
   - npm install
   - ng serve
   - Open http://localhost:4200 and configure the backend endpoint from the UI or as per the Angular README

Windows note (fullscreen)
On Windows, the overlay can appear above games only when they run in Windowed or Borderless Fullscreen mode. In Exclusive Fullscreen, the DWM is bypassed and regular windows (like Electron) cannot be drawn on top. This is a Windows limitation, not an app bug.

Project documentation
- See apps/electron/README.md for details on Standalone vs Client‑Only, configuration, and build.
- See apps/angular/README.md for web client configuration and backend connection.
- See services/discord-service/README.md for backend setup and usage.

Security
Please report vulnerabilities as described in SECURITY.md.

Contributing
Contributions are welcome. See CONTRIBUTING.md for guidelines.

License
MIT (see LICENSE).

Acknowledgments
- Built with Electron, Angular and discord.js