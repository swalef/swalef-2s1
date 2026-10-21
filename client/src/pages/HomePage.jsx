import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import axios from 'axios';
import { API_URL } from '../config';
import {
  IconUsers,
  IconPlus,
  IconRefresh,
  IconLogout,
  IconShield
} from '../components/Icons';

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

  // Check URL parameter for room code (e.g. ?code=ABCDEF)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get('code') || params.get('join');
      if (codeFromUrl) {
        setJoinCode(codeFromUrl.toUpperCase());
      }
    }
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/categories`)
      .then(r => setCategories(r.data))
      .catch(() => {});
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
    } catch {
      // silently ignore
    }
  };

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return toast('أدخل كود الغرفة', 'error');
    if (!socket || !connected) return toast('جاري الاتصال بالخادم...', 'info');
    setLoading(true);
    socket.emit('join_room', { code: joinCode.trim().toUpperCase() }, (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('انضممت إلى الغرفة بنجاح', 'success');
      onJoinRoom(res.room);
    });
  };

  const handleJoinRandom = () => {
    if (!socket || !connected) return toast('جاري الاتصال بالخادم...', 'info');
    setLoading(true);
    socket.emit('join_random', (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('تم الانضمام لغرفة متاحة', 'success');
      onJoinRoom(res.room);
    });
  };

  const handleJoinPublicRoom = (code) => {
    if (!socket || !connected) return toast('جاري الاتصال بالخادم...', 'info');
    setLoading(true);
    socket.emit('join_room', { code }, (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('انضممت للغرفة', 'success');
      onJoinRoom(res.room);
    });
  };

  const handleCreateRoom = () => {
    if (!socket || !connected) return toast('جاري الاتصال بالخادم...', 'info');
    setLoading(true);
    socket.emit('create_room', {
      name: roomName.trim() || `غرفة ${user.username}`,
      isPublic,
      category,
      maxPlayers
    }, (res) => {
      setLoading(false);
      if (res.error) return toast(res.error, 'error');
      toast('تم إنشاء الغرفة بنجاح', 'success');
      onJoinRoom(res.room);
    });
  };

  return (
    <div style={{ minHeight: '100vh', padding: '0 20px', maxWidth: '840px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 0',
        borderBottom: '1px solid var(--border)',
        marginBottom: '32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            background: 'var(--text-primary)',
            color: '#09090b',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '900',
            fontSize: '16px',
          }}>
            س
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800', lineHeight: 1.2 }}>سوالف</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: connected ? 'var(--accent)' : 'var(--danger)',
                display: 'inline-block'
              }} />
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                {connected ? 'متصل' : 'جاري الاتصال'}
              </span>
            </div>
          </div>
        </div>

        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '700', fontSize: '14px' }}>{user.username}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{user.email}</div>
          </div>
          <div className="avatar">
            {user.username[0]?.toUpperCase()}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={logout}
            title="تسجيل الخروج"
            style={{ padding: '8px' }}
          >
            <IconLogout size={16} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div>
        {tab === 'main' && (
          <div>
            {/* Header intro */}
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                أهلاً بك، {user.username}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                لعبة برا السالفة: اطرح الأسئلة بذكاء، اكتشف المتسلل، ولا تفضح الكلمة!
              </p>
            </div>

            {/* Join by code */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>
                الانضمام عبر كود الغرفة
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  className="input"
                  placeholder="أدخل كود الغرفة (6 أحرف)"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  style={{ letterSpacing: '3px', textAlign: 'center', fontWeight: '700', fontSize: '16px' }}
                  onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleJoinByCode}
                  disabled={loading || !joinCode.trim()}
                  style={{ minWidth: '100px' }}
                >
                  {loading ? <div className="spinner" /> : 'انضمام'}
                </button>
              </div>
            </div>

            {/* Main Action Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div
                className="card"
                onClick={() => setTab('create')}
                style={{
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'var(--transition)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px' }}>إنشاء غرفة جديدة</span>
                  <IconPlus size={18} />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  أنشئ غرفتك الخاصة وشارك الكود أو الرابط مع أصدقائك
                </p>
              </div>

              <div
                className="card"
                onClick={handleJoinRandom}
                style={{
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'var(--transition)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px' }}>دخول غرفة عشوائية</span>
                  <IconUsers size={18} />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  انضم بشكل فوري لأي غرفة عامة بانتظار لاعبين
                </p>
              </div>
            </div>

            {/* Browse public button */}
            <button
              className="btn btn-secondary btn-block"
              onClick={() => setTab('browse')}
              style={{ height: '46px', fontSize: '14px' }}
            >
              استعراض الغرف العامة المتاحة
            </button>
          </div>
        )}

        {/* CREATE ROOM TAB */}
        {tab === 'create' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setTab('main')}>
                عودة
              </button>
              <h2 style={{ fontSize: '18px', fontWeight: '800' }}>إعداد غرفة جديدة</h2>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="input-group">
                <label className="input-label">اسم الغرفة</label>
                <input
                  className="input"
                  placeholder={`غرفة ${user.username}`}
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  maxLength={30}
                />
              </div>

              <div className="input-group">
                <label className="input-label">فئة الكلمات</label>
                <select
                  className="input"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  {categories.map(c => (
                    <option key={c} value={c} style={{ background: '#18181b', color: '#fafafa' }}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label className="input-label">الحد الأقصى للاعبين</label>
                  <span style={{ fontSize: '13px', fontWeight: '700' }}>{maxPlayers}</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="12"
                  value={maxPlayers}
                  onChange={e => setMaxPlayers(Number(e.target.value))}
                  style={{ width: '100%', height: '4px', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)' }}>
                  <span>3 لاعبين</span>
                  <span>12 لاعباً</span>
                </div>
              </div>

              <div>
                <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>نوع الغرفة</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { val: true, title: 'عامة', desc: 'تظهر في قائمة الغرف للجميع' },
                    { val: false, title: 'خاصة', desc: 'الدخول عبر الكود أو الرابط فقط' }
                  ].map(({ val, title, desc }) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setIsPublic(val)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${isPublic === val ? 'var(--text-primary)' : 'var(--border)'}`,
                        background: isPublic === val ? 'var(--bg-subtle)' : 'transparent',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'right',
                        fontFamily: 'Cairo, sans-serif'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '14px' }}>{title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={handleCreateRoom}
                disabled={loading}
                style={{ marginTop: '8px' }}
              >
                {loading ? <div className="spinner" /> : 'إنشاء الغرفة والدخول'}
              </button>
            </div>
          </div>
        )}

        {/* BROWSE ROOMS TAB */}
        {tab === 'browse' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setTab('main')}>عودة</button>
                <h2 style={{ fontSize: '18px', fontWeight: '800' }}>الغرف العامة</h2>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={fetchPublicRooms}>
                <IconRefresh size={14} /> تحديث
              </button>
            </div>

            {publicRooms.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
                <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  لا توجد غرف عامة بانتظار لاعبين حالياً
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '18px' }}>
                  يمكنك إنشاء غرفة جديدة ودعوة أصدقائك للانضمام
                </p>
                <button className="btn btn-primary btn-sm" onClick={() => setTab('create')}>
                  إنشاء غرفة الآن
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {publicRooms.map(room => (
                  <div
                    key={room.id}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="avatar avatar-sm">
                        {room.host_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px' }}>{room.name}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '12px', display: 'flex', gap: '12px', marginTop: '2px' }}>
                          <span>المضيف: {room.host_name}</span>
                          <span>الفئة: {room.category}</span>
                          <span>اللاعبون: {room.player_count}/{room.max_players}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleJoinPublicRoom(room.code)}
                      disabled={loading || room.player_count >= room.max_players}
                    >
                      {room.player_count >= room.max_players ? 'ممتلئة' : 'انضمام'}
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
