import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import AgoraRTC from 'agora-rtc-sdk-ng';

// ──────────────────────────────────────────────
// Agora config – replace with your App ID
// ──────────────────────────────────────────────
const AGORA_APP_ID = 'YOUR_AGORA_APP_ID';  // ← put your Agora App ID here

const QUICK_CHATS = [
  'أنا بريء! 😇',
  'هو المتسلل! 🫵',
  'متأكد 100%! 💯',
  'ما أعرف وش أقول 😅',
  'كلامه مشبوه! 🤔',
  'ثقوا فيني! 🤝',
  'نصوت عليه! ✋',
  'خلونا نكمل 🎮',
  'كذبت علينا! 🤥',
  'أنا نفس الكلمة! ✅',
];

export default function GameRoom({ gameData, room, onGameEnd, onLeave }) {
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

  // ── Scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Socket events ──
  useEffect(() => {
    if (!socket) return;

    const onRoomUpdated = (r) => setPlayers(r.players || []);
    const onTurnChanged = ({ currentTurn: ct, askedBy: ab }) => {
      setCurrentTurn(ct);
      setAskedBy(ab);
      setSelectingTarget(false);
      const ctPlayer = players.find(p => p.id === ct);
      if (ct !== user.id) {
        addSystemMessage(`🎙️ دور ${ctPlayer?.username || 'لاعب'} للإجابة`);
      }
    };
    const onAnswerDone = ({ answererId }) => {
      const p = players.find(x => x.id === answererId);
      addSystemMessage(`✅ ${p?.username || 'لاعب'} انتهى من الإجابة`);
      setAskedBy(null);
    };
    const onVotingStarted = () => {
      setPhase('voting');
      addSystemMessage('🗳️ بدأ التصويت! صوّت على من تعتقد أنه المتسلل');
      toast('بدأ التصويت! 🗳️', 'info');
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
    const onChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
    };
    const onRoomReset = (r) => {
      toast('اللعبة انتهت! يمكنك العودة للبيت.', 'info');
    };

    socket.on('room_updated', onRoomUpdated);
    socket.on('turn_changed', onTurnChanged);
    socket.on('answer_done', onAnswerDone);
    socket.on('voting_started', onVotingStarted);
    socket.on('vote_update', onVoteUpdate);
    socket.on('game_ended', onGameEnded);
    socket.on('chat_message', onChatMessage);
    socket.on('room_reset', onRoomReset);

    return () => {
      socket.off('room_updated', onRoomUpdated);
      socket.off('turn_changed', onTurnChanged);
      socket.off('answer_done', onAnswerDone);
      socket.off('voting_started', onVotingStarted);
      socket.off('vote_update', onVoteUpdate);
      socket.off('game_ended', onGameEnded);
      socket.off('chat_message', onChatMessage);
      socket.off('room_reset', onRoomReset);
    };
  }, [socket, user, players, toast]);

  // ── Agora Voice ──
  useEffect(() => {
    if (AGORA_APP_ID === 'YOUR_AGORA_APP_ID') {
      setVoiceError('no_app_id');
      return;
    }

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    agoraClient.current = client;

    // Remote user events
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
        const uid = await client.join(AGORA_APP_ID, channelName, null, null);
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrack.current = audioTrack;
        await client.publish(audioTrack);
        setAgoraJoined(true);
        toast('🎙️ انضممت للصوت!', 'success');

        // Volume indicator
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
        console.error('Agora join error:', err);
        setVoiceError(err.message);
        toast('فشل الاتصال بالصوت: ' + err.message, 'error');
      }
    };

    joinVoice();

    return () => {
      clearInterval(volumeInterval.current);
      localAudioTrack.current?.close();
      client.leave().catch(() => {});
    };
  }, []);

  const addSystemMessage = (text) => {
    setChatMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      type: 'system', message: text,
      timestamp: new Date().toISOString(),
    }]);
  };

  const toggleMute = () => {
    if (localAudioTrack.current) {
      localAudioTrack.current.setEnabled(isMuted);
      setIsMuted(!isMuted);
      toast(isMuted ? '🎙️ الميكروفون شغّال' : '🔇 تم كتم الميكروفون', 'info');
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
      if (res?.error) { toast(res.error, 'error'); setMyVote(null); }
      else toast('تم تصويتك! ✅', 'success');
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

  // ── Get vote count per player ──
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
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          textAlign: 'center',
          animation: 'fadeInScale 0.5s ease',
          maxWidth: '500px',
          width: '100%',
        }}>
          {/* Result emoji */}
          <div style={{ fontSize: '100px', marginBottom: '16px', lineHeight: 1 }}>
            {iWon ? '🎉' : '😢'}
          </div>
          <h1 style={{
            fontSize: '44px', fontWeight: '900',
            background: iWon
              ? 'linear-gradient(135deg, #4ade80, #22c55e)'
              : 'linear-gradient(135deg, #f87171, #ef4444)',
            backgroundClip: 'text', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>
            {iWon ? 'فزت! 🏆' : 'خسرت! 😅'}
          </h1>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            {gameResult.winner === 'citizens' ? '🕵️ فاز المواطنون!' : '🎭 فاز المتسللون!'}
          </p>

          <div className="card" style={{ marginBottom: '20px', padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '6px' }}>الكلمة كانت:</div>
              <div style={{
                fontSize: '32px', fontWeight: '900',
                color: 'var(--primary-lighter)',
              }}>
                🎯 {gameResult.word}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '8px' }}>المتسلل/المتسللون:</div>
              {gameResult.impostors?.map((imp, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '6px',
                }}>
                  <div className="avatar avatar-sm" style={{ background: imp?.avatar_color || '#ef4444' }}>
                    {imp?.username?.[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontWeight: '700' }}>🎭 {imp?.username}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              {gameResult.wasImpostor
                ? '✅ تم الكشف عن المتسلل'
                : '❌ لم يتم الكشف عن المتسلل'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={handleLeave}>
              🏠 العودة للبيت
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // MAIN GAME UI
  // ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(7, 26, 14, 0.9)',
        backdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        {/* Role badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{
            padding: '8px 16px',
            borderRadius: 'var(--radius-full)',
            background: isImpostor ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
            border: `1px solid ${isImpostor ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '18px' }}>{isImpostor ? '🎭' : '🕵️'}</span>
            <div>
              <div style={{
                fontWeight: '800', fontSize: '14px',
                color: isImpostor ? 'var(--impostor-light)' : 'var(--primary-lighter)',
              }}>
                {isImpostor ? 'أنت المتسلل!' : 'مواطن شريف'}
              </div>
              {!isImpostor && (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  الكلمة: <span style={{ color: 'var(--primary-lighter)', fontWeight: '700' }}>
                    {gameData.word}
                  </span>
                </div>
              )}
              {isImpostor && (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  اكتشف الكلمة دون أن تُكشف!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phase indicator */}
        <div style={{
          padding: '8px 16px',
          borderRadius: 'var(--radius-full)',
          background: phase === 'voting' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.1)',
          border: `1px solid ${phase === 'voting' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.2)'}`,
          fontWeight: '700', fontSize: '14px',
          color: phase === 'voting' ? 'var(--impostor-light)' : 'var(--primary-lighter)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          {phase === 'voting' ? '🗳️ مرحلة التصويت' : '💬 مرحلة النقاش'}
        </div>

        {/* Voice + actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {voiceError ? (
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>🔇 لا صوت</span>
          ) : (
            <button
              className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
              onClick={toggleMute}
              style={{ minWidth: '90px' }}
            >
              {isMuted ? '🔇 ميوت' : '🎙️ صوت'}
            </button>
          )}
          {isHost && phase === 'discussion' && (
            <button className="btn btn-danger btn-sm" onClick={handleRequestVote}>
              🗳️ تصويت
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleLeave}>🚪</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', overflow: 'hidden' }}>
        {/* ── Left Panel ── */}
        <div style={{ overflowY: 'auto', padding: '20px' }}>
          {/* Current turn banner */}
          {phase === 'discussion' && (
            <div style={{
              marginBottom: '20px', padding: '18px 24px',
              background: isMyTurn
                ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.1))'
                : 'var(--bg-glass)',
              border: `1px solid ${isMyTurn ? 'rgba(34,197,94,0.5)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-xl)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              animation: 'fadeIn 0.3s ease',
              boxShadow: isMyTurn ? 'var(--shadow-glow)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {isMyTurn ? (
                  <>
                    <div style={{ fontSize: '32px', animation: 'float 2s infinite' }}>🎙️</div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '18px', color: 'var(--primary-lighter)' }}>
                        دورك الآن!
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                        {askedByPlayer
                          ? `${askedByPlayer.username} اختارك للإجابة`
                          : 'اختر شخصاً تسأله'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '28px' }}>⏳</div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '16px' }}>
                        دور{' '}
                        <span style={{ color: 'var(--primary-lighter)' }}>
                          {currentPlayer?.username || 'اللاعب'}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                        {askedByPlayer
                          ? `${askedByPlayer.username} يسأله`
                          : 'يختار من يسأل'}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {isMyTurn && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setSelectingTarget(true)}
                    disabled={selectingTarget}
                  >
                    {selectingTarget ? 'اختر لاعباً ↓' : '🫵 اسأل شخصاً'}
                  </button>
                  {askedByPlayer && (
                    <button className="btn btn-secondary btn-sm" onClick={handleEndTurn}>
                      ✅ انتهيت
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Players list */}
          <h3 style={{ fontWeight: '700', marginBottom: '14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            👥 اللاعبون
            {selectingTarget && (
              <span style={{
                fontSize: '13px', color: 'var(--primary-lighter)',
                background: 'rgba(34,197,94,0.1)',
                padding: '3px 10px', borderRadius: '20px',
                border: '1px solid rgba(34,197,94,0.3)',
                animation: 'blink 1s infinite',
              }}>
                اضغط على لاعب لتسأله
              </span>
            )}
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '10px', marginBottom: '20px',
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
                  style={{
                    padding: '16px', borderRadius: 'var(--radius-lg)',
                    border: `2px solid ${
                      hasVotedFor ? 'var(--impostor)'
                      : isCurrentTurn ? 'var(--primary-light)'
                      : (selectingTarget && p.id !== user.id) ? 'rgba(34,197,94,0.4)'
                      : 'var(--border)'
                    }`,
                    background: hasVotedFor
                      ? 'rgba(239,68,68,0.15)'
                      : isCurrentTurn
                      ? 'rgba(34,197,94,0.12)'
                      : p.id === user.id
                      ? 'rgba(34,197,94,0.06)'
                      : 'var(--bg-glass)',
                    cursor: (
                      (phase === 'voting' && p.id !== user.id && !myVote) ||
                      (phase === 'discussion' && selectingTarget && p.id !== user.id)
                    ) ? 'pointer' : 'default',
                    transition: 'var(--transition)',
                    position: 'relative',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                    boxShadow: isSpeaking
                      ? '0 0 20px rgba(34,197,94,0.5)'
                      : isCurrentTurn
                      ? 'var(--shadow-glow)'
                      : 'none',
                    transform: (selectingTarget && p.id !== user.id) ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  {/* Speaking indicator ring */}
                  {isSpeaking && (
                    <div style={{
                      position: 'absolute', inset: '-3px',
                      borderRadius: 'calc(var(--radius-lg) + 3px)',
                      border: '2px solid var(--primary-light)',
                      animation: 'pulse-glow 1s infinite',
                      pointerEvents: 'none',
                    }} />
                  )}

                  {/* Crown for host */}
                  {room.host_id === p.id && (
                    <div style={{ position: 'absolute', top: '-8px', right: '50%', transform: 'translateX(50%)', fontSize: '16px' }}>👑</div>
                  )}

                  <div
                    className="avatar avatar-lg"
                    style={{ background: p.avatar_color || '#22c55e' }}
                  >
                    {p.username[0]?.toUpperCase()}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: '700', fontSize: '13px' }}>
                      {p.username}
                      {p.id === user.id && (
                        <span style={{ color: 'var(--primary-lighter)', fontSize: '11px', marginRight: '4px' }}>(أنت)</span>
                      )}
                    </div>
                    {isCurrentTurn && (
                      <span className="badge badge-green" style={{ marginTop: '4px', fontSize: '11px' }}>🎙️ دوره</span>
                    )}
                  </div>

                  {/* Voice bars if speaking */}
                  {isSpeaking && (
                    <div className="voice-bars">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="voice-bar" style={{ height: `${8 + Math.random() * 14}px` }} />
                      ))}
                    </div>
                  )}

                  {/* Vote count */}
                  {phase === 'voting' && pVoteCount > 0 && (
                    <div style={{
                      background: 'rgba(239,68,68,0.2)',
                      border: '1px solid rgba(239,68,68,0.4)',
                      borderRadius: 'var(--radius-full)',
                      padding: '2px 10px',
                      fontSize: '12px', fontWeight: '700',
                      color: 'var(--impostor-light)',
                    }}>
                      {pVoteCount} صوت{pVoteCount > 1 ? '' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Voting status */}
          {phase === 'voting' && (
            <div style={{
              padding: '16px 20px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-lg)',
              animation: 'fadeIn 0.3s ease',
            }}>
              <h4 style={{ fontWeight: '700', marginBottom: '10px', color: 'var(--impostor-light)' }}>
                🗳️ حالة التصويت ({Object.keys(votes).length}/{players.length})
              </h4>
              {myVote ? (
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  ✅ صوّتت على:{' '}
                  <span style={{ fontWeight: '700', color: 'var(--impostor-light)' }}>
                    {players.find(p => p.id === myVote)?.username}
                  </span>
                </p>
              ) : (
                <p style={{ fontSize: '14px', color: 'var(--text-dim)', animation: 'blink 1.5s infinite' }}>
                  👆 اضغط على اللاعب الذي تعتقد أنه المتسلل!
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Chat ── */}
        <div style={{
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(3, 15, 7, 0.6)',
          overflow: 'hidden',
        }}>
          {/* Voice status bar */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            background: agoraJoined
              ? 'rgba(34,197,94,0.08)'
              : voiceError === 'no_app_id'
              ? 'rgba(239,68,68,0.08)'
              : 'var(--bg-glass)',
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '13px',
          }}>
            {voiceError === 'no_app_id' ? (
              <>
                <span>🔇</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  الصوت غير مفعّل - أضف Agora App ID
                </span>
              </>
            ) : agoraJoined ? (
              <>
                <span style={{ color: 'var(--primary-lighter)' }}>🎙️</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  الصوت متصل • {Object.keys(remoteUsers).length + 1} في الغرفة
                </span>
                <button
                  className="btn btn-sm"
                  onClick={toggleMute}
                  style={{
                    marginRight: 'auto',
                    background: isMuted ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                    border: `1px solid ${isMuted ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
                    color: isMuted ? 'var(--impostor-light)' : 'var(--primary-lighter)',
                    padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                  }}
                >
                  {isMuted ? '🔇' : '🎙️'}
                </button>
              </>
            ) : (
              <>
                <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                <span style={{ color: 'var(--text-dim)' }}>جاري الاتصال بالصوت...</span>
              </>
            )}
          </div>

          {/* Chat header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            fontWeight: '700', fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span>💬</span> الدردشة
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px', marginTop: '20px' }}>
                ابدأ النقاش! 💬
              </div>
            )}
            {chatMessages.map(msg => (
              <div key={msg.id} style={{ animation: 'slideInRight 0.2s ease' }}>
                {msg.type === 'system' ? (
                  <div style={{
                    textAlign: 'center', fontSize: '11px', color: 'var(--text-dim)',
                    padding: '3px 10px', background: 'rgba(255,255,255,0.03)',
                    borderRadius: '20px', margin: '2px auto', maxWidth: '90%',
                  }}>
                    {msg.message}
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: msg.userId === user.id ? 'row-reverse' : 'row',
                    gap: '6px', alignItems: 'flex-end',
                  }}>
                    <div
                      className="avatar avatar-sm"
                      style={{ background: msg.avatarColor || '#22c55e', flexShrink: 0 }}
                    >
                      {msg.username?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ maxWidth: '78%' }}>
                      {msg.userId !== user.id && (
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '2px', paddingRight: '4px' }}>
                          {msg.username}
                        </div>
                      )}
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: msg.userId === user.id ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: msg.type === 'quick'
                          ? (msg.userId === user.id ? 'rgba(34,197,94,0.6)' : 'rgba(34,197,94,0.15)')
                          : (msg.userId === user.id ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.07)'),
                        border: msg.userId !== user.id ? '1px solid var(--border)' : 'none',
                        fontSize: '13px', color: 'white',
                        wordBreak: 'break-word',
                      }}>
                        {msg.type === 'quick' && <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: '4px' }}>⚡</span>}
                        {msg.message}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick chat panel */}
          {showQuickChat && (
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border)',
              animation: 'fadeIn 0.2s ease',
              background: 'rgba(0,0,0,0.2)',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px', fontWeight: '600' }}>
                ⚡ كويك شات
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {QUICK_CHATS.map(qc => (
                  <button key={qc} className="quick-chat-btn" onClick={() => handleSendChat(qc, 'quick')}
                    style={{ fontSize: '12px', padding: '8px 10px' }}>
                    {qc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div style={{
            padding: '10px 14px',
            borderTop: showQuickChat ? 'none' : '1px solid var(--border)',
            display: 'flex', gap: '6px',
          }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowQuickChat(!showQuickChat)}
              style={{ minWidth: '36px', padding: '6px', fontSize: '16px' }}
              title="كويك شات"
            >⚡</button>
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
              onClick={() => handleSendChat()}
              disabled={!chatInput.trim()}
              style={{ minWidth: '36px', padding: '6px' }}
            >✈️</button>
          </div>
        </div>
      </div>
    </div>
  );
}
