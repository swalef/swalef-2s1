const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

let dbPath = process.env.DB_PATH || path.join(__dirname, 'game.db');
try {
  const testFile = path.join(__dirname, '.test_write');
  fs.writeFileSync(testFile, 'ok');
  fs.unlinkSync(testFile);
} catch (e) {
  dbPath = path.join(os.tmpdir(), 'game.db');
  console.log(`⚠️ Database directory not writable, falling back to: ${dbPath}`);
}

let db;
try {
  db = new Database(dbPath);
  console.log(`📦 SQLite database ready at: ${dbPath}`);
} catch (err) {
  console.warn(`⚠️ Failed to open file ${dbPath}, falling back to in-memory SQLite:`, err.message);
  db = new Database(':memory:');
  console.log('📦 In-memory SQLite database ready');
}

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    avatar_color TEXT DEFAULT '#22c55e',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    host_id TEXT NOT NULL,
    is_public INTEGER DEFAULT 1,
    status TEXT DEFAULT 'waiting',
    max_players INTEGER DEFAULT 10,
    min_players INTEGER DEFAULT 4,
    category TEXT DEFAULT 'عام',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    FOREIGN KEY (host_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS room_players (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_ready INTEGER DEFAULT 0,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    word TEXT NOT NULL,
    impostor_ids TEXT NOT NULL,
    current_turn_user_id TEXT,
    phase TEXT DEFAULT 'discussion',
    round INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    winner TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    session_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    voted_for_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, voter_id),
    FOREIGN KEY (session_id) REFERENCES game_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
