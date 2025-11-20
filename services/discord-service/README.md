# Discord Service (Backend)

Backend service that connects to Discord via a bot and publishes the voice channel state via HTTP and WebSocket. It is consumed by clients such as the Electron app (client-only mode) and the Angular app.

Features
- Healthcheck at `/api/health`
- Auth via JWT Bearer issued from `/api/login` based on `.htpasswd` credentials
- Current snapshot at `/api/snapshot` (protected with JWT)
- WebSocket at path `/api/ws` (protected with JWT in query `?token=`) that sends an initial snapshot and updates (`voice_state_update`) plus periodic heartbeat

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
- JWT_SECRET (required to enable auth)
- JWT_EXPIRES_IN (e.g. `8h`, default `8h`)
- HTPASSWD_PATH (path to `.htpasswd`, default `./.htpasswd` relative to service root)

Start
```bash
npm start
# development with reload (requires nodemon)
npm run dev
```
The service listens by default at `http://127.0.0.1:5090`.

API
- POST `/api/login`
  - Provide credentials via HTTP Basic Auth header or JSON body `{ username, password }`
  - Response: `{ ok: true, token, expiresIn }` on success
- GET `/api/health` → `{ ok: true, service: 'discord-service', time: ISO }`
- GET `/api/snapshot` (requires `Authorization: Bearer <token>`) → `{ ok: true, data: { members: [...], tracked, updatedAt } }`

WebSocket
- Endpoint: `ws://host:port/api/ws?token=<JWT>` (or `wss://` on HTTPS reverse proxy)
- Messages sent by the server:
  - `{ "type": "snapshot", "payload": { ... } }` on connection open
  - `{ "type": "voice_state_update", "payload": { ... } }` on updates
  - `{ "type": "heartbeat", "payload": { "status": "alive" } }` every ~5s
- Accepted messages (minimal):
  - `{ "type": "ping" }` → response `{ "type": "pong" }`

Auth setup
- Create a `.env` file with at least `JWT_SECRET` set.
- Create an `.htpasswd` file (Apache-style) in the service folder or adjust `HTPASSWD_PATH`.
  - Each line: `username:hash` where `hash` is a bcrypt hash of the password.
  - Generate a hash with Node REPL:
    ```js
    const bcrypt=require('bcryptjs');
    bcrypt.hashSync('yourPassword', 10)
    ```
  - Example `.htpasswd`:
    ```
    admin:$2a$10$2b3a...hashed...
    viewer:$2a$10$abcd...hashed...
    ```

Client usage (summary)
- Obtain a token via `POST /api/login` using Basic Auth.
- Use `Authorization: Bearer <token>` for all HTTP calls.
- For WebSocket, append `?token=<token>` to `/api/ws` URL.

Notes
- If `DISCORD_BOT_TOKEN` is not set, the service will start HTTP/WS but will not log into Discord.
- Missing permissions/ints for the bot will prevent member population.

License
MIT (see LICENSE at root).