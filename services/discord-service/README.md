# Discord Service (Backend)

Backend service that connects to Discord via a bot and publishes the voice channel state via HTTP and WebSocket. It is consumed by clients such as the Electron app (client-only mode) and the Angular app.

Features
- Healthcheck at `/health`
- Current snapshot at `/snapshot`
- WebSocket at path `/ws` that sends an initial snapshot and updates (`voice_state_update`) plus periodic heartbeat

Requirements
- Node.js 18+
- Discord bot token with required gateway intents

Setup
```bash
cd services/discord-service
npm install
# Linux/macOS
cp .env.sample .env
# Windows PowerShell
Copy-Item .env.sample .env
```

Config (.env)
- PORT (default: 5090)
- DISCORD_BOT_TOKEN (required)
- GUILD_ID (optional)
- VOICE_CHANNEL_ID (optional: if set, the service populates members from this channel)

Start
```bash
npm start
# development with reload (requires nodemon)
npm run dev
```
The service listens by default at `http://127.0.0.1:5090`.

API
- GET `/health` → `{ ok: true, service: 'discord-service', time: ISO }`
- GET `/snapshot` → `{ ok: true, data: { members: [...], tracked, updatedAt } }`

WebSocket
- Endpoint: `ws://host:port/ws`
- Messages sent by the server:
  - `{ "type": "snapshot", "payload": { ... } }` on connection open
  - `{ "type": "voice_state_update", "payload": { ... } }` on updates
  - `{ "type": "heartbeat", "payload": { "status": "alive" } }` every ~5s
- Accepted messages (minimal):
  - `{ "type": "ping" }` → response `{ "type": "pong" }`

Notes
- If `DISCORD_BOT_TOKEN` is not set, the service will start HTTP/WS but will not log into Discord.
- Missing permissions/ints for the bot will prevent member population.

License
MIT (see LICENSE at root).