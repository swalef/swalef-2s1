import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const AVATAR_COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { login, register } = useAuth();
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        toast('مرحباً بعودتك! 🎮', 'success');
      } else {
        await register(email, password, username);
        toast('تم إنشاء حسابك بنجاح! 🎉', 'success');
      }
    } catch (err) {
      console.error('Auth error:', err);
      const msg = err.response?.data?.error || (err.message === 'Network Error' ? 'فشل الاتصال بسيرفر اللعبة، يرجى تحديث الصفحة بالكامل' : (err.message || 'حدث خطأ، حاول مجدداً'));
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
    }}>
      {/* Background particles */}
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{
          position: 'fixed',
          width: `${30 + i * 20}px`,
          height: `${30 + i * 20}px`,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(34,197,94,0.15), transparent)`,
          top: `${10 + i * 15}%`,
          left: `${5 + i * 16}%`,
          animation: `float ${3 + i * 0.5}s ease-in-out infinite`,
          animationDelay: `${i * 0.4}s`,
          pointerEvents: 'none',
        }} />
      ))}

      <div style={{ width: '100%', maxWidth: '420px', animation: 'fadeIn 0.5s ease' }}>
        

        {/* Card */}
        <div className="card" style={{ padding: '32px' }}>
          {/* Tabs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--bg-glass)',
            borderRadius: 'var(--radius-md)',
            padding: '4px',
            marginBottom: '28px',
            border: '1px solid var(--border)',
          }}>
            {[['login','تسجيل الدخول'],['register','حساب جديد']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: 'none',
                  background: mode === m ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--text-dim)',
                  fontFamily: 'Cairo, sans-serif',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  boxShadow: mode === m ? '0 2px 10px rgba(34,197,94,0.3)' : 'none',
                }}
              >{label}</button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {mode === 'register' && (
              <div className="input-group" style={{ animation: 'fadeIn 0.3s ease' }}>
                <label className="input-label">اسم المستخدم</label>
                <input
                  className="input"
                  type="text"
                  placeholder="مثال : عبد الهادي الجميل الرائع"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={20}
                />
              </div>
            )}

            <div className="input-group">
              <label className="input-label">البريد الإلكتروني</label>
              <input
                className="input"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{ direction: 'ltr', textAlign: 'right' }}
              />
            </div>

            <div className="input-group">
              <label className="input-label">كلمة السر</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{ paddingLeft: '48px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
              style={{ marginTop: '8px', height: '50px', fontSize: '16px' }}
            >
              {loading ? (
                <div className="spinner" />
              ) : (
                mode === 'login' ? 'دخول للعب' : 'إنشاء حساب'
              )}
            </button>
          </form>

          {mode === 'login' && (
            <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-dim)' }}>
              ما عندك حساب؟{' '}
              <span
                onClick={() => setMode('register')}
                style={{ color: 'var(--primary-lighter)', cursor: 'pointer', fontWeight: '600' }}
              >
                سجل الآن
              </span>
            </p>
          )}
        </div>

        {/* Demo hint */}
        <div style={{
          marginTop: '20px',
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(34,197,94,0.06)',
          border: '1px solid rgba(34,197,94,0.15)',
          textAlign: 'center',
          fontSize: '13px',
          color: 'var(--text-dim)',
        }}>
          💡 اللعبة تحتاج{' '}
          <span style={{ color: 'var(--primary-lighter)', fontWeight: '600' }}>4 لاعبين على الأقل</span>
          {' '}للبدء
        </div>
      </div>
    </div>
  );
}
