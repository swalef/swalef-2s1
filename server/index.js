const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const { getRandomWord, getCategories } = require('./words');

const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : true;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins === true ? (origin, callback) => callback(null, true) : allowedOrigins,
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});



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
    res.status(500).json({ error: 'خطأ في الخادم: ' + (err.message || 'حاول مرة أخرى') });
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
    res.status(500).json({ error: 'خطأ في الخادم: ' + (err.message || 'حاول مرة أخرى') });
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
      const cleanCode = code ? String(code).trim().toUpperCase() : '';
      if (!cleanCode) return callback?.({ error: 'يرجى إدخال كود الغرفة' });

      const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(cleanCode);
      if (!room) return callback?.({ error: 'كود الغرفة غير صحيح أو الغرفة غير موجودة' });
      if (room.status !== 'waiting') return callback?.({ error: 'اللعبة بدأت مسبقاً في هذه الغرفة' });

      const countRow = db.prepare('SELECT COUNT(*) as count FROM room_players WHERE room_id = ?').get(room.id);
      const playerCount = countRow ? (countRow.count ?? countRow.c ?? 0) : 0;
      if (playerCount >= room.max_players) return callback?.({ error: 'الغرفة ممتلئة بالكامل' });

      // Check if already in room
      const existing = db.prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ?').get(room.id, socket.user.id);
      if (!existing) {
        db.prepare('INSERT INTO room_players (room_id, user_id) VALUES (?, ?)').run(room.id, socket.user.id);
      }

      socket.join(room.id);
      socket.currentRoom = room.id;

      const roomData = getRoomData(room.id);
      callback?.({ success: true, room: roomData });
      io.to(room.id).emit('room_updated', roomData);
      io.to(room.id).emit('player_joined', { username: socket.user.username });

      // Auto-start timer if 5+ players
      if (roomData && roomData.players) {
        checkAndStartWaitingTimer(room.id, roomData.players.length);
      }
    } catch (err) {
      console.error('Join room error:', err);
      callback?.({ error: 'فشل الانضمام للغرفة: ' + (err.message || 'حاول مجدداً') });
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
      const minRequired = Math.min(room.min_players || 3, 2);
      if (players.length < minRequired) {
        return callback?.({ error: `يجب أن يكون هناك لاعبان على الأقل لبدء اللعبة` });
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

  // ---- PLAYER TURN: Asker chooses who to ask ----
  socket.on('select_target', ({ targetId }, callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return callback?.({ error: 'لست في غرفة' });

      const state = activeRooms.get(roomId);
      if (!state || !state.askersOrder) {
        return callback?.({ error: 'لا توجد جولة نشطة' });
      }

      const currentAsker = state.askersOrder[state.currentAskerIndex];
      if (currentAsker !== socket.user.id) {
        return callback?.({ error: 'ليس دورك في طرح السؤال' });
      }

      if (targetId === socket.user.id) {
        return callback?.({ error: 'لا يمكنك سؤال نفسك' });
      }

      state.currentAnswererId = targetId;

      io.to(roomId).emit('dialog_started', {
        askerId: currentAsker,
        answererId: targetId
      });

      callback?.({ success: true });
    } catch (err) {
      console.error('Select target error:', err);
      callback?.({ error: 'خطأ في توجيه السؤال' });
    }
  });

  // ---- FINISH QUESTION: move to next asker or voting ----
  socket.on('finish_question', (callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return callback?.({ error: 'لست في غرفة' });

      const state = activeRooms.get(roomId);
      if (!state || !state.askersOrder) {
        return callback?.({ error: 'لا توجد جولة نشطة' });
      }

      const currentAsker = state.askersOrder[state.currentAskerIndex];
      const room = db.prepare('SELECT host_id FROM rooms WHERE id = ?').get(roomId);

      // Either asker, answerer, or host can conclude the question
      const isAllowed = socket.user.id === currentAsker ||
                        socket.user.id === state.currentAnswererId ||
                        socket.user.id === room?.host_id;

      if (!isAllowed) {
        return callback?.({ error: 'فقط السائل أو المجيب يمكنه إنهاء السؤال' });
      }

      const prevAsker = currentAsker;
      const prevAnswerer = state.currentAnswererId;
      state.currentAnswererId = null;
      state.currentAskerIndex++;

      io.to(roomId).emit('question_done', {
        askerId: prevAsker,
        answererId: prevAnswerer
      });

      // Check if all players have completed their question turn
      if (state.currentAskerIndex >= state.askersOrder.length) {
        const session = db.prepare('SELECT * FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
        if (session) {
          db.prepare('UPDATE game_sessions SET phase = ? WHERE id = ?').run('voting', session.id);
          db.prepare('DELETE FROM votes WHERE session_id = ?').run(session.id);
          io.to(roomId).emit('voting_started', {
            sessionId: session.id,
            round: state.round || 1
          });
        }
      } else {
        const nextAsker = state.askersOrder[state.currentAskerIndex];
        io.to(roomId).emit('turn_changed', {
          currentAsker: nextAsker,
          askerIndex: state.currentAskerIndex,
          totalAskers: state.askersOrder.length
        });
      }

      callback?.({ success: true });
    } catch (err) {
      console.error('Finish question error:', err);
      callback?.({ error: 'خطأ' });
    }
  });

  // ---- REQUEST VOTING (Host skip) ----
  socket.on('request_vote', (callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
      if (room?.host_id !== socket.user.id) return callback?.({ error: 'فقط المضيف يمكنه طلب التصويت' });

      const session = db.prepare('SELECT * FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
      if (!session) return;

      const state = activeRooms.get(roomId);
      db.prepare('UPDATE game_sessions SET phase = ? WHERE id = ?').run('voting', session.id);
      db.prepare('DELETE FROM votes WHERE session_id = ?').run(session.id);

      io.to(roomId).emit('voting_started', { sessionId: session.id, round: state?.round || 1 });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ error: 'خطأ' });
    }
  });

  // ---- WEBRTC NATIVE AUDIO SIGNALING ----
  socket.on('webrtc_join', () => {
    const roomId = socket.currentRoom;
    if (!roomId) return;
    // Broadcast to others in the room that this socket is ready for WebRTC audio
    socket.to(roomId).emit('webrtc_peer_joined', {
      socketId: socket.id,
      userId: socket.user.id,
      username: socket.user.username
    });
  });

  socket.on('webrtc_signal', ({ targetSocketId, signal }) => {
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('webrtc_signal', {
      senderSocketId: socket.id,
      userId: socket.user.id,
      signal
    });
  });

  // ---- RESET GAME / NEW ROUND ----
  socket.on('reset_game', (callback) => {
    try {
      const roomId = socket.currentRoom;
      if (!roomId) return callback?.({ error: 'لست في غرفة' });

      const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
      if (!room) return callback?.({ error: 'الغرفة غير موجودة' });
      if (room.host_id !== socket.user.id) return callback?.({ error: 'فقط المضيف يمكنه بدء جولة جديدة' });

      db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('waiting', roomId);
      const session = db.prepare('SELECT id FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
      if (session) {
        db.prepare('UPDATE game_sessions SET ended_at = CURRENT_TIMESTAMP, phase = ? WHERE id = ?').run('ended', session.id);
        db.prepare('DELETE FROM votes WHERE session_id = ?').run(session.id);
      }
      const roomData = getRoomData(roomId);
      if (roomData) io.to(roomId).emit('room_reset', roomData);
      callback?.({ success: true });
    } catch (err) {
      console.error('Reset game error:', err);
      callback?.({ error: 'فشل إعادة ضبط الغرفة' });
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
  const userId = socket.user?.id;
  if (!userId) return;

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return;

  db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);

  const remaining = db.prepare('SELECT user_id FROM room_players WHERE room_id = ? ORDER BY joined_at ASC').all(roomId);

  if (remaining.length === 0) {
    db.prepare('DELETE FROM chat_messages WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM votes WHERE session_id IN (SELECT id FROM game_sessions WHERE room_id = ?)').run(roomId);
    db.prepare('DELETE FROM game_sessions WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM room_players WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    const state = activeRooms.get(roomId);
    if (state?.waitingTimer) clearTimeout(state.waitingTimer);
    activeRooms.delete(roomId);
    socket.currentRoom = null;
    return;
  }

  // Transfer host if host left
  if (room.host_id === userId) {
    const newHostId = remaining[0].user_id;
    db.prepare('UPDATE rooms SET host_id = ? WHERE id = ?').run(newHostId, roomId);
    io.to(roomId).emit('host_changed', { newHostId });
  }

  // Handle active game if playing
  if (room.status === 'playing') {
    if (remaining.length < 2) {
      db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('waiting', roomId);
      db.prepare('UPDATE game_sessions SET ended_at = CURRENT_TIMESTAMP, phase = ? WHERE room_id = ? AND ended_at IS NULL').run('ended', roomId);
      io.to(roomId).emit('game_cancelled', { message: 'تم إنهاء الجولة لعدم توفر عدد كافٍ من اللاعبين' });
    } else {
      const session = db.prepare('SELECT * FROM game_sessions WHERE room_id = ? AND ended_at IS NULL').get(roomId);
      if (session) {
        if (session.current_turn_user_id === userId) {
          const nextTurnUserId = remaining[0].user_id;
          db.prepare('UPDATE game_sessions SET current_turn_user_id = ? WHERE id = ?').run(nextTurnUserId, session.id);
          io.to(roomId).emit('turn_changed', { currentTurn: nextTurnUserId, askedBy: null });
        }
        if (session.phase === 'voting') {
          const votes = db.prepare('SELECT * FROM votes WHERE session_id = ?').all(session.id);
          if (votes.length >= remaining.length) {
            resolveVotes(roomId, session, remaining);
          }
        }
      }
    }
  }

  const roomData = getRoomData(roomId);
  if (roomData) {
    io.to(roomId).emit('room_updated', roomData);
    io.to(roomId).emit('player_left', { username: socket.user?.username });
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
    const state = activeRooms.get(roomId) || {};
    if (state.waitingTimer) {
      clearTimeout(state.waitingTimer);
      state.waitingTimer = null;
    }

    db.prepare('UPDATE rooms SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?').run('playing', roomId);

    const playerList = players.map(p => p.user_id);
    const numImpostors = playerList.length >= 7 ? 2 : 1;
    const shuffledImpostors = [...playerList].sort(() => Math.random() - 0.5);
    const impostors = shuffledImpostors.slice(0, numImpostors);

    const word = getRandomWord(room.category);
    const sessionId = uuidv4();

    // Determine asking order: everyone gets exactly one turn to ask
    const askersOrder = [...playerList].sort(() => Math.random() - 0.5);
    const firstAsker = askersOrder[0];

    db.prepare('INSERT INTO game_sessions (id, room_id, word, impostor_ids, current_turn_user_id) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, roomId, word, JSON.stringify(impostors), firstAsker);

    activeRooms.set(roomId, {
      ...state,
      askersOrder,
      currentAskerIndex: 0,
      currentAnswererId: null,
      round: 1,
      maxRounds: 3,
      impostors,
      word
    });

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
            currentAsker: firstAsker,
            askersOrder,
            round: 1,
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
  const state = activeRooms.get(roomId) || {};

  const eliminatedUser = db.prepare('SELECT username, avatar_color FROM users WHERE id = ?').get(topVoted);
  const impostorUsers = impostors.map(id => db.prepare('SELECT username, avatar_color FROM users WHERE id = ?').get(id));

  if (isImpostorEliminated) {
    // Impostor discovered! Citizens WIN!
    const winner = 'citizens';
    db.prepare('UPDATE game_sessions SET ended_at = CURRENT_TIMESTAMP, winner = ?, phase = ? WHERE id = ?')
      .run(winner, 'ended', session.id);
    db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('ended', roomId);

    io.to(roomId).emit('game_ended', {
      winner,
      eliminatedPlayer: { id: topVoted, ...eliminatedUser },
      impostors: impostorUsers,
      word: session.word,
      wasImpostor: true,
      message: 'تم كشف المتسلل (برا السالفة)! فاز المواطنون'
    });
  } else {
    // Innocent citizen voted out or tie! Continue to next round!
    const nextRound = (state.round || 1) + 1;

    if (nextRound > 3) {
      // Impostor survived all 3 rounds! Impostor WINS!
      const winner = 'impostors';
      db.prepare('UPDATE game_sessions SET ended_at = CURRENT_TIMESTAMP, winner = ?, phase = ? WHERE id = ?')
        .run(winner, 'ended', session.id);
      db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('ended', roomId);

      io.to(roomId).emit('game_ended', {
        winner,
        eliminatedPlayer: { id: topVoted, ...eliminatedUser },
        impostors: impostorUsers,
        word: session.word,
        wasImpostor: false,
        message: 'نجح المتسلل في الإفلات طوال الجولات الثلاث! فاز المتسلل'
      });
    } else {
      // Advance to next round!
      state.round = nextRound;
      const remainingPlayers = allPlayers.map(p => p.user_id);
      state.askersOrder = [...remainingPlayers].sort(() => Math.random() - 0.5);
      state.currentAskerIndex = 0;
      state.currentAnswererId = null;

      db.prepare('UPDATE game_sessions SET round = ?, phase = ? WHERE id = ?').run(nextRound, 'discussion', session.id);
      db.prepare('DELETE FROM votes WHERE session_id = ?').run(session.id);

      io.to(roomId).emit('round_advanced', {
        round: nextRound,
        eliminatedPlayer: { id: topVoted, ...eliminatedUser },
        wasImpostor: false,
        currentAsker: state.askersOrder[0],
        askersOrder: state.askersOrder,
        message: `${eliminatedUser?.username || 'اللاعب'} كان داخل السالفة وبريئاً! تبدأ الجولة ${nextRound}`
      });
    }
  }
}

  // Reset room after 30 seconds
  setTimeout(() => {
    db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('waiting', roomId);
    db.prepare('DELETE FROM votes WHERE session_id = ?').run(session.id);
    const roomData = getRoomData(roomId);
    if (roomData) io.to(roomId).emit('room_reset', roomData);
  }, 30000);
}

// Serve static client files if built
const candidateDistDirs = [
  path.join(__dirname, '../client/dist'),
  path.join(__dirname, 'client/dist'),
  path.join(process.cwd(), 'client/dist'),
  path.join(process.cwd(), 'dist')
];
const clientDist = candidateDistDirs.find(d => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')));

if (clientDist) {
  console.log(`Serving client static files from: ${clientDist}`);
  app.use(express.static(clientDist));
  // Express 5 compatible SPA fallback
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    next();
  });
} else {
  app.get('/', (req, res) => {
    res.json({ status: 'ok', server: 'swalef', message: 'Ready. Build client with npm run build' });
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Swalef server running on http://0.0.0.0:${PORT}`);
});
