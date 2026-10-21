import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import {
  IconMic,
  IconMicOff,
  IconLogout,
  IconSend,
  IconVote,
  IconCrown,
  IconCheck,
  IconPlay,
  IconUsers
} from '../components/Icons';

const QUICK_CHATS = [
  'أنا بريء تماماً وداخل السالفة',
  'هو المتسلل بالتأكيد',
  'كلامه مشبوه جداً',
  'ما أعرف وش أقول',
  'ثقوا فيني',
  'نصوت عليه الآن',
  'كلامك غير مقنع أبداً',
  'أنا نفس الكلمة معكم',
];

export default function GameRoom({ gameData, room, onGameEnd, onRoomReset, onLeave }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();

  // Role reveal modal
  const [showRoleModal, setShowRoleModal] = useState(true);

  // Game state
  const [phase, setPhase] = useState('discussion'); // 'discussion' | 'voting' | 'ended'
  const [round, setRound] = useState(gameData.round || 1);
  const [currentAsker, setCurrentAsker] = useState(gameData.currentAsker);
  const [currentAnswerer, setCurrentAnswerer] = useState(null);
  const [askersOrder, setAskersOrder] = useState(gameData.askersOrder || []);
  const [askerIndex, setAskerIndex] = useState(0);
  const [players, setPlayers] = useState(room.players || []);
  const [votes, setVotes] = useState({});
  const [myVote, setMyVote] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [selectingTarget, setSelectingTarget] = useState(false);
  const [roundAnnouncement, setRoundAnnouncement] = useState('');

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showQuickChat, setShowQuickChat] = useState(false);
  const chatEndRef = useRef(null);

  // Native WebRTC Audio State
  const [micAllowed, setMicAllowed] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micStatusText, setMicStatusText] = useState('جاري تهيئة الصوت...');
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // socketId -> RTCPeerConnection
  const remoteAudioElementsRef = useRef({}); // socketId -> HTMLAudioElement

  const isMyTurnToAsk = currentAsker === user?.id;
  const isMyTurnToAnswer = currentAnswerer === user?.id;
  const isHost = room?.host_id === user?.id;
  const isImpostor = gameData.role === 'impostor';

  // Can I speak right now?
  // During turn dialog: only Asker and Answerer can speak!
  // During voting or before question starts: all players can speak!
  const isSpeakingTurn = Boolean(
    phase === 'voting' ||
    !currentAnswerer ||
    isMyTurnToAsk ||
    isMyTurnToAnswer
  );

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const addSystemMessage = useCallback((text) => {
    setChatMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      type: 'system',
      message: text,
      timestamp: new Date().toISOString(),
    }]);
  }, []);

  // ──────────────────────────────────────────────
  // NATIVE WEBRTC VOICE SETUP (NO THIRD-PARTY SDK)
  // ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function initAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setMicAllowed(true);
        setMicStatusText('الميكروفون متصل');

        // Announce to peers in room that I am ready
        socket?.emit('webrtc_join');
      } catch (err) {
        console.warn('Microphone access denied or not found:', err.message);
        if (mounted) {
          setMicAllowed(false);
          setMicStatusText('الميكروفون غير متاح (يمكنك اللعب بالدردشة)');
        }
      }
    }

    initAudio();

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
      peerConnectionsRef.current = {};
      Object.values(remoteAudioElementsRef.current).forEach(audio => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      });
      remoteAudioElementsRef.current = {};
    };
  }, [socket]);

  // Adjust local audio track based on turns and mute state
  useEffect(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        // Enforce the rule: only dialog participants can speak during questions
        audioTrack.enabled = isSpeakingTurn && !isMuted;
      }
    }
  }, [isSpeakingTurn, isMuted]);

  // WebRTC Peer Connection Helper
  const createPeerConnection = useCallback((remoteSocketId) => {
    if (peerConnectionsRef.current[remoteSocketId]) {
      return peerConnectionsRef.current[remoteSocketId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local audio tracks to peer
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming remote audio stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      let audio = remoteAudioElementsRef.current[remoteSocketId];
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        remoteAudioElementsRef.current[remoteSocketId] = audio;
        document.body.appendChild(audio);
      }
      audio.srcObject = remoteStream;
      audio.play().catch(() => {});
    };

    // Send local ICE candidates to remote peer via socket
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('webrtc_signal', {
          targetSocketId: remoteSocketId,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    peerConnectionsRef.current[remoteSocketId] = pc;
    return pc;
  }, [socket]);

  // ──────────────────────────────────────────────
  // SOCKET LISTENERS
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onRoomUpdated = (r) => setPlayers(r.players || []);

    // WebRTC Signaling Events
    const onPeerJoined = async ({ socketId }) => {
      if (!localStreamRef.current) return;
      const pc = createPeerConnection(socketId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_signal', {
          targetSocketId: socketId,
          signal: { type: 'offer', offer }
        });
      } catch (e) {
        console.error('Create offer error:', e);
      }
    };

    const onWebRTCSignal = async ({ senderSocketId, signal }) => {
      const pc = createPeerConnection(senderSocketId);
      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc_signal', {
            targetSocketId: senderSocketId,
            signal: { type: 'answer', answer }
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        } else if (signal.type === 'candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (e) {
        console.error('WebRTC signal handling error:', e);
      }
    };

    // Game Progression Events
    const onDialogStarted = ({ askerId, answererId }) => {
      setCurrentAnswerer(answererId);
      setSelectingTarget(false);
      const askerName = players.find(p => p.id === askerId)?.username || 'السائل';
      const answererName = players.find(p => p.id === answererId)?.username || 'المجيب';
      addSystemMessage(`محادثة جارية: ${askerName} يسأل ${answererName}`);
    };

    const onQuestionDone = ({ askerId, answererId }) => {
      setCurrentAnswerer(null);
      const askerName = players.find(p => p.id === askerId)?.username || 'السائل';
      addSystemMessage(`انتهى سؤال ${askerName}`);
    };

    const onTurnChanged = ({ currentAsker: nextAsker, askerIndex: idx, totalAskers }) => {
      setCurrentAsker(nextAsker);
      setCurrentAnswerer(null);
      setAskerIndex(idx);
      setSelectingTarget(false);
      const nextAskerName = players.find(p => p.id === nextAsker)?.username || 'اللاعب';
      addSystemMessage(`انتقل دور السؤال إلى: ${nextAskerName} (${idx + 1} من ${totalAskers})`);
    };

    const onVotingStarted = ({ round: curRound }) => {
      setPhase('voting');
      setCurrentAnswerer(null);
      setVotes({});
      setMyVote(null);
      setRoundAnnouncement(`بدأت مرحلة التصويت للجولة ${curRound}! ناقشوا وصوتوا على المتسلل`);
      addSystemMessage(`بدأت مرحلة التصويت للجولة ${curRound}!`);
      toast('بدأت مرحلة التصويت!', 'info');
    };

    const onVoteUpdate = ({ votes: v }) => {
      const map = {};
      v.forEach(vote => { map[vote.voterId] = vote.targetId; });
      setVotes(map);
    };

    const onRoundAdvanced = ({ round: nextRound, eliminatedPlayer, currentAsker: nextAsker, askersOrder: newOrder, message }) => {
      setPhase('discussion');
      setRound(nextRound);
      setCurrentAsker(nextAsker);
      setCurrentAnswerer(null);
      setAskersOrder(newOrder);
      setAskerIndex(0);
      setVotes({});
      setMyVote(null);
      setRoundAnnouncement(message || `الشخص كان داخل السالفة! تبدأ الجولة ${nextRound}`);
      addSystemMessage(message || `تبدأ الجولة ${nextRound}`);
      toast(`الشخص كان داخل السالفة! تبدأ الجولة ${nextRound}`, 'info');
    };

    const onGameEnded = (result) => {
      setPhase('ended');
      setGameResult(result);
    };

    const onGameCancelled = ({ message }) => {
      toast(message || 'تم إيقاف اللعبة', 'error');
      setTimeout(() => onLeave(), 2000);
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
    socket.on('webrtc_peer_joined', onPeerJoined);
    socket.on('webrtc_signal', onWebRTCSignal);
    socket.on('dialog_started', onDialogStarted);
    socket.on('question_done', onQuestionDone);
    socket.on('turn_changed', onTurnChanged);
    socket.on('voting_started', onVotingStarted);
    socket.on('vote_update', onVoteUpdate);
    socket.on('round_advanced', onRoundAdvanced);
    socket.on('game_ended', onGameEnded);
    socket.on('game_cancelled', onGameCancelled);
    socket.on('chat_message', onChatMessage);
    socket.on('room_reset', handleRoomResetEvent);

    return () => {
      socket.off('room_updated', onRoomUpdated);
      socket.off('webrtc_peer_joined', onPeerJoined);
      socket.off('webrtc_signal', onWebRTCSignal);
      socket.off('dialog_started', onDialogStarted);
      socket.off('question_done', onQuestionDone);
      socket.off('turn_changed', onTurnChanged);
      socket.off('voting_started', onVotingStarted);
      socket.off('vote_update', onVoteUpdate);
      socket.off('round_advanced', onRoundAdvanced);
      socket.off('game_ended', onGameEnded);
      socket.off('game_cancelled', onGameCancelled);
      socket.off('chat_message', onChatMessage);
      socket.off('room_reset', handleRoomResetEvent);
    };
  }, [socket, players, createPeerConnection, addSystemMessage, onLeave, onRoomReset, toast]);

  // Audio mute toggle
  const toggleMute = () => {
    if (!micAllowed) {
      toast('الميكروفون غير متاح أو لم يتم منحه الإذن', 'error');
      return;
    }
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isSpeakingTurn && !nextMuted;
      }
    }
    toast(nextMuted ? 'تم كتم الميكروفون' : 'تم تفعيل الميكروفون', 'info');
  };

  // Turn Actions
  const handleSelectTarget = (targetId) => {
    if (!isMyTurnToAsk || targetId === user?.id) return;
    socket?.emit('select_target', { targetId }, (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleFinishQuestion = () => {
    socket?.emit('finish_question', (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleRequestVote = () => {
    socket?.emit('request_vote', (res) => {
      if (res?.error) toast(res.error, 'error');
    });
  };

  const handleVote = (targetId) => {
    if (myVote) return;
    setMyVote(targetId);
    socket?.emit('cast_vote', { targetId }, (res) => {
      if (res?.error) {
        toast(res.error, 'error');
        setMyVote(null);
      } else {
        toast('تم تسجيل تصويتك', 'success');
      }
    });
  };

  const handleResetGame = () => {
    socket?.emit('reset_game', (res) => {
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
    socket?.emit('leave_room', () => onLeave());
  };

  const currentAskerPlayer = players.find(p => p.id === currentAsker);
  const currentAnswererPlayer = players.find(p => p.id === currentAnswerer);

  // Vote counting
  const voteCount = {};
  Object.values(votes).forEach(vid => {
    voteCount[vid] = (voteCount[vid] || 0) + 1;
  });

  // ──────────────────────────────────────────────
  // GAME OVER OVERLAY
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
            <span className={`badge ${iWon ? 'badge-green' : 'badge-red'}`} style={{ padding: '6px 14px', fontSize: '14px' }}>
              {iWon ? 'فوز بالجولة' : 'خسارة الجولة'}
            </span>
            <h1 style={{ fontSize: '30px', fontWeight: '800', marginTop: '12px', letterSpacing: '-0.5px' }}>
              {gameResult.winner === 'citizens' ? 'فاز المواطنون (داخل السالفة)' : 'فاز المتسلل (برا السالفة)'}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {gameResult.message}
            </p>
          </div>

          <div className="card" style={{ marginBottom: '20px', textAlign: 'right' }}>
            <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>السالفة كانت</div>
              <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--accent)' }}>
                {gameResult.word}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>المتسلل (برا السالفة)</div>
              {gameResult.impostors?.map((imp, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  background: 'var(--danger-subtle)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '6px',
                }}>
                  <div className="avatar avatar-sm">
                    {imp?.username?.[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--danger)' }}>
                    {imp?.username}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {gameResult.wasImpostor ? 'تم كشف المتسلل عبر التصويت الصحيح' : 'المتسلل تمكن من التمويه حتى النهاية'}
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
  // ACTIVE GAME ROOM UI
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
      {/* ── ROLE REVEAL MODAL AT START ── */}
      {showRoleModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '28px' }}>
            <span className={`badge ${isImpostor ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '13px', padding: '6px 14px', marginBottom: '16px' }}>
              {isImpostor ? 'دورك: برا السالفة' : 'دورك: داخل السالفة'}
            </span>

            <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '14px 0 8px' }}>
              {isImpostor ? 'أنت برا السالفة!' : 'أنت داخل السالفة!'}
            </h2>

            {!isImpostor ? (
              <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', padding: '16px', borderRadius: 'var(--radius-sm)', margin: '16px 0' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>السالفة هي</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--accent)' }}>
                  {gameData.word}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  الفئة: {gameData.category}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger-border)', padding: '16px', borderRadius: 'var(--radius-sm)', margin: '16px 0' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--danger)', marginBottom: '4px' }}>
                  أنت لا تعرف السالفة!
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  فئة السالفة: <strong>{gameData.category}</strong>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '8px' }}>
                  تظاهر بالمعرفة، استمع للأسئلة بذكاء، وخمن السالفة دون أن يشكوا فيك
                </div>
              </div>
            )}

            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
              {isImpostor
                ? 'استمع جيداً ولا تفضح جهلك بالكلمة أثناء الأسئلة!'
                : 'اسأل وأجب بذكاء دون أن تكشف الكلمة للمتسلل!'}
            </p>

            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={() => setShowRoleModal(false)}
            >
              <IconCheck size={16} />
              <span>فهمت، أنا جاهز للبدء</span>
            </button>
          </div>
        </div>
      )}

      {/* ── TOP HEADER ── */}
      <header style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Role Pill */}
          <div
            onClick={() => setShowRoleModal(true)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              background: isImpostor ? 'var(--danger-subtle)' : 'var(--accent-subtle)',
              border: `1px solid ${isImpostor ? 'var(--danger-border)' : 'var(--accent-border)'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            title="انقر لإظهار بطاقة دورك"
          >
            <div>
              <div style={{ fontWeight: '700', fontSize: '13px', color: isImpostor ? 'var(--danger)' : 'var(--accent)' }}>
                {isImpostor ? 'أنت برا السالفة' : 'أنت داخل السالفة'}
              </div>
              {!isImpostor ? (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  السالفة: <strong style={{ color: 'var(--text-primary)' }}>{gameData.word}</strong>
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  الفئة: {gameData.category}
                </div>
              )}
            </div>
          </div>

          <span className="badge">
            الجولة {round}
          </span>

          <span className={`badge ${phase === 'voting' ? 'badge-red' : 'badge-green'}`}>
            {phase === 'voting' ? 'مرحلة التصويت' : 'مرحلة الأسئلة'}
          </span>
        </div>

        {/* Audio status & Game Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${isMuted || !isSpeakingTurn ? 'btn-secondary' : 'btn-primary'}`}
            onClick={toggleMute}
            title={!isSpeakingTurn ? 'المايك مغلق حالياً لأنها ليست جولة حديثك' : (isMuted ? 'تفعيل المايك' : 'كتم المايك')}
          >
            {isMuted || !isSpeakingTurn ? <IconMicOff size={14} /> : <IconMic size={14} />}
            <span>
              {!isSpeakingTurn
                ? 'مايك مقفل'
                : (isMuted ? 'مكتوم' : 'تحدث')}
            </span>
          </button>

          {isHost && phase === 'discussion' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRequestVote}
              title="تخطي الأسئلة وبدء التصويت فوراً"
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

      {/* ── MAIN CONTENT (Left: Board, Right: Chat) ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', overflow: 'hidden' }}>
        {/* Left Board */}
        <div style={{ overflowY: 'auto', padding: '20px' }}>
          {/* Round announcement banner */}
          {roundAnnouncement && (
            <div style={{
              marginBottom: '16px',
              padding: '10px 16px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              color: 'var(--text-secondary)'
            }}>
              {roundAnnouncement}
            </div>
          )}

          {/* Discussion Turn Status Banner */}
          {phase === 'discussion' && (
            <div className="card" style={{ marginBottom: '20px', padding: '18px 20px', borderColor: isMyTurnToAsk ? 'var(--accent)' : 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '800' }}>
                      {isMyTurnToAsk
                        ? 'دورك الآن في طرح السؤال!'
                        : `دور: ${currentAskerPlayer?.username || 'لاعب'} في السؤال`}
                    </h3>
                    <span className="badge" style={{ fontSize: '11px' }}>
                      السؤال {askerIndex + 1} من {askersOrder.length}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {currentAnswererPlayer ? (
                      <div>
                        محادثة جارية بين <strong>{currentAskerPlayer?.username}</strong> و <strong>{currentAnswererPlayer?.username}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                          المايك مفتوح للمتحاورَين فقط، ومغلق لباقي اللاعبين أثناء السؤال والإجابة.
                        </div>
                      </div>
                    ) : isMyTurnToAsk ? (
                      'اضغط على زر (اختر لاعباً لتسأله) ثم انقر على بطاقة اللاعب أدناه'
                    ) : (
                      `في انتظار اختيار ${currentAskerPlayer?.username || 'اللاعب'} لشخص يوجه له السؤال`
                    )}
                  </div>
                </div>

                {/* Actions for Asker / Answerer */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isMyTurnToAsk && !currentAnswerer && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setSelectingTarget(!selectingTarget)}
                    >
                      {selectingTarget ? 'اختر من القائمة أدناه' : 'اختر لاعباً لتسأله'}
                    </button>
                  )}

                  {(isMyTurnToAsk || isMyTurnToAnswer || isHost) && currentAnswerer && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleFinishQuestion}
                    >
                      <IconCheck size={14} />
                      <span>إنهاء السؤال والدور</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Voting Phase Banner */}
          {phase === 'voting' && (
            <div className="card" style={{ marginBottom: '20px', padding: '18px 20px', borderColor: 'var(--danger-border)', background: 'var(--danger-subtle)' }}>
              <div style={{ fontWeight: '800', fontSize: '16px', color: 'var(--danger)', marginBottom: '4px' }}>
                مرحلة التصويت ({Object.keys(votes).length} / {players.length} أصوات مسجلة)
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {myVote ? (
                  <span>
                    صوّتت على: <strong>{players.find(p => p.id === myVote)?.username}</strong>
                  </span>
                ) : (
                  'تناقشوا بحرية، واضغط على بطاقة الشخص الذي تعتقد أنه برا السالفة للتصويت عليه'
                )}
              </div>
            </div>
          )}

          {/* Players Grid Header */}
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)' }}>
              قائمة اللاعبين ({players.length})
            </h4>
            {selectingTarget && (
              <span className="badge badge-green">
                اضغط على بطاقة لاعب لتسأله
              </span>
            )}
          </div>

          {/* Players Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '10px'
          }}>
            {players.map(p => {
              const isCurrentAsker = p.id === currentAsker;
              const isCurrentAnswerer = p.id === currentAnswerer;
              const isDialogParticipant = isCurrentAsker || isCurrentAnswerer;
              const pVoteCount = voteCount[p.id] || 0;
              const hasVotedFor = votes[user?.id] === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (phase === 'voting' && p.id !== user?.id && !myVote) {
                      handleVote(p.id);
                    } else if (phase === 'discussion' && selectingTarget && p.id !== user?.id) {
                      handleSelectTarget(p.id);
                    }
                  }}
                  className="card"
                  style={{
                    padding: '16px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    border: `1px solid ${
                      hasVotedFor ? 'var(--danger)'
                      : isDialogParticipant ? 'var(--accent)'
                      : (selectingTarget && p.id !== user?.id) ? 'var(--accent)'
                      : 'var(--border)'
                    }`,
                    background: hasVotedFor
                      ? 'var(--danger-subtle)'
                      : isDialogParticipant
                      ? 'var(--accent-subtle)'
                      : '#ffffff',
                    cursor: (
                      (phase === 'voting' && p.id !== user?.id && !myVote) ||
                      (phase === 'discussion' && selectingTarget && p.id !== user?.id)
                    ) ? 'pointer' : 'default',
                    position: 'relative'
                  }}
                >
                  {/* Host Crown */}
                  {room.host_id === p.id && (
                    <div style={{ position: 'absolute', top: '8px', left: '8px', color: 'var(--text-dim)' }}>
                      <IconCrown size={14} />
                    </div>
                  )}

                  <div className="avatar">
                    {p.username[0]?.toUpperCase()}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: '700', fontSize: '13px' }}>
                      {p.username}
                      {p.id === user?.id && (
                        <span style={{ color: 'var(--accent)', fontSize: '11px', marginRight: '4px' }}>(أنت)</span>
                      )}
                    </div>

                    {/* Role in dialog */}
                    {isCurrentAsker && (
                      <span className="badge badge-green" style={{ marginTop: '4px', fontSize: '10px' }}>
                        السائل
                      </span>
                    )}
                    {isCurrentAnswerer && (
                      <span className="badge" style={{ marginTop: '4px', fontSize: '10px' }}>
                        المجيب
                      </span>
                    )}
                  </div>

                  {/* Vote Count Badge */}
                  {phase === 'voting' && pVoteCount > 0 && (
                    <div className="badge badge-red" style={{ fontSize: '11px' }}>
                      {pVoteCount} أصوات
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT CHAT PANEL ── */}
        <div className="chat-box" style={{ borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}>
          <div className="chat-header">
            <span>دردشة اللعبة</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{chatMessages.length} رسالة</span>
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px', marginTop: '40px' }}>
                ابدأ المحادثة وطرح الأسئلة
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
              background: 'var(--bg-surface)',
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
                    background: '#ffffff',
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
