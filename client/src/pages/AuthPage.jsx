import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { IconEye, IconEyeOff } from '../components/Icons';

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
        toast('مرحبا بك، تم تسجيل الدخول بنجاح', 'success');
      } else {
        await register(email, password, username);
        toast('تم إنشاء حسابك بنجاح', 'success');
      }
    } catch (err) {
      console.error('Auth error:', err);
      const msg = err.response?.data?.error || (err.message === 'Network Error' ? 'فشل الاتصال بالخادم، يرجى إعادة المحاولة' : (err.message || 'حدث خطأ، حاول مجددا'));
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
      padding: '24px 16px',
      background: 'var(--bg-base)',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Header / Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', marginBottom: '6px' }}>
            سوالف
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
            لعبة برا السالفة الجماعية
          </p>
        </div>

        {/* Card */}
        <div className="card">
          {/* Mode Tabs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px',
            marginBottom: '24px',
            border: '1px solid var(--border)',
          }}>
            {[
              ['login', 'تسجيل الدخول'],
              ['register', 'حساب جديد']
            ].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: mode === m ? 'var(--bg-surface)' : 'transparent',
                  color: mode === m ? 'var(--text-primary)' : 'var(--text-dim)',
                  fontFamily: 'Cairo, sans-serif',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'register' && (
              <div className="input-group">
                <label className="input-label">اسم المستخدم</label>
                <input
                  className="input"
                  type="text"
                  placeholder="الاسم المستعار"
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
                placeholder="name@example.com"
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
                  placeholder="كلمة السر"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{ paddingLeft: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px',
                  }}
                  title={showPass ? 'إخفاء' : 'إظهار'}
                >
                  {showPass ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
              style={{ marginTop: '10px', height: '42px' }}
            >
              {loading ? (
                <div className="spinner" />
              ) : (
                mode === 'login' ? 'دخول' : 'إنشاء الحساب'
              )}
            </button>
          </form>

          {mode === 'login' ? (
            <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '12px', color: 'var(--text-dim)' }}>
              ليس لديك حساب؟{' '}
              <span
                onClick={() => setMode('register')}
                style={{ color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}
              >
                إنشاء حساب الآن
              </span>
            </p>
          ) : (
            <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '12px', color: 'var(--text-dim)' }}>
              لديك حساب بالفعل؟{' '}
              <span
                onClick={() => setMode('login')}
                style={{ color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}
              >
                تسجيل الدخول
              </span>
            </p>
          )}
        </div>

        {/* Minimal info note */}
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-dim)',
        }}>
          يمكن بدء اللعبة من لاعبين وحتى 10 لاعبين
        </div>
      </div>
    </div>
  );
}
