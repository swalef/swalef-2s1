import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import AgoraRTC from 'agora-rtc-sdk-ng';
import {
  IconMic,
  IconMicOff,
  IconLogout,
  IconSend,
  IconVote,
  IconCrown,
  IconCheck,
  IconPlay
} from '../components/Icons';

// Agora App ID (leave empty or set via VITE_AGORA_APP_ID)
const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';

const QUICK_CHATS = [
  'أنا بريء تماماً',
  'هو المتسلل بالتأكيد',
  'كلامه مشبوه جداً',
  'ما أعرف وش أقول',
  'ثقوا فيني',
  'نصوت عليه الآن',
  'كلامك غير مقنع',
  'أنا نفس الكلمة معكم',
];

export default function GameRoom({ gameData, room, onGameEnd, onRoomReset, onLeave }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();

  // Game state
  const [phase, setPhase] = useState('discussion'); // discussion | voting | ended
  const [currentTurn, setCurrentTurn] = useState(gameData.currentTurn);
  const [askedBy, setAskedBy] = useState(null);
  const [players, setPlayers] = useState(room.players || []);
  const [votes, setVotes] = useState({});
  const [myVote, setMyVote] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [selectingTarget, setSelectingTarget] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showQuickChat, setShowQuickChat] = useState(false);
  const chatEndRef = useRef(null);

  // Voice state
  const [isMuted, setIsMuted] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState({});

  // Agora refs
  const agoraClient = useRef(null);
  const localAudioTrack = useRef(null);
  const volumeInterval = useRef(null);

  const isMyTurn = currentTurn === user.id;
  const isHost = room.host_id === user.id;
  const isImpostor = gameData.role === 'impostor';

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    const onRoomUpdated = (r) => setPlayers(r.players || []);

    const onTurnChanged = ({ currentTurn: ct, askedBy: ab }) => {
      setCurrentTurn(ct);
      setAskedBy(ab);
      setSelectingTarget(false);
      const ctPlayer = players.find(p => p.id === ct);
      if (ct !== user.id) {
        addSystemMessage(`دور ${ctPlayer?.username || 'لاعب'} للإجابة`);
      }
    };

    const onAnswerDone = ({ answererId }) => {
      const p = players.find(x => x.id === answererId);
      addSystemMessage(`${p?.username || 'لاعب'} أنهى إجابته`);
      setAskedBy(null);
    };

    const onVotingStarted = () => {
      setPhase('voting');
      addSystemMessage('بدأت مرحلة التصويت: اختر اللاعب الذي تعتقد أنه المتسلل');
      toast('بدأت مرحلة التصويت', 'info');
    };

    const onVoteUpdate = ({ votes: v }) => {
      const map = {};
      v.forEach(vote => { map[vote.voterId] = vote.targetId; });
      setVotes(map);
    };

    const onGameEnded = (result) => {
      setPhase('ended');
      setGameResult(result);
    };

    const onGameCancelled = ({ message }) => {
      toast(message || 'تم إيقاف اللعبة', 'error');
      setTimeout(() => onLeave(), 2500);
    };

    const onChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
    };

    const handleRoomResetEvent = (updatedRoom) => {
      toast('تمت إعادة ضبط الغرفة لجولة جديدة', 'info');
      if (onRoomReset) onRoomReset(updatedRoom);
      else onLeave();
    };

    socket.on('room_updated', onRoomUpdated);
    socket.on('turn_changed', onTurnChanged);
    socket.on('answer_done', onAnswerDone);
    socket.on('voting_started', onVotingStarted);
    socket.on('vote_update', onVoteUpdate);
    socket.on('game_ended', onGameEnded);
    socket.on('game_cancelled', onGameCancelled);
    socket.on('chat_message', onChatMessage);
    socket.on('room_reset', handleRoomResetEvent);

    return () => {
      socket.off('room_updated', onRoomUpdated);
      socket.off('turn_changed', onTurnChanged);
      socket.off('answer_done', onAnswerDone);
      socket.off('voting_started', onVotingStarted);
      socket.off('vote_update', onVoteUpdate);
      socket.off('game_ended', onGameEnded);
      socket.off('game_cancelled', onGameCancelled);
      socket.off('chat_message', onChatMessage);
      socket.off('room_reset', handleRoomResetEvent);
    };
  }, [socket, user, players, onLeave, onRoomReset, toast]);

  // Agora Voice Initialization
  useEffect(() => {
    if (!AGORA_APP_ID || AGORA_APP_ID === 'YOUR_AGORA_APP_ID') {
      setVoiceError('no_app_id');
      return;
    }

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    agoraClient.current = client;

    client.on('user-published', async (remoteUser, mediaType) => {
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === 'audio') {
        remoteUser.audioTrack?.play();
        setRemoteUsers(prev => ({ ...prev, [remoteUser.uid]: remoteUser }));
      }
    });

    client.on('user-unpublished', (remoteUser) => {
      setRemoteUsers(prev => {
        const next = { ...prev };
        delete next[remoteUser.uid];
        return next;
      });
    });

    client.on('user-left', (remoteUser) => {
      setRemoteUsers(prev => {
        const next = { ...prev };
        delete next[remoteUser.uid];
        return next;
      });
    });

    const joinVoice = async () => {
      try {
        const channelName = `swalef_${room.id.replace(/-/g, '')}`;
        await client.join(AGORA_APP_ID, channelName, null, null);
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrack.current = audioTrack;
        await client.publish(audioTrack);
        setAgoraJoined(true);

        volumeInterval.current = setInterval(() => {
          const level = audioTrack.getVolumeLevel?.() || 0;
          setSpeakingUsers(prev => {
            const next = new Set(prev);
            if (level > 0.05) next.add(user.id);
            else next.delete(user.id);
            return next;
          });
        }, 300);
      } catch (err) {
        console.error('Agora error:', err);
        setVoiceError(err.message || 'error');
      }
    };

    joinVoice();

    return () => {
      if (volumeInterval.current) clearInterval(volumeInterval.current);
      localAudioTrack.current?.close();
      client.leave().catch(() => {});
    };
  }, [room.id, user.id]);

  const addSystemMessage = (text) => {
    setChatMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      type: 'system',
      message: text,
      timestamp: new Date().toISOString(),
    }]);
  };

  const toggleMute = () => {
    if (localAudioTrack.current) {
      localAudioTrack.current.setEnabled(isMuted);
      setIsMuted(!isMuted);
      toast(isMuted ? 'الميكروفون مفعّل' : 'تم كتم الميكروفون', 'info');
    }
  };

  const handleSelectTarget = (targetId) => {
    if (!isMyTurn || !selectingTarget) return;
    socket.emit('select_target', { targetId }, (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleEndTurn = () => {
    socket.emit('end_my_turn', (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleRequestVote = () => {
    socket.emit('request_vote', (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleVote = (targetId) => {
    if (myVote) return;
    setMyVote(targetId);
    socket.emit('cast_vote', { targetId }, (res) => {
      if (res?.error) {
        toast(res.error, 'error');
        setMyVote(null);
      } else {
        toast('تم تسجيل تصويتك', 'success');
      }
    });
  };

  const handleResetGame = () => {
    socket.emit('reset_game', (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleSendChat = (msg, type = 'text') => {
    const message = msg || chatInput.trim();
    if (!message || !socket) return;
    socket.emit('send_chat', { message, type });
    if (type === 'text') setChatInput('');
    setShowQuickChat(false);
  };

  const handleLeave = () => {
    socket.emit('leave_room', () => onLeave());
  };

  const voteCount = {};
  Object.values(votes).forEach(vid => {
    voteCount[vid] = (voteCount[vid] || 0) + 1;
  });

  const currentPlayer = players.find(p => p.id === currentTurn);
  const askedByPlayer = players.find(p => p.id === askedBy);

  // ──────────────────────────────────────────────
  // GAME ENDED OVERLAY
  // ──────────────────────────────────────────────
  if (phase === 'ended' && gameResult) {
    const iWon = (gameResult.winner === 'citizens' && !isImpostor) ||
                  (gameResult.winner === 'impostors' && isImpostor);

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--bg-base)'
      }}>
        <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
          <div style={{ marginBottom: '24px' }}>
            <span className={`badge ${iWon ? 'badge-green' : 'badge-red'}`} style={{ padding: '6px 14px', fontSize: '13px' }}>
              {iWon ? 'فوز بالجولة' : 'خسارة الجولة'}
            </span>
            <h1 style={{ fontSize: '32px', fontWeight: '800', marginTop: '12px', letterSpacing: '-0.5px' }}>
              {gameResult.winner === 'citizens' ? 'فاز المواطنون' : 'فاز المتسللون'}
            </h1>
          </div>

          <div className="card" style={{ marginBottom: '20px', textAlign: 'right' }}>
            <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>الكلمة السرية</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {gameResult.word}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>المتسلل / المتسللون</div>
              {gameResult.impostors?.map((imp, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '6px',
                }}>
                  <div className="avatar avatar-sm">
                    {imp?.username?.[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '13px' }}>{imp?.username}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {gameResult.wasImpostor ? 'تم كشف المتسلل بالتصويت' : 'لم يتمكن المواطنون من كشف المتسلل'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            {isHost && (
              <button className="btn btn-primary" onClick={handleResetGame}>
                <IconPlay size={14} />
                <span>جولة جديدة</span>
              </button>
            )}
            <button className="btn btn-secondary" onClick={handleLeave}>
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // ACTIVE GAME PLAYING UI
  // ──────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-base)'
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        {/* Role Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            background: isImpostor ? 'var(--danger-subtle)' : 'var(--accent-subtle)',
            border: `1px solid ${isImpostor ? 'var(--danger-border)' : 'var(--accent-border)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div>
              <div style={{
                fontWeight: '700',
                fontSize: '13px',
                color: isImpostor ? 'var(--danger)' : 'var(--accent)'
              }}>
                {isImpostor ? 'أنت المتسلل' : 'أنت مواطن'}
              </div>
              {!isImpostor && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  الكلمة: <strong style={{ color: 'var(--text-primary)' }}>{gameData.word}</strong>
                </div>
              )}
              {isImpostor && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  حاول تخمين الكلمة دون أن تُكشف
                </div>
              )}
            </div>
          </div>

          {/* Phase Badge */}
          <span className={`badge ${phase === 'voting' ? 'badge-red' : ''}`}>
            {phase === 'voting' ? 'مرحلة التصويت' : 'مرحلة النقاش'}
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {AGORA_APP_ID && !voiceError && (
            <button
              className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
              onClick={toggleMute}
            >
              {isMuted ? <IconMicOff size={14} /> : <IconMic size={14} />}
              <span>{isMuted ? 'مكتوم' : 'تحدث'}</span>
            </button>
          )}

          {isHost && phase === 'discussion' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRequestVote}
              title="بدء مرحلة التصويت"
            >
              <IconVote size={14} />
              <span>بدء التصويت</span>
            </button>
          )}

          <button
            className="btn btn-ghost btn-sm"
            onClick={handleLeave}
            title="مغادرة اللعبة"
          >
            <IconLogout size={16} />
          </button>
        </div>
      </header>

      {/* Main Grid: Game on left, Chat on right */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', overflow: 'hidden' }}>
        {/* Left Panel */}
        <div style={{ overflowY: 'auto', padding: '20px' }}>
          {/* Discussion Turn Banner */}
          {phase === 'discussion' && (
            <div className="card" style={{
              marginBottom: '20px',
              padding: '16px 20px',
              border: `1px solid ${isMyTurn ? 'var(--border-active)' : 'var(--border)'}`,
              background: isMyTurn ? 'var(--bg-subtle)' : 'var(--bg-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '15px' }}>
                  {isMyTurn ? 'دورك الآن' : `دور: ${currentPlayer?.username || 'اللاعب'}`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {isMyTurn
                    ? (askedByPlayer ? `${askedByPlayer.username} اختارك للإجابة` : 'اضغط على اسأل شخصاً ثم اختر لاعباً من القائمة')
                    : (askedByPlayer ? `${askedByPlayer.username} يوجه له السؤال` : 'يختار من يسأل')}
                </div>
              </div>

              {isMyTurn && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setSelectingTarget(true)}
                    disabled={selectingTarget}
                  >
                    {selectingTarget ? 'اختر لاعباً من القائمة أدناه' : 'اسأل شخصاً'}
                  </button>
                  {askedByPlayer && (
                    <button className="btn btn-secondary btn-sm" onClick={handleEndTurn}>
                      إنهاء الإجابة
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Voting Instructions Banner */}
          {phase === 'voting' && (
            <div className="card" style={{ marginBottom: '20px', padding: '16px 20px', borderColor: 'var(--danger-border)' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--danger)' }}>
                مرحلة التصويت ({Object.keys(votes).length} / {players.length} أصوات مسجلة)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '3px' }}>
                {myVote
                  ? `صوّتت على: ${players.find(p => p.id === myVote)?.username}`
                  : 'اضغط على بطاقة اللاعب الذي تعتقد أنه المتسلل'}
              </div>
            </div>
          )}

          {/* Players Grid Heading */}
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>
              اللاعبون ({players.length})
            </h3>
            {selectingTarget && (
              <span className="badge badge-green">
                اضغط على لاعب لتوجيه السؤال له
              </span>
            )}
          </div>

          {/* Players Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '10px',
            marginBottom: '20px',
          }}>
            {players.map(p => {
              const isCurrentTurn = p.id === currentTurn;
              const isSpeaking = speakingUsers.has(p.id);
              const pVoteCount = voteCount[p.id] || 0;
              const hasVotedFor = votes[user.id] === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (phase === 'voting' && p.id !== user.id && !myVote) {
                      handleVote(p.id);
                    } else if (phase === 'discussion' && selectingTarget && p.id !== user.id) {
                      handleSelectTarget(p.id);
                    }
                  }}
                  className="card"
                  style={{
                    padding: '16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    border: `1px solid ${
                      hasVotedFor ? 'var(--danger)'
                      : isCurrentTurn ? 'var(--text-primary)'
                      : (selectingTarget && p.id !== user.id) ? 'var(--accent)'
                      : 'var(--border)'
                    }`,
                    background: hasVotedFor
                      ? 'var(--danger-subtle)'
                      : isCurrentTurn
                      ? 'var(--bg-subtle)'
                      : 'var(--bg-card)',
                    cursor: (
                      (phase === 'voting' && p.id !== user.id && !myVote) ||
                      (phase === 'discussion' && selectingTarget && p.id !== user.id)
                    ) ? 'pointer' : 'default',
                    position: 'relative'
                  }}
                >
                  {/* Host Crown */}
                  {room.host_id === p.id && (
                    <div style={{ position: 'absolute', top: '8px', left: '8px', color: 'var(--text-secondary)' }}>
                      <IconCrown size={14} />
                    </div>
                  )}

                  <div className="avatar">
                    {p.username[0]?.toUpperCase()}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: '700', fontSize: '13px' }}>
                      {p.username}
                      {p.id === user.id && (
                        <span style={{ color: 'var(--text-dim)', fontSize: '11px', marginRight: '4px' }}>(أنت)</span>
                      )}
                    </div>
                    {isCurrentTurn && phase === 'discussion' && (
                      <span className="badge" style={{ marginTop: '4px', fontSize: '10px' }}>دوره الآن</span>
                    )}
                  </div>

                  {/* Vote count badge */}
                  {phase === 'voting' && pVoteCount > 0 && (
                    <div className="badge badge-red" style={{ fontSize: '11px' }}>
                      {pVoteCount} صوت
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Clean Minimalist Chat */}
        <div className="chat-box" style={{ borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}>
          <div className="chat-header">
            <span>دردشة اللعبة</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{chatMessages.length} رسالة</span>
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px', marginTop: '40px' }}>
                ابدأ المحادثة والنقاش
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

          {/* Quick Chat */}
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

          {/* Input Row */}
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
