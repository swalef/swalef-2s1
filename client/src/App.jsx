import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useSocket } from './contexts/SocketContext';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import WaitingRoom from './pages/WaitingRoom';
import GameRoom from './pages/GameRoom';

export default function App() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState('home'); // home | waiting | game
  const [currentRoom, setCurrentRoom] = useState(null);
  const [gameData, setGameData] = useState(null);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
      }}>
        <div style={{
          width: '80px', height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '40px',
          animation: 'pulse-glow 2s infinite',
        }}>
          🎭
        </div>
        <div className="spinner spinner-lg" />
        <p style={{ color: 'var(--text-dim)', fontSize: '16px' }}>جاري التحميل...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleJoinRoom = (room) => {
    setCurrentRoom(room);
    setScreen('waiting');
  };

  const handleGameStart = (data, room) => {
    setGameData(data);
    setCurrentRoom(room);
    setScreen('game');
  };

  const handleLeave = () => {
    setCurrentRoom(null);
    setGameData(null);
    setScreen('home');
  };

  if (screen === 'waiting' && currentRoom) {
    return (
      <WaitingRoom
        room={currentRoom}
        onGameStart={handleGameStart}
        onLeave={handleLeave}
      />
    );
  }

  if (screen === 'game' && gameData && currentRoom) {
    return (
      <GameRoom
        gameData={gameData}
        room={currentRoom}
        onGameEnd={handleLeave}
        onLeave={handleLeave}
      />
    );
  }

  return <HomePage onJoinRoom={handleJoinRoom} />;
}
