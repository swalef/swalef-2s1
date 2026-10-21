import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
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
        gap: '16px',
        background: 'var(--bg-base)'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px' }}>سوالف</h1>
        <div className="spinner" />
        <p style={{ color: 'var(--text-dim)', fontSize: '13px' }}>جاري التحميل...</p>
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

  const handleRoomReset = (updatedRoom) => {
    setCurrentRoom(updatedRoom);
    setGameData(null);
    setScreen('waiting');
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
        onRoomReset={handleRoomReset}
        onLeave={handleLeave}
      />
    );
  }

  return <HomePage onJoinRoom={handleJoinRoom} />;
}
