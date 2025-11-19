# Electron Client

Electron desktop client that displays, as an overlay, the participants of a Discord voice channel and their status (mute/deaf).

Supported modes
- Standalone: the app connects directly to Discord using a local bot token.
- Client-Only: the app does not run `discord.js` locally; it connects to a backend (see `services/discord-service`).

Requirements
- Node.js 18+
- For Standalone mode: Discord bot token with required gateway intents.

Install
```bash
cd apps/electron
npm install
```

Run
```bash
# development
npm start

# development with auto-reload (requires electronmon)
npm run dev
```

Settings
User settings are stored in `settings.json` under Electron's `userData` folder (managed automatically). You can edit them from the app's "Settings" window or by editing the file.

Available fields:
- botToken: string (Standalone) — Discord bot token
- guildId: string (Standalone) — server (guild) ID
- voiceChannelId: string (Standalone) — voice channel ID to track
- trackedMember: object `{ mode: 'id' | 'name', value: string }`
- clientOnly: boolean — if `true`, do not start `discord.js` locally and use the backend
- backendBaseUrl: string — backend base URL (e.g., `http://localhost:5090`)

Tips
- Standalone: ensure `botToken`, `guildId`, and `voiceChannelId` are filled in.
- Client-Only: set `clientOnly: true` and point `backendBaseUrl` to your service.

Build packages
```bash
# all targets for your current OS
npm run build

# specific targets
npm run build:win
npm run build:mac
npm run build:linux
```

Windows note (fullscreen)
On Windows, the overlay appears above games only in Windowed or Borderless Fullscreen mode. In Exclusive Fullscreen the DWM is bypassed and the overlay cannot be drawn on top: this is a system limitation.
