require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const PORT = process.env.PORT ? Number(process.env.PORT) : 5090;

// In-memory state: will be updated by Discord events
const state = {
  members: [],
  tracked: null,
  updatedAt: new Date().toISOString()
};

const app = express();
app.use(express.json());
// Create API router to expose everything under /api (including WS)
const api = express.Router();

// -----------------------------
// Auth config via .env and .htpasswd
// -----------------------------
const AUTH = {
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  HTPASSWD_PATH: process.env.HTPASSWD_PATH || path.resolve(__dirname, '..', '.htpasswd')
};

function loadHtpasswd(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
        console.warn(`[auth] .htpasswd file not found at ${filePath}. Create one and restart.`);
        return {}
    } else {
        console.log(`[auth] Loading .htpasswd from ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const map = {};
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf(':');
      if (idx <= 0) return;
      const user = trimmed.slice(0, idx).trim();
      const hash = trimmed.slice(idx + 1).trim();
      if (user && hash) map[user] = hash;
    });
    return map;
  } catch (e) {
    console.error('[auth] Failed to read .htpasswd:', e?.message || e);
    return {};
  }
}

let htpasswd = loadHtpasswd(AUTH.HTPASSWD_PATH);

// Best-effort auto-reload if the file changes
try {
  fs.watch(AUTH.HTPASSWD_PATH, { persistent: false }, () => {
    htpasswd = loadHtpasswd(AUTH.HTPASSWD_PATH);
    console.log('[auth] Reloaded .htpasswd');
  });
} catch {}

function parseBasicAuth(header) {
  if (!header) return null;
  const m = /^Basic\s+(.+)$/i.exec(header);
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function signToken(payload) {
  if (!AUTH.JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign(payload, AUTH.JWT_SECRET, { expiresIn: AUTH.JWT_EXPIRES_IN });
}

function verifyToken(token) {
  if (!AUTH.JWT_SECRET) return null;
  try {
    return jwt.verify(token, AUTH.JWT_SECRET);
  } catch {
    return null;
  }
}

// Public: health and login (under /api)
api.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'discord-service', time: new Date().toISOString() });
});

api.post('/login', (req, res) => {
  // Prefer Basic Auth header; fallback to JSON body { username, password }
  const ba = parseBasicAuth(req.headers['authorization'] || '');
  const username = ba?.username || req.body?.username;
  const password = ba?.password || req.body?.password;
  if (!username || !password) {
    return res.status(401).json({ ok: false, error: 'Missing credentials' });
  }
  const hash = htpasswd[username];
  if (!hash) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }
  const ok = bcrypt.compareSync(password, hash);
  if (!ok) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }
  try {
    const token = signToken({ sub: username, typ: 'access' });
    res.json({ ok: true, token, expiresIn: AUTH.JWT_EXPIRES_IN });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Token generation failed' });
  }
});

// JWT protection middleware
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return res.status(401).json({ ok: false, error: 'Missing token' });
  const payload = verifyToken(m[1]);
  if (!payload) return res.status(401).json({ ok: false, error: 'Invalid token' });
  req.user = payload;
  return next();
}

// Current snapshot (protected)
api.get('/snapshot', requireAuth, (_req, res) => {
  res.json({
    ok: true,
    data: state
  });
});

// Configuration endpoint (for compatibility: saves in memory but authentication uses .env)
let config = {
  botToken: '',
  guildId: '',
  voiceChannelId: '',
  trackedMember: { mode: 'id', value: '' }
};

api.get('/config', requireAuth, (_req, res) => {
  res.json({ ok: true, config });
});

api.post('/config', requireAuth, (req, res) => {
  const body = req.body || {};
  config = {
    botToken: body.botToken || config.botToken,
    guildId: body.guildId || config.guildId,
    voiceChannelId: body.voiceChannelId || config.voiceChannelId,
    trackedMember: body.trackedMember || config.trackedMember
  };
  res.json({ ok: true, config });
});

// Mount API router under /api
app.use('/api', api);

const server = http.createServer(app);
// Expose WebSocket under /api/ws
const wss = new WebSocket.Server({ server, path: '/api/ws' });

const broadcast = (type, payload) => {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
};

// Heartbeat broadcast every 5 seconds
setInterval(() => {
  broadcast('heartbeat', { status: 'alive' });
}, 5000);

wss.on('connection', (ws, req) => {
  // Validate token in query string (?token=...)
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const token = url.searchParams.get('token') || '';
    const payload = verifyToken(token);
    if (!payload) {
      ws.close(1008, 'Invalid token');
      return;
    }
    ws.user = payload;
  } catch {
    ws.close(1008, 'Auth error');
    return;
  }
  // Immediately send the current snapshot
  ws.send(JSON.stringify({ type: 'snapshot', payload: state, ts: Date.now() }));

  ws.on('message', (data) => {
    // Future work: handle client requests
    try {
      const msg = JSON.parse(data.toString());
      if (msg?.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    } catch (_) {
      // ignore
    }
  });
});

// -----------------------------
// Discord integration via .env
// Expected environment variables:
// - DISCORD_BOT_TOKEN (required for login)
// - GUILD_ID (optional for future purposes)
// - VOICE_CHANNEL_ID (optional: if set, populate members from that channel)
const ENV = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
  GUILD_ID: process.env.GUILD_ID || '',
  VOICE_CHANNEL_ID: process.env.VOICE_CHANNEL_ID || ''
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

async function refreshMembersFromChannel(voiceChannelId) {
  if (!voiceChannelId) return;
  try {
    const channel = await client.channels.fetch(voiceChannelId);
    // 2 = GuildVoice in discord.js v14 (ChannelType.GuildVoice)
    if (!channel || channel.type !== 2) return;

    const members = [];
    channel.members.forEach((member) => {
      members.push({
        id: member.id,
        name: member.displayName,
        mute: Boolean(member.voice?.mute || member.voice?.selfMute),
        deaf: Boolean(member.voice?.deaf || member.voice?.selfDeaf)
      });
    });

    state.members = members;
    state.updatedAt = new Date().toISOString();
    broadcast('voice_state_update', state);
  } catch (err) {
    console.error('[discord-service] Error in refreshMembersFromChannel:', err?.message || err);
  }
}

async function ensureDiscordLogin() {
  if (!ENV.DISCORD_BOT_TOKEN) {
    console.warn('[discord-service] DISCORD_BOT_TOKEN not set. Create a .env file and restart.');
    return;
  }
  if (client.user) return; // already logged in
  try {
    await client.login(ENV.DISCORD_BOT_TOKEN);
  } catch (err) {
    console.error('[discord-service] Discord login failed:', err?.message || err);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`[discord-service] Discord client ready as ${client.user.tag}`);
  if (ENV.VOICE_CHANNEL_ID) {
    await refreshMembersFromChannel(ENV.VOICE_CHANNEL_ID);
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const vcId = ENV.VOICE_CHANNEL_ID;
  if (!vcId) return;
  if (oldState.channelId === vcId || newState.channelId === vcId) {
    await refreshMembersFromChannel(vcId);
  }
});

// Log in if possible
ensureDiscordLogin().then(() => console.log('[discord-service] Discord client logged in'));

server.listen(PORT, () => {
  console.log(`[discord-service] Listening on http://127.0.0.1:${PORT}`);
});
