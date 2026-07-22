import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader, Shield, X, Zap } from 'lucide-react';
import SEO from "../components/SEO";

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/* ═══════════════════════════════════════════════════════════════
   PASSWORD STRENGTH — BIGGER, CLEARER
   ═══════════════════════════════════════════════════════════════ */
const PasswordStrength = ({ password }) => {
  if (!password) return null;
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  const activeColor = colors[Math.max(0, score - 1)];

  return (
    <div style={{ marginTop: 12, animation: 'auth_fadeUp .3s ease both' }}>
      <div style={{ display: 'flex', height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden', gap: 4 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: '100%', borderRadius: 3,
            background: i < score ? activeColor : 'transparent',
            transition: `background 0.35s ${EASE_OUT} ${i * 70}ms`,
            boxShadow: i < score ? `0 0 8px ${activeColor}44` : 'none',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: '.85rem', fontWeight: 800, color: activeColor, letterSpacing: '.02em' }}>
          {labels[Math.max(0, score - 1)]}
        </span>
        {password.length < 6 && (
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: '#ef4444' }}>6+ characters required</span>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   INPUT FIELD — BIGGER TOUCH TARGETS, BOLDER
   ═══════════════════════════════════════════════════════════════ */
const InputField = ({ icon, type, placeholder, value, onChange, required, minLength, autoFocus, label }) => {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPassword = type === 'password';

  return (
    <div style={{ marginBottom: 20 }}>
      {label && (
        <label style={{
          display: 'block', fontSize: '.85rem', fontWeight: 800,
          color: focused ? '#10b981' : '#64748b',
          marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em',
          transition: 'color .2s',
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
          color: focused ? '#10b981' : '#64748b',
          transition: 'color .2s', display: 'flex', alignItems: 'center', pointerEvents: 'none',
        }}>
          {icon}
        </div>
        <input
          type={isPassword ? (showPass ? 'text' : 'password') : type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            padding: '16px 50px 16px 50px',
            borderRadius: 14,
            background: focused ? 'rgba(16,185,129,.03)' : '#0d1118',
            border: `2px solid ${focused ? '#10b981' : '#151b26'}`,
            color: '#f8fafc',
            fontSize: '1rem',
            fontWeight: 600,
            outline: 'none',
            transition: 'border-color .2s, box-shadow .2s, background .2s',
            boxShadow: focused ? '0 0 0 4px rgba(16,185,129,.1)' : 'none',
            boxSizing: 'border-box',
            minHeight: 56,
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPass(p => !p)}
            style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              color: focused ? '#10b981' : '#64748b',
              padding: 6, background: 'none', border: 'none',
              cursor: 'pointer', transition: 'color .2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 10,
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Toggle password visibility"
          >
            {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   FOOTBALL PITCH DECORATION
   ═══════════════════════════════════════════════════════════════ */
const PitchDecoration = () => (
  <svg
    width="100%" height="100%"
    style={{ position: 'absolute', inset: 0, opacity: 0.018, pointerEvents: 'none' }}
    preserveAspectRatio="none"
    viewBox="0 0 400 600"
  >
    <rect x="0" y="0" width="400" height="600" fill="none" stroke="white" strokeWidth="2" />
    <line x1="200" y1="0" x2="200" y2="600" stroke="white" strokeWidth="1.5" />
    <circle cx="200" cy="300" r="60" fill="none" stroke="white" strokeWidth="1.5" />
    <circle cx="200" cy="300" r="3" fill="white" />
    <rect x="80" y="0" width="240" height="80" fill="none" stroke="white" strokeWidth="1.5" />
    <rect x="140" y="0" width="120" height="30" fill="none" stroke="white" strokeWidth="1" />
    <rect x="80" y="520" width="240" height="80" fill="none" stroke="white" strokeWidth="1.5" />
    <rect x="140" y="570" width="120" height="30" fill="none" stroke="white" strokeWidth="1" />
    <path d="M80 80 L0 120" stroke="white" strokeWidth="1" />
    <path d="M320 80 L400 120" stroke="white" strokeWidth="1" />
    <path d="M80 520 L0 480" stroke="white" strokeWidth="1" />
    <path d="M320 520 L400 480" stroke="white" strokeWidth="1" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════
   MAIN LOGIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorVis, setErrorVis] = useState(false);
  const [modeTrans, setModeTrans] = useState(false);

  // ★ FIX 1: Destructure currentUser and authLoading
  const { currentUser, authLoading, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  // ★ FIX 2: Auto-navigate when user becomes authenticated
  // This handles BOTH: 
  //   - User returning from Google redirect sign-in
  //   - User already logged in visiting /login
  useEffect(() => {
    if (!authLoading && currentUser) {
      navigate('/profile', { replace: true });
    }
  }, [currentUser, authLoading, navigate]);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setErrorVis(true), 10); return () => clearTimeout(t); }
    else setErrorVis(false);
  }, [error]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else {
        if (!displayName.trim()) { setError('Display name is required'); setLoading(false); return; }
        await register(email, password, displayName.trim());
      }
      // Navigation is now handled by the useEffect above!
    } catch (err) {
      const errors = {
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/email-already-in-use': 'Email already registered',
        'auth/weak-password': 'Password must be at least 6 characters',
        'auth/invalid-email': 'Invalid email address',
        'auth/invalid-credential': 'Invalid email or password',
      };
      setError(errors[err.code] || err.message);
    }
    setLoading(false);
  }, [isLogin, email, password, displayName, login, register]);

  // ★ FIX 3: Updated Google Handler
  const handleGoogle = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle(); 
      // For popup flow: user is signed in, the useEffect above will navigate.
      // For redirect flow: page navigates away to Google. When it returns, 
      // the useEffect above will detect the user and navigate.
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User closed the popup themselves, don't show a scary error
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    }
    setLoading(false);
  }, [loginWithGoogle]);

  const toggleMode = useCallback(() => {
    setModeTrans(true);
    setError('');
    setTimeout(() => { setIsLogin(p => !p); setModeTrans(false); }, 250);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#05070a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <SEO
        title="Login to Your Account | ZOKASCORE"
        description="Securely log in to your ZOKASCORE account to access premium football predictions, track your leaderboard progress, and manage your gaming profile here."
        keywords="login, ZOKASCORE account, user login, secure access, member login"
        path="/login"
        robots="noindex,nofollow"
      />

      {/* ── Background Decorations ── */}
      <PitchDecoration />

      {/* Green glow top-left */}
      <div style={{
        position: 'absolute', top: '-25%', left: '-10%',
        width: '70%', height: '65%',
        background: 'radial-gradient(ellipse, rgba(16,185,129,.06) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      {/* Blue glow bottom-right */}
      <div style={{
        position: 'absolute', bottom: '-15%', right: '-10%',
        width: '60%', height: '55%',
        background: 'radial-gradient(ellipse, rgba(59,130,246,.04) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      {/* Subtle green accent glow behind card */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
        width: '120%', height: '60%',
        background: 'radial-gradient(ellipse, rgba(16,185,129,.035) 0%, transparent 55%)',
        pointerEvents: 'none',
      }} />

      {/* ── Main Card ── */}
      <div
        className="auth-pop auth-glow"
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#0a0d14',
          border: '1.5px solid rgba(16,185,129,.08)',
          borderRadius: 24,
          padding: '40px 28px 32px',
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 24px 64px rgba(0,0,0,.35), 0 0 80px rgba(16,185,129,.03)',
          backdropFilter: 'blur(16px)',
          animation: 'auth_borderGlow 4s ease-in-out infinite, auth_pop .45s cubic-bezier(.22,1,.36,1) both',
          overflow: 'hidden',
        }}
      >
        {/* Shine effect on card */}
        <div style={{
          position: 'absolute', top: 0, left: '-100%', width: '50%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.02), transparent)',
          animation: 'auth_shine 6s ease-in-out 2s infinite',
          pointerEvents: 'none',
        }} />

        {/* ── Header: Logo + Title ── */}
        <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
          {/* Logo */}
          <div
            className="auth-float"
            style={{
              width: 68, height: 68, borderRadius: 20,
              background: 'linear-gradient(145deg, #10b981 0%, #059669 40%, #047857 100%)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              boxShadow: '0 8px 28px rgba(16,185,129,.3), 0 2px 8px rgba(16,185,129,.2), inset 0 1px 0 rgba(255,255,255,.2)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <span style={{ color: '#05070a', fontWeight: 900, fontSize: '1.5rem', fontFamily: 'var(--font-display)', textShadow: '0 1px 0 rgba(255,255,255,.15)' }}>Z</span>
            {/* Glossy top half */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', background: 'linear-gradient(180deg, rgba(255,255,255,.22) 0%, transparent 100%)', borderRadius: '20px 20px 0 0', pointerEvents: 'none' }} />
          </div>

          {/* Title */}
          <h2 style={{
            margin: 0, fontSize: '1.7rem', fontWeight: 900,
            color: '#f8fafc', letterSpacing: '.01em',
            opacity: modeTrans ? 0 : 1,
            transform: modeTrans ? 'translateY(-8px)' : 'translateY(0)',
            transition: `opacity .2s, transform .2s`,
          }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{
            margin: '8px 0 0', fontSize: '.95rem', fontWeight: 600,
            color: '#64748b',
            opacity: modeTrans ? 0 : 1,
            transform: modeTrans ? 'translateY(-8px)' : 'translateY(0)',
            transition: `opacity .2s .05s, transform .2s .05s`,
          }}>
            {isLogin ? 'Sign in to track your predictions' : 'Join the prediction community'}
          </p>
        </div>

        {/* ── Error Message ── */}
        {error && (
          <div style={{
            padding: '16px 18px',
            background: 'rgba(239,68,68,.08)',
            border: '1.5px solid rgba(239,68,68,.2)',
            borderRadius: 14,
            color: '#ef4444',
            fontSize: '.92rem',
            fontWeight: 700,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: errorVis ? 1 : 0,
            transform: errorVis ? 'translateY(0)' : 'translateY(-10px)',
            transition: 'opacity .3s, transform .3s',
            animation: errorVis ? 'auth_slideErr .3s ease both' : 'none',
          }}>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{error}</span>
            <button
              onClick={() => setError('')}
              className="zoka-btn"
              style={{
                background: 'rgba(239,68,68,.1)', border: 'none',
                color: '#ef4444', padding: 6, display: 'flex',
                borderRadius: 8, width: 32, height: 32,
                alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── Google Button ── */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="zoka-btn"
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 14,
            background: 'rgba(255,255,255,.04)',
            border: '1.5px solid #151b26',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '.95rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginBottom: 24,
            opacity: loading ? .5 : 1,
            minHeight: 54,
            transition: 'all .18s cubic-bezier(.22,1,.36,1), opacity .2s',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* ── Divider ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1.5, background: '#151b26', borderRadius: 1 }} />
          <span style={{
            fontSize: '.82rem', fontWeight: 800,
            color: '#64748b', textTransform: 'uppercase',
            letterSpacing: '.1em',
          }}>
            or use email
          </span>
          <div style={{ flex: 1, height: 1.5, background: '#151b26', borderRadius: 1 }} />
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit}>
          {/* Display Name (register only) */}
          <div style={{
            overflow: 'hidden',
            maxHeight: isLogin ? '0px' : '140px',
            opacity: isLogin ? 0 : 1,
            transition: `max-height .45s ${EASE_OUT}, opacity .35s`,
          }}>
            <InputField
              icon={<User size={20} />}
              type="text"
              placeholder="Your display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              label="Display Name"
              autoFocus={!isLogin}
            />
          </div>

          {/* Email */}
          <InputField
            icon={<Mail size={20} />}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            label="Email"
            required
            autoFocus={isLogin}
          />

          {/* Password */}
          <InputField
            icon={<Lock size={20} />}
            type="password"
            placeholder="Min. 6 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            label="Password"
            required
            minLength={6}
          />

          {/* Password strength (register only) */}
          {!isLogin && <PasswordStrength password={password} />}

          {/* Forgot password (login only) */}
          {isLogin && (
            <div style={{
              display: 'flex', justifyContent: 'flex-end', marginBottom: 24,
              opacity: modeTrans ? 0 : 1, transition: 'opacity .2s',
            }}>
              <button
                type="button"
                className="zoka-btn"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#10b981', fontSize: '.9rem',
                  fontWeight: 700, padding: '4px 0',
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="zoka-btn"
            disabled={loading}
            style={{
              width: '100%',
              height: 58,
              fontSize: '1.05rem',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
              color: '#05070a',
              fontWeight: 900,
              border: 'none',
              boxShadow: '0 6px 24px rgba(16,185,129,.3), 0 2px 8px rgba(16,185,129,.15), inset 0 1px 0 rgba(255,255,255,.2)',
              letterSpacing: '.02em',
              marginTop: isLogin ? 0 : 8,
            }}
          >
            {/* Shine on button */}
            <div style={{
              position: 'absolute', top: 0, left: '-100%', width: '50%', height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.15), transparent)',
              animation: 'auth_shine 4s ease-in-out 1s infinite',
              pointerEvents: 'none',
            }} />
            <span style={{
              opacity: loading ? 0 : 1,
              transform: loading ? 'translateY(8px)' : 'translateY(0)',
              transition: 'opacity .2s, transform .2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              position: 'relative', zIndex: 1,
            }}>
              {isLogin ? 'Sign In' : 'Create Account'}
              <ArrowRight size={20} strokeWidth={2.5} />
            </span>
            {loading && (
              <span style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
              }}>
                <Loader size={26} style={{ animation: 'auth_spin .7s linear infinite' }} />
              </span>
            )}
          </button>
        </form>

        {/* ── Toggle Mode ── */}
        <div style={{
          textAlign: 'center', marginTop: 28,
          fontSize: '.95rem', fontWeight: 600, color: '#64748b',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={toggleMode}
            className="zoka-btn"
            style={{
              background: 'none', border: 'none', color: '#10b981',
              fontWeight: 900, cursor: 'pointer', fontSize: '.95rem',
              padding: '4px 0', position: 'relative',
            }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        {/* ── Security Footer ── */}
        <div style={{
          marginTop: 28, padding: '16px 18px',
          background: 'rgba(255,255,255,.02)',
          border: '1px solid #151b26',
          borderRadius: 14,
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(16,185,129,.06)',
            border: '1px solid rgba(16,185,129,.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Shield size={18} style={{ color: '#10b981' }} />
          </div>
          <div>
            <p style={{
              textAlign: 'left', margin: 0,
              fontSize: '.82rem', fontWeight: 700,
              color: '#64748b', lineHeight: 1.6,
              marginBottom: 4,
            }}>
              Secure authentication powered by Firebase
            </p>
            <p style={{
              textAlign: 'left', margin: 0,
              fontSize: '.78rem', fontWeight: 600,
              color: '#64748b', lineHeight: 1.5, opacity: .7,
            }}>
              Configure in <code style={{
                background: 'rgba(255,255,255,.06)', padding: '2px 8px',
                borderRadius: 6, fontSize: '.75rem', fontWeight: 700,
              }}>.env</code> to enable live mode.
            </p>
          </div>
        </div>

        {/* ── Football decoration at bottom ── */}
        <div style={{
          textAlign: 'center', marginTop: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: .25,
        }}>
          <div style={{ width: 40, height: 1, background: '#151b26' }} />
          <span style={{ fontSize: '.7rem' }}>⚽</span>
          <div style={{ width: 40, height: 1, background: '#151b26' }} />
        </div>
      </div>
    </div>
  );
}