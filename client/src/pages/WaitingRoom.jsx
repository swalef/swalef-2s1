import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';

const QUICK_CHATS = [
  'أنا بريء! 😇',
  'هو المتسلل! 🫵',
  'متأكد 100%! 💯',
  'ما أعرف وش أقول 😅',
  'كلامه مشبوه! 🤔',
  'ثقوا فيني! 🤝',
  'نصوت عليه! ✋',
  'خلونا نكمل 🎮',
];

export default function WaitingRoom({ room: initialRoom, onGameStart, onLeave }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const [room, setRoom] = useState(initialRoom);
  const [countdown, setCountdown] = useState(null); // seconds
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showQuickChat, setShowQuickChat] = useState(false);
  const chatEndRef = useRef(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const isHost = room?.host_id === user?.id;
  const players = room?.players || [];
  const canStart = players.length >= (room?.min_players || 4);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onRoomUpdated = (updatedRoom) => {
      setRoom(updatedRoom);
    };

    const onPlayerJoined = ({ username }) => {
      addSystemMessage(`${username} انضم للغرفة 🎮`);
    };

    const onPlayerLeft = ({ username }) => {
      addSystemMessage(`${username} غادر الغرفة 👋`);
    };

    const onHostChanged = ({ newHostId }) => {
      if (newHostId === user.id) {
        toast('أصبحت مضيف الغرفة! 👑', 'success');
      }
      addSystemMessage('تغيّر مضيف الغرفة 👑');
    };

    const onWaitingTimerStart = ({ seconds }) => {
      setCountdown(seconds);
      addSystemMessage(`ستبدأ اللعبة خلال ${Math.floor(seconds / 60)} دقائق ⏰`);
    };

    const onGameStarted = (data) => {
      onGameStart(data, room);
    };

    const onChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
    };

    socket.on('room_updated', onRoomUpdated);
    socket.on('player_joined', onPlayerJoined);
    socket.on('player_left', onPlayerLeft);
    socket.on('host_changed', onHostChanged);
    socket.on('waiting_timer_start', onWaitingTimerStart);
    socket.on('game_started', onGameStarted);
    socket.on('chat_message', onChatMessage);

    return () => {
      socket.off('room_updated', onRoomUpdated);
      socket.off('player_joined', onPlayerJoined);
      socket.off('player_left', onPlayerLeft);
      socket.off('host_changed', onHostChanged);
      socket.off('waiting_timer_start', onWaitingTimerStart);
      socket.off('game_started', onGameStarted);
      socket.off('chat_message', onChatMessage);
    };
  }, [socket, user, room, onGameStart, toast]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) return;

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

  const addSystemMessage = (text) => {
    setChatMessages(prev => [...prev, {
      id: Date.now(),
      type: 'system',
      message: text,
      timestamp: new Date().toISOString(),
    }]);
  };

  const handleSendChat = (msg, type = 'text') => {
    const message = msg || chatInput.trim();
    if (!message || !socket) return;
    socket.emit('send_chat', { message, type });
    if (type === 'text') setChatInput('');
    setShowQuickChat(false);
  };

  const handleStartGame = () => {
    if (!socket) return;
    socket.emit('start_game', (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleLeave = () => {
    if (!socket) return;
    socket.emit('leave_room', () => {
      onLeave();
    });
  };

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const timerPercent = countdown !== null ? (countdown / 300) * 100 : 100;
  const circumference = 2 * Math.PI * 44;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(7, 26, 14, 0.8)',
        backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>⏳</span>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800' }}>{room?.name}</h2>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              غرفة الانتظار • {players.length}/{room?.max_players} لاعبين
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Room code */}
          <div
            onClick={() => {
              navigator.clipboard?.writeText(room?.code);
              toast('تم نسخ الكود! 📋', 'success');
            }}
            style={{
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '10px',
              padding: '8px 14px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>الكود</span>
            <span style={{ fontWeight: '800', letterSpacing: '3px', fontSize: '16px', color: 'var(--primary-lighter)' }}>
              {room?.code}
            </span>
            <span style={{ fontSize: '14px' }}>📋</span>
          </div>

          <button className="btn btn-danger btn-sm" onClick={handleLeave}>
            🚪 خروج
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', gap: '0', overflow: 'hidden' }}>
        {/* Left: Players + Controls */}
        <div style={{ padding: '24px', overflowY: 'auto' }}>
          {/* Timer / Status */}
          {countdown !== null ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              marginBottom: '32px', padding: '28px',
              background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(22,163,74,0.05))',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 'var(--radius-xl)',
              animation: 'fadeIn 0.5s ease',
            }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                ⏰ تبدأ اللعبة خلال
              </p>
              {/* SVG Ring Timer */}
              <div className="timer-ring" style={{ width: '120px', height: '120px' }}>
                <svg width="120" height="120" viewBox="0 0 100 100">
                  <circle className="bg" cx="50" cy="50" r="44" stroke="rgba(34,197,94,0.15)" strokeWidth="6" fill="none" />
                  <circle
                    className="progress"
                    cx="50" cy="50" r="44"
                    stroke={countdown < 60 ? '#ef4444' : 'var(--primary-light)'}
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (timerPercent / 100) * circumference}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <div className="timer-value" style={{ fontSize: '26px', color: countdown < 60 ? '#ef4444' : 'var(--text-primary)' }}>
                  {formatCountdown(countdown)}
                </div>
              </div>
              {isHost && (
                <button
                  className="btn btn-primary btn-lg"
                  style={{ marginTop: '20px' }}
                  onClick={handleStartGame}
                  disabled={!canStart}
                >
                  🚀 ابدأ الآن
                </button>
              )}
            </div>
          ) : (
            <div style={{
              textAlign: 'center', marginBottom: '28px',
              padding: '24px',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xl)',
            }}>
              {canStart ? (
                <>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px' }}>
                    اللعبة جاهزة للبدء!
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                    {isHost ? 'اضغط ابدأ عندما تكون مستعداً' : 'في انتظار المضيف ليبدأ...'}
                  </p>
                  {isHost && (
                    <button
                      className="btn btn-primary btn-lg"
                      style={{ marginTop: '16px' }}
                      onClick={handleStartGame}
                    >
                      🚀 ابدأ اللعبة
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>⏳</div>
                  <p style={{ color: 'var(--text-dim)', fontWeight: '600' }}>
                    في انتظار المزيد من اللاعبين...
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
                    يحتاج {(room?.min_players || 4) - players.length} لاعب إضافي للبدء
                  </p>
                </>
              )}
            </div>
          )}

          {/* Players Grid */}
          <h3 style={{ fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👥</span> اللاعبون ({players.length}/{room?.max_players})
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '12px',
          }}>
            {players.map(p => (
              <div key={p.id} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '10px', padding: '20px 16px',
                background: p.id === user.id ? 'rgba(34,197,94,0.1)' : 'var(--bg-glass)',
                border: `1px solid ${p.id === user.id ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                animation: 'fadeInScale 0.3s ease',
                position: 'relative',
              }}>
                {/* Host crown */}
                {room?.host_id === p.id && (
                  <div style={{
                    position: 'absolute', top: '-10px', right: '50%', transform: 'translateX(50%)',
                    fontSize: '20px',
                  }}>👑</div>
                )}
                <div
                  className="avatar avatar-lg"
                  style={{ background: p.avatar_color || '#22c55e' }}
                >
                  {p.username[0]?.toUpperCase()}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>
                    {p.username}
                    {p.id === user.id && (
                      <span style={{ fontSize: '11px', color: 'var(--primary-lighter)', marginRight: '4px' }}>(أنت)</span>
                    )}
                  </div>
                  {room?.host_id === p.id && (
                    <span className="badge badge-green" style={{ marginTop: '4px', fontSize: '11px' }}>مضيف</span>
                  )}
                </div>
              </div>
            ))}
            {/* Empty slots */}
            {[...Array(Math.max(0, (room?.max_players || 8) - players.length))].map((_, i) => (
              <div key={`empty-${i}`} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '10px', padding: '20px 16px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.1)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <div style={{
                  width: '60px', height: '60px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px', color: 'var(--text-dim)',
                }}>+</div>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>في الانتظار...</div>
              </div>
            ))}
          </div>

          {/* Room info */}
          <div style={{
            marginTop: '24px', padding: '16px 20px',
            background: 'var(--bg-glass)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex', gap: '24px', flexWrap: 'wrap',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>الفئة</div>
              <div style={{ fontWeight: '700', color: 'var(--primary-lighter)' }}>🎯 {room?.category}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>النوع</div>
              <div style={{ fontWeight: '700' }}>{room?.is_public ? '🌍 عامة' : '🔒 خاصة'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>الحد الأدنى</div>
              <div style={{ fontWeight: '700' }}>👥 {room?.min_players} لاعبين</div>
            </div>
          </div>
        </div>

        {/* Right: Chat */}
        <div style={{
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(3, 15, 7, 0.6)',
        }}>
          {/* Chat header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            fontWeight: '700', fontSize: '15px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span>💬</span> دردشة الغرفة
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px', marginTop: '30px' }}>
                لا رسائل بعد... ابدأ المحادثة! 💬
              </div>
            )}
            {chatMessages.map(msg => (
              <div key={msg.id} style={{
                animation: 'slideInRight 0.2s ease',
              }}>
                {msg.type === 'system' ? (
                  <div style={{
                    textAlign: 'center', fontSize: '12px', color: 'var(--text-dim)',
                    padding: '4px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '20px',
                    margin: '4px auto',
                    maxWidth: '80%',
                  }}>
                    {msg.message}
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: msg.userId === user.id ? 'row-reverse' : 'row',
                    gap: '8px', alignItems: 'flex-end',
                  }}>
                    <div
                      className="avatar avatar-sm"
                      style={{ background: msg.avatarColor || '#22c55e', flexShrink: 0 }}
                    >
                      {msg.username?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ maxWidth: '75%' }}>
                      {msg.userId !== user.id && (
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '3px', paddingRight: '4px' }}>
                          {msg.username}
                        </div>
                      )}
                      <div style={{
                        padding: '9px 14px',
                        borderRadius: msg.userId === user.id ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        background: msg.userId === user.id
                          ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                          : 'rgba(255,255,255,0.07)',
                        border: msg.userId !== user.id ? '1px solid var(--border)' : 'none',
                        fontSize: '14px',
                        color: 'white',
                        wordBreak: 'break-word',
                      }}>
                        {msg.message}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick chat popup */}
          {showQuickChat && (
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border)',
              animation: 'fadeIn 0.2s ease',
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px', fontWeight: '600' }}>
                ⚡ كويك شات
              </div>
              <div className="quick-chat-grid">
                {QUICK_CHATS.map(qc => (
                  <button
                    key={qc}
                    className="quick-chat-btn"
                    onClick={() => handleSendChat(qc, 'quick')}
                  >
                    {qc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat input */}
          <div style={{
            padding: '12px 16px',
            borderTop: showQuickChat ? 'none' : '1px solid var(--border)',
            display: 'flex', gap: '8px',
          }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowQuickChat(!showQuickChat)}
              title="كويك شات"
              style={{ minWidth: '40px', padding: '8px' }}
            >
              ⚡
            </button>
            <input
              className="input"
              style={{ flex: 1, padding: '9px 14px', fontSize: '14px' }}
              placeholder="اكتب رسالة..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleSendChat()}
              disabled={!chatInput.trim()}
              style={{ minWidth: '40px', padding: '8px' }}
            >
              ✈️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
