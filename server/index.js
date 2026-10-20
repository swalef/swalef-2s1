const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const { getRandomWord, getCategories } = require('./words');

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'swalef_super_secret_key_2024_game';
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// =====================
// AUTH ROUTES
// =====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة السر يجب أن تكون 6 أحرف على الأقل' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
    }

    // Check existing
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) return res.status(400).json({ error: 'البريد الإلكتروني مستخدم مسبقاً' });

    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) return res.status(400).json({ error: 'اسم المستخدم مستخدم مسبقاً' });

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    db.prepare('INSERT INTO users (id, email, password_hash, username, avatar_color) VALUES (?, ?, ?, ?, ?)')
      .run(id, email, passwordHash, username, avatarColor);

    const token = jwt.sign({ id, email, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, email, username, avatarColor } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'البريد وكلمة السر مطلوبان' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة السر غير صحيحة' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة السر غير صحيحة' });

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, username: user.username, avatarColor: user.avatar_color } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Verify token
app.get('/api/auth/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, username, avatar_color FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });

    res.json({ user: { id: user.id, email: user.email, username: user.username, avatarColor: user.avatar_color } });
  } catch (err) {
    res.status(401).json({ error: 'رمز غير صالح' });
  }
});

// Update username
app.put('/api/auth/username', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const { username } = req.body;
    if (!username || username.length < 3) return res.status(400).json({ error: 'اسم المستخدم قصير جداً' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, decoded.id);
    if (existing) return res.status(400).json({ error: 'اسم المستخدم مستخدم مسبقاً' });

    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, decoded.id);
    const newToken = jwt.sign({ id: decoded.id, email: decoded.email, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: newToken, username });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// =====================
// ROOM ROUTES
// =====================

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Get public rooms
app.get('/api/rooms/public', (req, res) => {
  try {
    const rooms = db.prepare(`
      SELECT r.*, u.username as host_name, u.avatar_color as host_color,
             COUNT(rp.user_id) as player_count
      FROM rooms r
      JOIN users u ON r.host_id = u.id
      LEFT JOIN room_players rp ON r.id = rp.room_id
      WHERE r.is_public = 1 AND r.status = 'waiting'
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 20
    `).all();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// Get categories
app.get('/api/categories', (req, res) => {
  res.json(getCategories());
});

// =====================
// MIDDLEWARE: Auth
// =====================
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'رمز غير صالح' });
  }
}

// =====================
// SOCKET.IO
// =====================

// In-memory game state
const activeRooms = new Map(); // roomId -> { players, gameState, timer }

function getRoomData(roomId) {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return null;
  const players = db.prepare(`
    SELECT u.id, u.username, u.avatar_color, rp.is_ready, rp.joined_at
    FROM room_players rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.room_id = ?
    ORDER BY rp.joined_at ASC
  `).all(roomId);
  return { ...room, players };
}

function verifySocketToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const user = verifySocketToken(token);
  if (!user) return next(new Error('Authentication failed'));
  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);

  // ---- CREATE ROOM ----
  socket.on('create_room', ({ name, isPublic, category, maxPlayers }, callback) => {
    try {
      let code = generateRoomCode();
      // Ensure unique code
      while (db.prepare('SELECT id FROM rooms WHERE code = ?').get(code)) {
        code = generateRoomCode();
      }
      const roomId = uuidv4();
      db.prepare('INSERT INTO rooms (id, code, name, host_id, is_public, category, max_players) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(roomId, code, name || `غرفة ${socket.user.username}`, socket.user.id, isPublic ? 1 : 0, category || 'عام', maxPlayers || 10);
      db.prepare('INSERT INTO room_players (room_id, user_id) VALUES (?, ?)').run(roomId, socket.user.id);

      socket.join(roomId);
      socket.currentRoom = roomId;

      const roomData = getRoomData(roomId);
      activeRooms.set(roomId, { waitingTimer: null });

      callback({ success: true, room: roomData });
      io.to(roomId).emit('room_updated', roomData);
    } catch (err) {
      console.error('Create room error:', err);
      callback({ error: 'فشل إنشاء الغرفة' });
    }
  });

  // ---- JOIN ROOM BY CODE ----
  socket.on('join_room', ({ code }, callback) => {
    try {
      const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code?.toUpperCase());
      if (!room) return callback({ error: 'كود الغرفة غير صحيح' });
      if (room.status !== 'waiting') return callback({ error: 'اللعبة بدأت مسبقاً' });

      const playerCount = db.prepare('SELECT COUNT(*) as c FROM room_players WHERE room_id = ?').get(room.id).c;
      if (playerCount >= room.max_players) return callback({ error: 'الغرفة ممتلئة' });

      // Check if already in room
      const existing = db.prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ?').get(room.id, socket.user.id);
      if (!existing) {
        db.prepare('INSERT INTO room_players (room_id, user_id) VALUES (?, ?)').run(room.id, socket.user.id);
      }

      socket.join(room.id);
      socket.currentRoom = room.id;

      const roomData = getRoomData(room.id);
      callback({ success: true, room: roomData });
      io.to(room.id).emit('room_updated', roomData);
      io.to(room.id).emit('player_joined', { username: socket.user.username });

      // Auto-start timer if 5+ players
      checkAndStartWaitingTimer(room.id, roomData.players.length);
    } catch (err) {
      console.error('Join room error:', err);
      callback({ error: 'فشل الانضمام للغرفة' });
    }
  });

  // ---- JOIN RANDOM ROOM ----
  socket.on('join_random', (callback) => {
    try {
      const room = db.prepare(`
        SELECT r.* FROM rooms r
        LEFT JOIN room_players rp ON r.id = rp.room_id
        WHERE r.is_public = 1 AND r.status = 'waiting'
        GROUP BY r.id
        HAVING COUNT(rp.user_id) < r.max_players AND r.id != ?
        ORDER BY RANDOM()
        LIMIT 1
      `).get(socket.user.id);

      if (!room) return callback({ error: 'لا توجد غرف متاحة، أنشئ غرفة جديدة!' });

      const existing = db.prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ?').get(room.id, socket.user.id);
      if (!existing) {
        db.prepare('INSERT INTO room_players (room_id, user_id) VALUES (?, ?)').run(room.id, socket.user.id);
      }

      socket.join(room.id);
      socket.currentRoom = room.id;

      const roomData = getRoomData(room.id);
      callback({ success: true, room: roomData });
      io.to(room.id).emit('room_updated', roomData);
      io.to(room.id).emit('player_joined', { username: socket.user.username });

      checkAndStartWaitingTimer(room.id, roomData.players.length);
    } catch (err) {
      callback({ error: 'خطأ في الخادم' });
    }
  });

  // ---- LEAVE ROOM ----
  socket.on('leave_room', (callback) => {
    leaveCurrentRoom(socket);
    if (callback) callback({ success: true });
  });

  // ---- ADMIN: START GAME ----
  socket.on('start_game', (callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return callback?.({ error: 'لست في غرفة' });

      const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
      if (!room) return callback?.({ error: 'الغرفة غير موجودة' });
      if (room.host_id !== socket.user.id) return callback?.({ error: 'فقط مضيف الغرفة يمكنه البدء' });

      const players = db.prepare('SELECT user_id FROM room_players WHERE room_id = ?').all(roomId);
      if (players.length < room.min_players) {
        return callback?.({ error: `يجب أن يكون هناك ${room.min_players} لاعبين على الأقل` });
      }

      startGame(roomId, room, players);
      callback?.({ success: true });
    } catch (err) {
      console.error('Start game error:', err);
      callback?.({ error: 'فشل بدء اللعبة' });
    }
  });

  // ---- CHAT ----
  socket.on('send_chat', ({ message, type }) => {
    const roomId = socket.currentRoom;
    if (!roomId || !message?.trim()) return;

    const msgId = uuidv4();
    db.prepare('INSERT INTO chat_messages (id, room_id, user_id, message, type) VALUES (?, ?, ?, ?, ?)')
      .run(msgId, roomId, socket.user.id, message.trim(), type || 'text');

    const user = db.prepare('SELECT username, avatar_color FROM users WHERE id = ?').get(socket.user.id);
    io.to(roomId).emit('chat_message', {
      id: msgId,
      userId: socket.user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      message: message.trim(),
      type: type || 'text',
      timestamp: new Date().toISOString()
    });
  });

  // ---- VOTE ----
  socket.on('cast_vote', ({ targetId }, callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return callback?.({ error: 'لست في غرفة' });

      const session = db.prepare('SELECT * FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
      if (!session) return callback?.({ error: 'لا توجد جلسة نشطة' });
      if (session.phase !== 'voting') return callback?.({ error: 'ليس وقت التصويت' });

      // Check if target is in game
      const players = JSON.parse(session.impostor_ids || '[]');

      db.prepare('INSERT OR REPLACE INTO votes (session_id, voter_id, voted_for_id) VALUES (?, ?, ?)')
        .run(session.id, socket.user.id, targetId);

      const allPlayers = db.prepare('SELECT user_id FROM room_players WHERE room_id = ?').all(roomId);
      const votes = db.prepare('SELECT * FROM votes WHERE session_id = ?').all(session.id);

      io.to(roomId).emit('vote_update', { votes: votes.map(v => ({ voterId: v.voter_id, targetId: v.voted_for_id })) });

      if (votes.length >= allPlayers.length) {
        resolveVotes(roomId, session, allPlayers);
      }

      callback?.({ success: true });
    } catch (err) {
      callback?.({ error: 'خطأ في التصويت' });
    }
  });

  // ---- PLAYER TURN: choose who to ask ----
  socket.on('select_target', ({ targetId }, callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      const session = db.prepare('SELECT * FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
      if (!session || session.current_turn_user_id !== socket.user.id) {
        return callback?.({ error: 'ليس دورك' });
      }

      db.prepare('UPDATE game_sessions SET current_turn_user_id = ? WHERE id = ?').run(targetId, session.id);
      io.to(roomId).emit('turn_changed', { currentTurn: targetId, askedBy: socket.user.id });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ error: 'خطأ' });
    }
  });

  // ---- REQUEST VOTING ----
  socket.on('request_vote', (callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
      if (room?.host_id !== socket.user.id) return callback?.({ error: 'فقط المضيف يمكنه طلب التصويت' });

      const session = db.prepare('SELECT * FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
      if (!session) return;

      db.prepare('UPDATE game_sessions SET phase = ? WHERE id = ?').run('voting', session.id);
      // Clear votes for this session
      db.prepare('DELETE FROM votes WHERE session_id = ?').run(session.id);

      io.to(roomId).emit('voting_started', { sessionId: session.id });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ error: 'خطأ' });
    }
  });

  // ---- NEXT TURN ----
  socket.on('end_my_turn', (callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      const session = db.prepare('SELECT * FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
      if (!session || session.current_turn_user_id !== socket.user.id) {
        return callback?.({ error: 'ليس دورك' });
      }

      // Next turn goes back to previous asker to choose next person
      // Actually, after someone answers, the questioner picks the next target
      // Let's emit that the answer is done
      io.to(roomId).emit('answer_done', { answererId: socket.user.id });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ error: 'خطأ' });
    }
  });

  // ---- AGORA TOKEN (simplified - no token for dev) ----
  socket.on('get_agora_token', ({ channelName }, callback) => {
    // In production, generate Agora token. For dev, return null (no token mode)
    callback({ token: null, uid: Math.floor(Math.random() * 100000) });
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user?.username}`);
    leaveCurrentRoom(socket);
  });
});

// =====================
// HELPER FUNCTIONS
// =====================

function leaveCurrentRoom(socket) {
  const roomId = socket.currentRoom;
  if (!roomId) return;

  socket.leave(roomId);
  const userId = socket.user.id;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return;

  db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);

  // If host left and game hasn't started, transfer host or delete room
  if (room.host_id === userId && room.status === 'waiting') {
    const remaining = db.prepare('SELECT user_id FROM room_players WHERE room_id = ? ORDER BY joined_at ASC').all(roomId);
    if (remaining.length === 0) {
      // Delete child records first (FK constraint order)
      db.prepare('DELETE FROM chat_messages WHERE room_id = ?').run(roomId);
      db.prepare('DELETE FROM votes WHERE session_id IN (SELECT id FROM game_sessions WHERE room_id = ?)').run(roomId);
      db.prepare('DELETE FROM game_sessions WHERE room_id = ?').run(roomId);
      db.prepare('DELETE FROM room_players WHERE room_id = ?').run(roomId);
      db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
      const state = activeRooms.get(roomId);
      if (state?.waitingTimer) clearTimeout(state.waitingTimer);
      activeRooms.delete(roomId);
      return;
    } else {
      const newHostId = remaining[0].user_id;
      db.prepare('UPDATE rooms SET host_id = ? WHERE id = ?').run(newHostId, roomId);
      io.to(roomId).emit('host_changed', { newHostId });
    }
  }

  const roomData = getRoomData(roomId);
  if (roomData) {
    io.to(roomId).emit('room_updated', roomData);
    io.to(roomId).emit('player_left', { username: socket.user.username });
  }
  socket.currentRoom = null;
}

function checkAndStartWaitingTimer(roomId, playerCount) {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room || room.status !== 'waiting') return;

  const state = activeRooms.get(roomId) || {};
  if (state.waitingTimer) return; // Timer already running

  if (playerCount >= room.min_players) {
    // Start 5-minute timer
    io.to(roomId).emit('waiting_timer_start', { seconds: 300 });
    const timer = setTimeout(() => {
      const currentRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
      if (currentRoom?.status === 'waiting') {
        const players = db.prepare('SELECT user_id FROM room_players WHERE room_id = ?').all(roomId);
        if (players.length >= currentRoom.min_players) {
          startGame(roomId, currentRoom, players);
        }
      }
    }, 300000); // 5 minutes
    state.waitingTimer = timer;
    activeRooms.set(roomId, state);
  }
}

function startGame(roomId, room, players) {
  try {
    const state = activeRooms.get(roomId);
    if (state?.waitingTimer) {
      clearTimeout(state.waitingTimer);
      if (state) state.waitingTimer = null;
    }

    db.prepare('UPDATE rooms SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?').run('playing', roomId);

    // Select impostors (1 for 4-6 players, 2 for 7+ players)
    const playerList = players.map(p => p.user_id);
    const numImpostors = playerList.length >= 7 ? 2 : 1;
    const shuffled = [...playerList].sort(() => Math.random() - 0.5);
    const impostors = shuffled.slice(0, numImpostors);

    const word = getRandomWord(room.category);
    const sessionId = uuidv4();
    const firstTurn = playerList[Math.floor(Math.random() * playerList.length)];

    db.prepare('INSERT INTO game_sessions (id, room_id, word, impostor_ids, current_turn_user_id) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, roomId, word, JSON.stringify(impostors), firstTurn);

    // Notify each player individually about their role
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (sockets) {
      sockets.forEach(socketId => {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.user) {
          const isImpostor = impostors.includes(s.user.id);
          s.emit('game_started', {
            sessionId,
            word: isImpostor ? null : word,
            role: isImpostor ? 'impostor' : 'citizen',
            impostorCount: numImpostors,
            currentTurn: firstTurn,
            category: room.category
          });
        }
      });
    }

    console.log(`Game started in room ${roomId}. Word: ${word}, Impostors: ${impostors.length}`);
  } catch (err) {
    console.error('Start game error:', err);
  }
}

function resolveVotes(roomId, session, allPlayers) {
  const votes = db.prepare('SELECT voted_for_id, COUNT(*) as count FROM votes WHERE session_id = ? GROUP BY voted_for_id ORDER BY count DESC').all(session.id);

  if (votes.length === 0) return;

  const topVoted = votes[0].voted_for_id;
  const impostors = JSON.parse(session.impostor_ids);
  const isImpostorEliminated = impostors.includes(topVoted);

  const winner = isImpostorEliminated ? 'citizens' : 'impostors';
  db.prepare('UPDATE game_sessions SET ended_at = CURRENT_TIMESTAMP, winner = ?, phase = ? WHERE id = ?')
    .run(winner, 'ended', session.id);
  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('ended', roomId);

  const eliminatedUser = db.prepare('SELECT username, avatar_color FROM users WHERE id = ?').get(topVoted);
  const impostorUsers = impostors.map(id => db.prepare('SELECT username, avatar_color FROM users WHERE id = ?').get(id));

  io.to(roomId).emit('game_ended', {
    winner,
    eliminatedPlayer: { id: topVoted, ...eliminatedUser },
    impostors: impostorUsers,
    word: session.word,
    wasImpostor: isImpostorEliminated
  });

  // Reset room after 30 seconds
  setTimeout(() => {
    db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('waiting', roomId);
    db.prepare('DELETE FROM votes WHERE session_id = ?').run(session.id);
    const roomData = getRoomData(roomId);
    if (roomData) io.to(roomId).emit('room_reset', roomData);
  }, 30000);
}

server.listen(PORT, () => {
  console.log(`🎮 Swalef Server running on http://localhost:${PORT}`);
});
