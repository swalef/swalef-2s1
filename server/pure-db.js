// Pure JavaScript Database Engine for Swalef Game
// 100% resilient - requires zero native C++ addons, works anywhere (Railway, Vercel, Node 18-24)
const fs = require('fs');
const path = require('path');
const os = require('os');

let storageFile;
try {
  const localPath = path.join(__dirname, 'swalef_data.json');
  fs.writeFileSync(localPath + '.test', '1');
  fs.unlinkSync(localPath + '.test');
  storageFile = localPath;
} catch (e) {
  storageFile = path.join(os.tmpdir(), 'swalef_data.json');
}

console.log(`💾 Using Pure-JS database storage: ${storageFile}`);

// In-memory tables
const data = {
  users: [],
  rooms: [],
  room_players: [],
  game_sessions: [],
  votes: [],
  chat_messages: []
};

// Load saved data if exists
try {
  if (fs.existsSync(storageFile)) {
    const raw = fs.readFileSync(storageFile, 'utf8');
    const parsed = JSON.parse(raw);
    Object.assign(data, parsed);
    console.log(`✅ Loaded ${data.users.length} users, ${data.rooms.length} rooms from storage`);
  }
} catch (err) {
  console.warn('⚠️ Could not load previous data, starting fresh:', err.message);
}

function saveData() {
  try {
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
  } catch (err) {
    // ignore background save errors in ephemeral environments
  }
}

// SQL query runner for pure-JS
class PureStatement {
  constructor(sql) {
    this.sql = sql.trim().replace(/\s+/g, ' ');
  }

  get(...params) {
    const res = this.all(...params);
    return res.length > 0 ? res[0] : undefined;
  }

  all(...params) {
    const sql = this.sql;

    // Users
    if (/SELECT id FROM users WHERE email = \?/i.test(sql)) {
      const u = data.users.find(x => x.email === params[0]);
      return u ? [{ id: u.id }] : [];
    }
    if (/SELECT id FROM users WHERE username = \? AND id != \?/i.test(sql)) {
      const u = data.users.find(x => x.username === params[0] && x.id !== params[1]);
      return u ? [{ id: u.id }] : [];
    }
    if (/SELECT id FROM users WHERE username = \?/i.test(sql)) {
      const u = data.users.find(x => x.username === params[0]);
      return u ? [{ id: u.id }] : [];
    }
    if (/SELECT \* FROM users WHERE email = \?/i.test(sql)) {
      const u = data.users.find(x => x.email === params[0]);
      return u ? [{ ...u }] : [];
    }
    if (/SELECT id, email, username, avatar_color FROM users WHERE id = \?/i.test(sql)) {
      const u = data.users.find(x => x.id === params[0]);
      return u ? [{ id: u.id, email: u.email, username: u.username, avatar_color: u.avatar_color }] : [];
    }
    if (/SELECT username, avatar_color FROM users WHERE id = \?/i.test(sql)) {
      const u = data.users.find(x => x.id === params[0]);
      return u ? [{ username: u.username, avatar_color: u.avatar_color }] : [];
    }

    // Rooms
    if (/SELECT id FROM rooms WHERE code = \?/i.test(sql)) {
      const r = data.rooms.find(x => x.code === params[0]);
      return r ? [{ id: r.id }] : [];
    }
    if (/SELECT \* FROM rooms WHERE code = \?/i.test(sql)) {
      const r = data.rooms.find(x => x.code === params[0]);
      return r ? [{ ...r }] : [];
    }
    if (/SELECT \* FROM rooms WHERE id = \?/i.test(sql)) {
      const r = data.rooms.find(x => x.id === params[0]);
      return r ? [{ ...r }] : [];
    }
    if (/SELECT r\.\*.*FROM rooms r/i.test(sql) && /is_public = 1/i.test(sql)) {
      // Public waiting rooms
      const waitingRooms = data.rooms.filter(r => r.is_public == 1 && r.status === 'waiting');
      const results = waitingRooms.map(r => {
        const host = data.users.find(u => u.id === r.host_id) || {};
        const pCount = data.room_players.filter(rp => rp.room_id === r.id).length;
        return {
          ...r,
          host_name: host.username || 'مضيف',
          host_color: host.avatar_color || '#22c55e',
          player_count: pCount
        };
      });

      if (/HAVING COUNT/i.test(sql) && /ORDER BY RANDOM/i.test(sql)) {
        // Random available room
        const avail = results.filter(r => r.player_count < r.max_players);
        if (avail.length === 0) return [];
        return [avail[Math.floor(Math.random() * avail.length)]];
      }

      // Sort DESC limit 20
      results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return results.slice(0, 20);
    }

    // Room Players
    if (/FROM room_players rp.*JOIN users u/i.test(sql)) {
      const rId = params[0];
      const rps = data.room_players.filter(rp => rp.room_id === rId);
      return rps.map(rp => {
        const u = data.users.find(x => x.id === rp.user_id) || {};
        return {
          id: u.id,
          username: u.username,
          avatar_color: u.avatar_color,
          is_ready: rp.is_ready,
          joined_at: rp.joined_at
        };
      });
    }
    if (/SELECT COUNT\(\*\) as count FROM room_players WHERE room_id = \?/i.test(sql)) {
      const count = data.room_players.filter(rp => rp.room_id === params[0]).length;
      return [{ count }];
    }
    if (/SELECT \* FROM room_players WHERE room_id = \? AND user_id = \?/i.test(sql)) {
      const rp = data.room_players.find(x => x.room_id === params[0] && x.user_id === params[1]);
      return rp ? [{ ...rp }] : [];
    }
    if (/SELECT user_id FROM room_players WHERE room_id = \?/i.test(sql)) {
      return data.room_players.filter(rp => rp.room_id === params[0]).map(x => ({ user_id: x.user_id }));
    }

    // Game Sessions
    if (/SELECT \* FROM game_sessions WHERE room_id = \? AND ended_at IS NULL/i.test(sql)) {
      const s = data.game_sessions.find(x => x.room_id === params[0] && !x.ended_at);
      return s ? [{ ...s }] : [];
    }

    // Votes
    if (/SELECT voted_for_id, COUNT\(\*\) as count FROM votes WHERE session_id = \? GROUP BY voted_for_id/i.test(sql)) {
      const sVotes = data.votes.filter(v => v.session_id === params[0]);
      const map = {};
      for (const v of sVotes) {
        map[v.voted_for_id] = (map[v.voted_for_id] || 0) + 1;
      }
      const sorted = Object.entries(map).map(([voted_for_id, count]) => ({ voted_for_id, count }));
      sorted.sort((a, b) => b.count - a.count);
      return sorted;
    }
    if (/SELECT \* FROM votes WHERE session_id = \?/i.test(sql)) {
      return data.votes.filter(v => v.session_id === params[0]).map(x => ({ ...x }));
    }

    return [];
  }

  run(...params) {
    const sql = this.sql;

    // INSERT INTO users
    if (/INSERT INTO users/i.test(sql)) {
      const [id, email, password_hash, username, avatar_color] = params;
      data.users.push({
        id,
        email,
        password_hash,
        username,
        avatar_color: avatar_color || '#22c55e',
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString()
      });
      saveData();
      return { changes: 1 };
    }

    // UPDATE users last_login
    if (/UPDATE users SET last_login/i.test(sql)) {
      const u = data.users.find(x => x.id === params[0]);
      if (u) u.last_login = new Date().toISOString();
      saveData();
      return { changes: u ? 1 : 0 };
    }

    // UPDATE users username
    if (/UPDATE users SET username = \? WHERE id = \?/i.test(sql)) {
      const u = data.users.find(x => x.id === params[1]);
      if (u) u.username = params[0];
      saveData();
      return { changes: u ? 1 : 0 };
    }

    // INSERT INTO rooms
    if (/INSERT INTO rooms/i.test(sql)) {
      const [id, code, name, host_id, is_public, category, max_players] = params;
      data.rooms.push({
        id,
        code,
        name,
        host_id,
        is_public: is_public ?? 1,
        status: 'waiting',
        max_players: max_players || 10,
        min_players: 3,
        category: category || 'عام',
        created_at: new Date().toISOString(),
        started_at: null
      });
      saveData();
      return { changes: 1 };
    }

    // UPDATE rooms status, started_at
    if (/UPDATE rooms SET status = \?, started_at/i.test(sql)) {
      const r = data.rooms.find(x => x.id === params[1]);
      if (r) {
        r.status = params[0];
        r.started_at = new Date().toISOString();
      }
      saveData();
      return { changes: r ? 1 : 0 };
    }

    // UPDATE rooms status
    if (/UPDATE rooms SET status = \? WHERE id = \?/i.test(sql)) {
      const r = data.rooms.find(x => x.id === params[1]);
      if (r) r.status = params[0];
      saveData();
      return { changes: r ? 1 : 0 };
    }

    // UPDATE rooms host_id
    if (/UPDATE rooms SET host_id = \? WHERE id = \?/i.test(sql)) {
      const r = data.rooms.find(x => x.id === params[1]);
      if (r) r.host_id = params[0];
      saveData();
      return { changes: r ? 1 : 0 };
    }

    // DELETE FROM rooms
    if (/DELETE FROM rooms WHERE id = \?/i.test(sql)) {
      const idx = data.rooms.findIndex(x => x.id === params[0]);
      if (idx !== -1) data.rooms.splice(idx, 1);
      saveData();
      return { changes: 1 };
    }

    // INSERT INTO room_players
    if (/INSERT INTO room_players/i.test(sql)) {
      const [room_id, user_id] = params;
      const exists = data.room_players.some(x => x.room_id === room_id && x.user_id === user_id);
      if (!exists) {
        data.room_players.push({
          room_id,
          user_id,
          is_ready: 0,
          joined_at: new Date().toISOString()
        });
      }
      saveData();
      return { changes: 1 };
    }

    // DELETE FROM room_players
    if (/DELETE FROM room_players WHERE room_id = \? AND user_id = \?/i.test(sql)) {
      const idx = data.room_players.findIndex(x => x.room_id === params[0] && x.user_id === params[1]);
      if (idx !== -1) data.room_players.splice(idx, 1);
      saveData();
      return { changes: 1 };
    }
    if (/DELETE FROM room_players WHERE room_id = \?/i.test(sql)) {
      data.room_players = data.room_players.filter(x => x.room_id !== params[0]);
      saveData();
      return { changes: 1 };
    }

    // INSERT INTO game_sessions
    if (/INSERT INTO game_sessions/i.test(sql)) {
      const [id, room_id, word, impostor_ids, current_turn_user_id] = params;
      data.game_sessions.push({
        id,
        room_id,
        word,
        impostor_ids,
        current_turn_user_id,
        phase: 'discussion',
        round: 1,
        created_at: new Date().toISOString(),
        ended_at: null,
        winner: null
      });
      saveData();
      return { changes: 1 };
    }

    // UPDATE game_sessions current_turn_user_id
    if (/UPDATE game_sessions SET current_turn_user_id = \? WHERE id = \?/i.test(sql)) {
      const s = data.game_sessions.find(x => x.id === params[1]);
      if (s) s.current_turn_user_id = params[0];
      saveData();
      return { changes: s ? 1 : 0 };
    }

    // UPDATE game_sessions phase
    if (/UPDATE game_sessions SET phase = \? WHERE id = \?/i.test(sql)) {
      const s = data.game_sessions.find(x => x.id === params[1]);
      if (s) s.phase = params[0];
      saveData();
      return { changes: s ? 1 : 0 };
    }

    // UPDATE game_sessions ended_at, winner, phase
    if (/UPDATE game_sessions SET ended_at.*winner.*phase/i.test(sql)) {
      const s = data.game_sessions.find(x => x.id === params[2]);
      if (s) {
        s.winner = params[0];
        s.phase = params[1];
        s.ended_at = new Date().toISOString();
      }
      saveData();
      return { changes: s ? 1 : 0 };
    }

    // DELETE FROM game_sessions
    if (/DELETE FROM game_sessions WHERE room_id = \?/i.test(sql)) {
      data.game_sessions = data.game_sessions.filter(x => x.room_id !== params[0]);
      saveData();
      return { changes: 1 };
    }

    // INSERT OR REPLACE INTO votes
    if (/INSERT OR REPLACE INTO votes/i.test(sql)) {
      const [session_id, voter_id, voted_for_id] = params;
      const existing = data.votes.find(x => x.session_id === session_id && x.voter_id === voter_id);
      if (existing) {
        existing.voted_for_id = voted_for_id;
      } else {
        data.votes.push({
          session_id,
          voter_id,
          voted_for_id,
          created_at: new Date().toISOString()
        });
      }
      saveData();
      return { changes: 1 };
    }

    // DELETE FROM votes
    if (/DELETE FROM votes WHERE session_id = \?/i.test(sql)) {
      data.votes = data.votes.filter(x => x.session_id !== params[0]);
      saveData();
      return { changes: 1 };
    }
    if (/DELETE FROM votes WHERE session_id IN/i.test(sql)) {
      const roomId = params[0];
      const sessionIds = data.game_sessions.filter(s => s.room_id === roomId).map(s => s.id);
      data.votes = data.votes.filter(v => !sessionIds.includes(v.session_id));
      saveData();
      return { changes: 1 };
    }

    // INSERT INTO chat_messages
    if (/INSERT INTO chat_messages/i.test(sql)) {
      const [id, room_id, user_id, message, type] = params;
      data.chat_messages.push({
        id,
        room_id,
        user_id,
        message,
        type: type || 'text',
        created_at: new Date().toISOString()
      });
      return { changes: 1 };
    }

    // DELETE FROM chat_messages
    if (/DELETE FROM chat_messages WHERE room_id = \?/i.test(sql)) {
      data.chat_messages = data.chat_messages.filter(x => x.room_id !== params[0]);
      return { changes: 1 };
    }

    return { changes: 0 };
  }
}

class PureDatabase {
  prepare(sql) {
    return new PureStatement(sql);
  }

  exec(sql) {
    // schema definitions are handled in-memory
    return true;
  }

  pragma(cmd) {
    return true;
  }
}

module.exports = new PureDatabase();
