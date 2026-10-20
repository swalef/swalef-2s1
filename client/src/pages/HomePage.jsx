import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import axios from 'axios';

import { API_URL } from '../config';

export default function HomePage({ onJoinRoom }) {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const toast = useToast();
  const [tab, setTab] = useState('main'); // 'main' | 'create' | 'browse'
  const [joinCode, setJoinCode] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Create room form
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [category, setCategory] = useState('عام');
  const [maxPlayers, setMaxPlayers] = useState(8);

  useEffect(() => {
    axios.get(`${API_URL}/categories`).then(r => setCategories(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'browse') {
      fetchPublicRooms();
      const interval = setInterval(fetchPublicRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [tab]);

  const fetchPublicRooms = async () => {
    try {
      const res = await axios.get(`${API_URL}/rooms/public`);
      setPublicRooms(res.data);
    } catch {}
  };

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return toast('أدخل كود الغرفة', 'error');
    if (!socket || !connected) return toast('جاري الاتصال...', 'info');
    setLoading(true);
    socket.emit('join_room', { code: joinCode.trim().toUpperCase() }, (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('انضممت للغرفة! 🎮', 'success');
      onJoinRoom(res.room);
    });
  };

  const handleJoinRandom = () => {
    if (!socket || !connected) return toast('جاري الاتصال...', 'info');
    setLoading(true);
    socket.emit('join_random', (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('انضممت لغرفة عشوائية! 🎲', 'success');
      onJoinRoom(res.room);
    });
  };

  const handleJoinPublicRoom = (code) => {
    if (!socket || !connected) return toast('جاري الاتصال...', 'info');
    setLoading(true);
    socket.emit('join_room', { code }, (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('انضممت للغرفة! 🎮', 'success');
      onJoinRoom(res.room);
    });
  };

  const handleCreateRoom = () => {
    if (!socket || !connected) return toast('جاري الاتصال...', 'info');
    setLoading(true);
    socket.emit('create_room', {
      name: roomName || `غرفة ${user.username}`,
      isPublic,
      category,
      maxPlayers
    }, (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('تم إنشاء الغرفة! 🏠', 'success');
      onJoinRoom(res.room);
    });
  };

  return (
    <div style={{ minHeight: '100vh', padding: '0 16px' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0',
        borderBottom: '1px solid var(--border)',
        marginBottom: '32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px', height: '48px',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '26px',
            boxShadow: '0 0 20px rgba(34,197,94,0.4)',
          }}>🎭</div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: 'var(--primary-lighter)' }}>سوالف</h1>
            <span className="badge badge-green" style={{ fontSize: '11px' }}>
              {connected ? '● متصل' : '○ جاري الاتصال...'}
            </span>
          </div>
        </div>

        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '700', fontSize: '15px' }}>{user.username}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{user.email}</div>
          </div>
          <div
            className="avatar avatar-online"
            style={{ background: user.avatarColor || '#22c55e' }}
          >
            {user.username[0]?.toUpperCase()}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={logout}
            title="تسجيل الخروج"
          >🚪</button>
        </div>
      </header>

      {/* Main content */}
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {tab === 'main' && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            {/* Welcome */}
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <h2 style={{
                fontSize: '36px',
                fontWeight: '900',
                background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                marginBottom: '10px',
              }}>
                مرحباً {user.username}! 👋
              </h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '16px' }}>
                هل أنت مستعد للكشف عن المتسلل؟
              </p>
            </div>

            {/* Join by code */}
            <div className="card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '700' }}>
                🔑 انضم بكود الغرفة
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  className="input"
                  placeholder="أدخل كود الغرفة (مثال: ABC123)"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  style={{ letterSpacing: '4px', textAlign: 'center', fontWeight: '700', fontSize: '18px' }}
                  onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleJoinByCode}
                  disabled={loading || !joinCode.trim()}
                  style={{ whiteSpace: 'nowrap', minWidth: '120px' }}
                >
                  {loading ? <div className="spinner" /> : 'انضم →'}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid-2" style={{ gap: '16px', marginBottom: '20px' }}>
              <button
                className="card card-hover"
                onClick={handleJoinRandom}
                disabled={loading}
                style={{
                  border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.08))',
                  borderColor: 'rgba(34,197,94,0.3)',
                  padding: '28px 20px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                  borderRadius: 'var(--radius-lg)',
                  transition: 'var(--transition)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <span style={{ fontSize: '42px' }}>🎲</span>
                <span style={{ fontSize: '18px', fontWeight: '700' }}>غرفة عشوائية</span>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>انضم لغرفة تلقائياً</span>
              </button>

              <button
                className="card card-hover"
                onClick={() => setTab('create')}
                style={{
                  border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(22,163,74,0.15), rgba(15,107,48,0.08))',
                  borderColor: 'rgba(34,197,94,0.3)',
                  padding: '28px 20px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                  borderRadius: 'var(--radius-lg)',
                  transition: 'var(--transition)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <span style={{ fontSize: '42px' }}>🏠</span>
                <span style={{ fontSize: '18px', fontWeight: '700' }}>إنشاء غرفة</span>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>ابدأ غرفتك الخاصة</span>
              </button>
            </div>

            <button
              className="btn btn-secondary btn-block"
              onClick={() => setTab('browse')}
              style={{ height: '52px', fontSize: '16px', justifyContent: 'center', gap: '10px' }}
            >
              <span>🔍</span> استعرض الغرف العامة
            </button>
          </div>
        )}

        {tab === 'create' && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setTab('main')}>
                ← رجوع
              </button>
              <h2 style={{ fontSize: '22px', fontWeight: '800' }}>🏠 إنشاء غرفة جديدة</h2>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group">
                <label className="input-label">اسم الغرفة (اختياري)</label>
                <input
                  className="input"
                  placeholder={`غرفة ${user.username}`}
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  maxLength={30}
                />
              </div>

              <div className="input-group">
                <label className="input-label">الفئة</label>
                <select
                  className="input"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  {categories.map(c => (
                    <option key={c} value={c} style={{ background: 'var(--bg-medium)', color: 'white' }}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">الحد الأقصى للاعبين: {maxPlayers}</label>
                <input
                  type="range" min="4" max="12"
                  value={maxPlayers}
                  onChange={e => setMaxPlayers(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary-light)', height: '6px', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-dim)' }}>
                  <span>4 لاعبين</span>
                  <span>12 لاعبين</span>
                </div>
              </div>

              <div>
                <label className="input-label" style={{ marginBottom: '12px', display: 'block' }}>نوع الغرفة</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { val: true, label: '🌍 عامة', desc: 'يمكن للجميع الانضمام' },
                    { val: false, label: '🔒 خاصة', desc: 'بكود فقط' },
                  ].map(({ val, label, desc }) => (
                    <button
                      key={String(val)}
                      onClick={() => setIsPublic(val)}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-md)',
                        border: `2px solid ${isPublic === val ? 'var(--primary-light)' : 'var(--border)'}`,
                        background: isPublic === val ? 'rgba(34,197,94,0.1)' : 'var(--bg-glass)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        textAlign: 'center',
                        fontFamily: 'Cairo, sans-serif',
                      }}
                    >
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={handleCreateRoom}
                disabled={loading}
              >
                {loading ? <div className="spinner" /> : '🚀 إنشاء الغرفة'}
              </button>
            </div>
          </div>
        )}

        {tab === 'browse' && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setTab('main')}>← رجوع</button>
                <h2 style={{ fontSize: '22px', fontWeight: '800' }}>🔍 الغرف العامة</h2>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={fetchPublicRooms}>🔄 تحديث</button>
            </div>

            {publicRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏜️</div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-dim)' }}>
                  لا توجد غرف عامة الآن
                </h3>
                <p style={{ color: 'var(--text-dim)', marginBottom: '20px' }}>
                  كن أول من ينشئ غرفة!
                </p>
                <button className="btn btn-primary" onClick={() => setTab('create')}>
                  إنشاء غرفة 🏠
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {publicRooms.map(room => (
                  <div key={room.id} className="card card-hover" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        className="avatar"
                        style={{ background: room.host_color || '#22c55e', fontSize: '18px' }}
                      >
                        {room.host_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '16px' }}>{room.name}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '13px', display: 'flex', gap: '10px', marginTop: '3px' }}>
                          <span>👤 {room.host_name}</span>
                          <span>🎯 {room.category}</span>
                          <span>👥 {room.player_count}/{room.max_players}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleJoinPublicRoom(room.code)}
                      disabled={loading || room.player_count >= room.max_players}
                    >
                      {room.player_count >= room.max_players ? 'ممتلئة' : 'انضم →'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
