const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware - IMPORTANT for game client to connect
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const banList = new Map();
const muteList = new Map();
const moderators = new Set([22358445]);

function decode(encodedData) {
  try {
    const decoded = Buffer.from(encodedData, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('[DECODE ERROR]', error.message);
    return null;
  }
}

function encode(data) {
  const jsonString = JSON.stringify(data);
  return Buffer.from(jsonString).toString('base64');
}

function sendResponse(res, data) {
  const response = {
    result: 1,
    data: data
  };
  const encoded = encode(response);
  res.send(encoded);
}

function isModerator(userId) {
  return moderators.has(userId);
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Day R Moderation Server',
    endpoints: {
      ban: 'POST /api/moderation/ban',
      unban: 'POST /api/moderation/unban',
      mute: 'POST /api/moderation/mute',
      unmute: 'POST /api/moderation/unmute',
      banlist: 'GET /api/moderation/banlist',
      mutelist: 'GET /api/moderation/mutelist',
      status: 'GET /api/moderation/status/:userId'
    }
  });
});

// Ping endpoint for connection testing
app.get('/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

app.post('/api/moderation/ban', (req, res) => {
  console.log('[BAN REQUEST] Received');
  console.log('[BAN REQUEST] Body:', req.body);
  
  const decoded = decode(req.body.data);
  console.log('[BAN REQUEST] Decoded:', decoded);
  
  if (!decoded) {
    console.log('[BAN ERROR] Failed to decode data');
    return sendResponse(res, { success: false, error: "Invalid data" });
  }
  
  if (!isModerator(decoded.moderator_id)) {
    console.log('[BAN ERROR] Unauthorized moderator:', decoded.moderator_id);
    return sendResponse(res, { success: false, error: "Unauthorized" });
  }
  
  const { user_id, moderator_id, reason, timestamp } = decoded;
  
  banList.set(user_id, {
    user_id,
    moderator_id,
    reason: reason || "No reason provided",
    timestamp: timestamp || Date.now()
  });
  
  console.log(`[BAN] ✓ User ${user_id} banned by ${moderator_id}. Reason: ${reason}`);
  
  sendResponse(res, { success: true, user_id });
});

app.post('/api/moderation/unban', (req, res) => {
  console.log('[UNBAN REQUEST] Received');
  
  const decoded = decode(req.body.data);
  
  if (!decoded || !isModerator(decoded.moderator_id)) {
    return sendResponse(res, { success: false, error: "Unauthorized" });
  }
  
  const { user_id, moderator_id } = decoded;
  
  if (banList.has(user_id)) {
    banList.delete(user_id);
    console.log(`[UNBAN] ✓ User ${user_id} unbanned by ${moderator_id}`);
    sendResponse(res, { success: true, user_id });
  } else {
    console.log(`[UNBAN] User ${user_id} was not banned`);
    sendResponse(res, { success: false, error: "User not banned" });
  }
});

app.post('/api/moderation/mute', (req, res) => {
  console.log('[MUTE REQUEST] Received');
  
  const decoded = decode(req.body.data);
  
  if (!decoded || !isModerator(decoded.moderator_id)) {
    return sendResponse(res, { success: false, error: "Unauthorized" });
  }
  
  const { user_id, moderator_id, duration, reason, timestamp, expires_at } = decoded;
  
  muteList.set(user_id, {
    user_id,
    moderator_id,
    duration: duration || 60,
    reason: reason || "No reason provided",
    timestamp: timestamp || Date.now(),
    expires_at: expires_at || (Date.now() + (duration * 1000))
  });
  
  console.log(`[MUTE] ✓ User ${user_id} muted for ${duration}s by ${moderator_id}. Reason: ${reason}`);
  
  sendResponse(res, { success: true, user_id });
});

app.post('/api/moderation/unmute', (req, res) => {
  console.log('[UNMUTE REQUEST] Received');
  
  const decoded = decode(req.body.data);
  
  if (!decoded || !isModerator(decoded.moderator_id)) {
    return sendResponse(res, { success: false, error: "Unauthorized" });
  }
  
  const { user_id, moderator_id } = decoded;
  
  if (muteList.has(user_id)) {
    muteList.delete(user_id);
    console.log(`[UNMUTE] ✓ User ${user_id} unmuted by ${moderator_id}`);
    sendResponse(res, { success: true, user_id });
  } else {
    console.log(`[UNMUTE] User ${user_id} was not muted`);
    sendResponse(res, { success: false, error: "User not muted" });
  }
});

app.get('/api/moderation/banlist', (req, res) => {
  const bans = Array.from(banList.values());
  console.log(`[BANLIST] Returning ${bans.length} bans`);
  sendResponse(res, { bans });
});

app.get('/api/moderation/mutelist', (req, res) => {
  const now = Date.now();
  const mutes = Array.from(muteList.values()).filter(mute => {
    if (mute.expires_at < now) {
      muteList.delete(mute.user_id);
      return false;
    }
    return true;
  });
  
  console.log(`[MUTELIST] Returning ${mutes.length} active mutes`);
  sendResponse(res, { mutes });
});

app.get('/api/moderation/status/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const isBanned = banList.has(userId);
  const muteInfo = muteList.get(userId);
  
  let isMuted = false;
  if (muteInfo && muteInfo.expires_at > Date.now()) {
    isMuted = true;
  } else if (muteInfo) {
    muteList.delete(userId);
  }
  
  console.log(`[STATUS] User ${userId}: Banned=${isBanned}, Muted=${isMuted}`);
  
  sendResponse(res, {
    user_id: userId,
    is_banned: isBanned,
    is_muted: isMuted,
    ban_info: isBanned ? banList.get(userId) : null,
    mute_info: isMuted ? muteInfo : null
  });
});

// Auto-cleanup expired mutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, muteInfo] of muteList.entries()) {
    if (muteInfo.expires_at < now) {
      muteList.delete(userId);
      console.log(`[AUTO-UNMUTE] User ${userId} mute expired`);
    }
  }
}, 30000);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Day R Moderation Server Running`);
  console.log(`Port: ${PORT}`);
  console.log(`=================================`);
  console.log(`Moderators: ${Array.from(moderators).join(', ')}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/moderation/ban`);
  console.log(`  POST /api/moderation/unban`);
  console.log(`  POST /api/moderation/mute`);
  console.log(`  POST /api/moderation/unmute`);
  console.log(`  GET  /api/moderation/banlist`);
  console.log(`  GET  /api/moderation/mutelist`);
  console.log(`  GET  /api/moderation/status/:userId`);
  console.log(`  GET  /ping (health check)`);
  console.log(`=================================\n`);
  console.log(`Waiting for commands...`);
});