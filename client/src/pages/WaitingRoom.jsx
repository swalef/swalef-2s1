import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import {
  IconCrown,
  IconCopy,
  IconLogout,
  IconSend,
  IconPlay,
  IconCheck
} from '../components/Icons';

const QUICK_CHATS = [
  'أنا بريء تماماً',
  'هو المتسلل بالتأكيد',
  'كلامه مشبوه جداً',
  'ما أعرف وش أقول',
  'ثقوا فيني',
  'نصوت عليه',
  'جاهزون للبدء',
  'أنا نفس الكلمة معكم',
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
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const chatEndRef = useRef(null);

  const isHost = room?.host_id === user?.id;
  const players = room?.players || [];
  const minRequired = Math.min(room?.min_players || 3, 2);
  const canStart = players.length >= minRequired;

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
      addSystemMessage(`${username} انضم إلى الغرفة`);
    };

    const onPlayerLeft = ({ username }) => {
      addSystemMessage(`${username} غادر الغرفة`);
    };

    const onHostChanged = ({ newHostId }) => {
      if (newHostId === user?.id) {
        toast('أصبحت الآن مضيف الغرفة', 'success');
      }
      addSystemMessage('تم نقل صلاحية المضيف إلى لاعب آخر');
    };

    const onWaitingTimerStart = ({ seconds }) => {
      setCountdown(seconds);
      addSystemMessage(`ستبدأ اللعبة تلقائياً خلال ${Math.floor(seconds / 60)} دقائق`);
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
    if (countdown === null || countdown <= 0) return;

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
      id: Date.now() + Math.random(),
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

  const copyCode = () => {
    if (!room?.code) return;
    navigator.clipboard?.writeText(room.code);
    setCopiedCode(true);
    toast('تم نسخ كود الغرفة', 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyInviteLink = () => {
    if (!room?.code) return;
    const url = `${window.location.origin}?code=${room.code}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    toast('تم نسخ رابط الدعوة، أرسله لأصدقائك', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Header */}
      <header style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '800' }}>{room?.name}</h2>
              <span className="badge">
                {players.length} / {room?.max_players} لاعبين
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
              فئة: {room?.category} • {room?.is_public ? 'عامة' : 'خاصة'}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Copy Code */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={copyCode}
            title="نسخ كود الغرفة"
          >
            {copiedCode ? <IconCheck size={14} /> : <IconCopy size={14} />}
            <span>كود: {room?.code}</span>
          </button>

          {/* Copy Invite Link */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={copyInviteLink}
            title="نسخ رابط الدعوة المباشر"
          >
            {copiedLink ? <IconCheck size={14} /> : <IconCopy size={14} />}
            <span>رابط الدعوة</span>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={handleLeave}
            title="مغادرة الغرفة"
          >
            <IconLogout size={16} />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* Body Grid */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 340px',
        overflow: 'hidden'
      }}>
        {/* Left: Players list & Start status */}
        <div style={{ padding: '24px', overflowY: 'auto' }}>
          {/* Game status & Host Action */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '4px' }}>
                  {countdown !== null
                    ? `ستبدأ الجولة خلال: ${formatCountdown(countdown)}`
                    : canStart
                    ? 'العدد كافٍ للبدء'
                    : `في انتظار لاعبين (متبقي ${minRequired - players.length} على الأقل)`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  {isHost
                    ? 'أنت مضيف الغرفة، يمكنك بدء اللعبة فور اكتمال اللاعبين'
                    : 'في انتظار قيام المضيف ببدء اللعبة'}
                </div>
              </div>

              {isHost && (
                <button
                  className="btn btn-primary"
                  onClick={handleStartGame}
                  disabled={!canStart}
                  style={{ minWidth: '130px' }}
                >
                  <IconPlay size={14} />
                  <span>بدء اللعبة</span>
                </button>
              )}
            </div>
          </div>

          {/* Players Grid */}
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>
              قائمة اللاعبين ({players.length}/{room?.max_players})
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              الحد الأدنى المطلوب: {minRequired}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '10px',
          }}>
            {players.map(p => (
              <div
                key={p.id}
                className="card"
                style={{
                  padding: '16px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${p.id === user?.id ? 'var(--border-active)' : 'var(--border)'}`,
                  background: p.id === user?.id ? 'var(--bg-subtle)' : 'var(--bg-card)',
                  position: 'relative'
                }}
              >
                {room?.host_id === p.id && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    color: 'var(--text-secondary)'
                  }} title="مضيف الغرفة">
                    <IconCrown size={14} />
                  </div>
                )}
                <div className="avatar">
                  {p.username[0]?.toUpperCase()}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: '700', fontSize: '13px' }}>
                    {p.username}
                  </div>
                  {p.id === user?.id && (
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>أنت</div>
                  )}
                </div>
              </div>
            ))}

            {/* Empty slots representation */}
            {[...Array(Math.max(0, (room?.max_players || 8) - players.length))].map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  padding: '16px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-dim)',
                  minHeight: '100px'
                }}
              >
                <span style={{ fontSize: '18px' }}>+</span>
                <span style={{ fontSize: '11px' }}>مكان متاح</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Clean Minimalist Chat */}
        <div className="chat-box" style={{ borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}>
          <div className="chat-header">
            <span>دردشة الغرفة</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{chatMessages.length} رسالة</span>
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px', marginTop: '40px' }}>
                لا توجد رسائل بعد
              </div>
            )}
            {chatMessages.map(msg => (
              <div key={msg.id}>
                {msg.type === 'system' ? (
                  <div className="chat-msg chat-msg-system">
                    {msg.message}
                  </div>
                ) : (
                  <div className={`chat-msg ${msg.userId === user?.id ? 'chat-msg-mine' : 'chat-msg-other'}`}>
                    {msg.userId !== user?.id && (
                      <div className="chat-sender">{msg.username}</div>
                    )}
                    <div>{msg.message}</div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Chat suggestions */}
          {showQuickChat && (
            <div style={{
              padding: '10px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px'
            }}>
              {QUICK_CHATS.map(qc => (
                <button
                  key={qc}
                  type="button"
                  onClick={() => handleSendChat(qc, 'quick')}
                  style={{
                    padding: '6px 8px',
                    fontSize: '11px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'right',
                    fontFamily: 'Cairo, sans-serif'
                  }}
                >
                  {qc}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="chat-input-row">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setShowQuickChat(!showQuickChat)}
              title="عبارات سريعة"
              style={{ padding: '6px 10px', fontSize: '11px' }}
            >
              سريع
            </button>
            <input
              className="input"
              style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
              placeholder="اكتب رسالة..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
            />
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => handleSendChat()}
              disabled={!chatInput.trim()}
              style={{ padding: '8px 12px' }}
            >
              <IconSend size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
