require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const PORT = process.env.PORT ? Number(process.env.PORT) : 5090;

// Stato in memoria: verrà aggiornato dagli eventi Discord
const state = {
  members: [],
  tracked: null,
  updatedAt: new Date().toISOString()
};

const app = express();
app.use(express.json());

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'discord-service', time: new Date().toISOString() });
});

// Snapshot corrente (placeholder)
app.get('/snapshot', (_req, res) => {
  res.json({
    ok: true,
    data: state
  });
});

// Endpoint di configurazione (per compatibilità: salva in memoria ma l'autenticazione usa .env)
let config = {
  botToken: '',
  guildId: '',
  voiceChannelId: '',
  trackedMember: { mode: 'id', value: '' }
};

app.get('/config', (_req, res) => {
  res.json({ ok: true, config });
});

app.post('/config', (req, res) => {
  const body = req.body || {};
  config = {
    botToken: body.botToken || config.botToken,
    guildId: body.guildId || config.guildId,
    voiceChannelId: body.voiceChannelId || config.voiceChannelId,
    trackedMember: body.trackedMember || config.trackedMember
  };
  res.json({ ok: true, config });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const broadcast = (type, payload) => {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
};

// Heartbeat broadcast ogni 5 secondi
setInterval(() => {
  broadcast('heartbeat', { status: 'alive' });
}, 5000);

wss.on('connection', (ws) => {
  // Invia subito lo snapshot corrente
  ws.send(JSON.stringify({ type: 'snapshot', payload: state, ts: Date.now() }));

  ws.on('message', (data) => {
    // In futuro: gestire richieste del client
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
// Integrazione Discord via .env
// Variabili d'ambiente attese:
// - DISCORD_BOT_TOKEN (obbligatoria per collegarsi)
// - GUILD_ID (opzionale per scopi futuri)
// - VOICE_CHANNEL_ID (opzionale: se presente, popola members da quel canale)
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
  if (client.user) return; // già loggato
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

// Effettua il login se possibile
ensureDiscordLogin();

server.listen(PORT, () => {
  console.log(`[discord-service] Listening on http://127.0.0.1:${PORT}`);
});
