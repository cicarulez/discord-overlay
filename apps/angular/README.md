# Angular Client

Web client that displays the voice channel participants and their status via a backend (`services/discord-service`). It does not connect to Discord directly; it consumes HTTP/WS from the service.

Prerequisites
- Running backend (see services/discord-service)
- Node.js 18+

Install
```bash
cd apps/angular
npm install
```

Develop
```bash
ng serve
```
Open `http://localhost:4200/` in your browser.

Backend connection configuration
- Click the "⚙" icon in the app to open "Backend settings".
- Set the backend HTTP URL, e.g., `http://localhost:5090`.
- The app will automatically compute the corresponding WebSocket URL (`ws://` or `wss://`).

Tracked user preference (optional)
- You can set a member to highlight via mode `id` or `name`.
- Preferences are saved in the browser's `localStorage` on the local device.

Build
```bash
ng build
```
Artifacts will be under `dist/`.

Test
```bash
ng test
```

Notes
- Ensure the backend exposes at least the HTTP `/snapshot` endpoint and WS at `/ws`.
- If you change the backend's port or protocol, update the URL in settings.
