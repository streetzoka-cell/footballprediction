import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader, Shield, X } from 'lucide-react';
import SEO from "../components/SEO";
/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION — PRODUCTION LOGIN
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('auth-pro-v1')) return;
  const s = document.createElement('style');
  s.id = 'auth-pro-v1';
  s.textContent = `
    @keyframes auth_fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes auth_pop{0%{transform:scale(.92);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
    @keyframes auth_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes auth_glow{0%,100%{box-shadow:0 0 20px rgba(0,230,118,.1)}50%{box-shadow:0 0 40px rgba(0,230,118,.2)}}
    .auth-enter{animation:auth_fadeUp .6s cubic-bezier(.22,1,.36,1) both}
    .auth-pop{animation:auth_pop .4s cubic-bezier(.22,1,.36,1) both}
    .zoka-btn{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .zoka-btn:hover{transform:translateY(-1px)}
    .zoka-btn:active{transform:translateY(0) scale(.98)}
  `;
  document.head.appendChild(s);
};

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/* ── Password Strength ───────────────────────────────────────── */
const PasswordStrength = ({ password }) => {
  if (!password) return null;
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#00e676'];
  const activeColor = colors[Math.max(0, score - 1)];

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', height: 3, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', gap: 3 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ flex: 1, height: '100%', borderRadius: 2, background: i < score ? activeColor : 'transparent', transition: `background 0.3s ${i * 60}ms` }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: '.72rem', fontWeight: 600, color: activeColor }}>{labels[Math.max(0, score - 1)]}</span>
        {password.length < 6 && <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>6+ characters required</span>}
      </div>
    </div>
  );
};

/* ── Input Field ─────────────────────────────────────────────── */
const InputField = ({ icon, type, placeholder, value, onChange, required, minLength, autoFocus, label }) => {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPassword = type === 'password';

  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--accent)' : 'var(--text-muted)', transition: 'color .2s', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>{icon}</div>
        <input
          type={isPassword ? (showPass ? 'text' : 'password') : type}
          placeholder={placeholder} value={value} onChange={onChange} required={required} minLength={minLength} autoFocus={autoFocus}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ width: '100%', padding: '12px 42px 12px 42px', borderRadius: 10, background: 'var(--bg-surface)', border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-primary)', fontSize: '.88rem', fontWeight: 500, outline: 'none', transition: 'border-color .2s, box-shadow .2s', boxShadow: focused ? '0 0 0 3px rgba(0,230,118,.1)' : 'none', boxSizing: 'border-box' }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPass(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--accent)' : 'var(--text-muted)', padding: 4, background: 'none', border: 'none', cursor: 'pointer', transition: 'color .2s', display: 'flex' }} aria-label="Toggle password visibility">
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────────────────────────────── */
export default function Login() {
  injectStyles();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorVis, setErrorVis] = useState(false);
  const [modeTrans, setModeTrans] = useState(false);

  const { login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

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
      navigate('/profile');
    } catch (err) {
      const errors = { 
        'auth/user-not-found': 'No account found with this email', 
        'auth/wrong-password': 'Incorrect password', 
        'auth/email-already-in-use': 'Email already registered', 
        'auth/weak-password': 'Password must be at least 6 characters', 
        'auth/invalid-email': 'Invalid email address', 
        'auth/invalid-credential': 'Invalid email or password' 
      };
      setError(errors[err.code] || err.message);
    }
    setLoading(false);
  }, [isLogin, email, password, displayName, login, register, navigate]);

  const handleGoogle = useCallback(async () => {
    setError('');
    setLoading(true);
    try { await loginWithGoogle(); navigate('/profile'); }
    catch (err) { if (err.code !== 'auth/popup-closed-by-user') setError('Google sign-in failed. Please try again.'); }
    setLoading(false);
  }, [loginWithGoogle, navigate]);

  const toggleMode = useCallback(() => {
    setModeTrans(true);
    setError('');
    setTimeout(() => { setIsLogin(p => !p); setModeTrans(false); }, 250);
  }, []);

    return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
      <SEO
        title="Sign In"
        description="Sign in to ZOKASCORE to track your football predictions, earn badges, and climb the leaderboard."
        keywords="login, sign in, ZOKASCORE account, football predictions"
        url="https://zokascore.com/login"
      />

      {/* Background Glow Effects */}

      <div style={{ position: 'absolute', top: '-20%', left: '10%', width: '40%', height: '60%', background: 'radial-gradient(ellipse, rgba(0,230,118,.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '10%', width: '30%', height: '50%', background: 'radial-gradient(ellipse, rgba(59,130,246,.03) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="auth-pop" style={{ 
        width: '100%', maxWidth: 420, background: 'var(--bg-card)', 
        border: '1px solid var(--border)', borderRadius: 20, 
        padding: '36px 32px', position: 'relative', zIndex: 1,
        boxShadow: '0 24px 60px rgba(0,0,0,.3)', backdropFilter: 'blur(12px)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, var(--accent), #69f0ae)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,230,118,.2)' }}>
            <span style={{ color: 'var(--bg-deep)', fontWeight: 900, fontSize: '1.2rem', fontFamily: 'var(--font-display)' }}>Z</span>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', opacity: modeTrans ? 0 : 1, transform: modeTrans ? 'translateY(-8px)' : 'translateY(0)', transition: `opacity .2s, transform .2s` }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '.88rem', color: 'var(--text-muted)', opacity: modeTrans ? 0 : 1, transform: modeTrans ? 'translateY(-8px)' : 'translateY(0)', transition: `opacity .2s .05s, transform .2s .05s` }}>
            {isLogin ? 'Sign in to track your predictions' : 'Join the prediction community'}
          </p>
        </div>

        {error && (
          <div style={{ 
            padding: '12px 16px', background: 'rgba(239,68,68,.08)', 
            border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, 
            color: '#ef4444', fontSize: '.84rem', marginBottom: 20, 
            display: 'flex', alignItems: 'center', gap: 10,
            opacity: errorVis ? 1 : 0, transform: errorVis ? 'translateY(0)' : 'translateY(-8px)', 
            transition: 'opacity .3s, transform .3s' 
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError('')} className="zoka-btn" style={{ background: 'none', border: 'none', color: '#ef4444', padding: 2, display: 'flex', opacity: .6 }} aria-label="Dismiss error"><X size={16} /></button>
          </div>
        )}

        <button onClick={handleGoogle} disabled={loading} className="zoka-btn" style={{ 
          width: '100%', padding: '12px', borderRadius: 10, 
          background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', 
          color: 'var(--text-primary)', fontWeight: 600, fontSize: '.88rem', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, 
          marginBottom: 20, opacity: loading ? .6 : 1 
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>or use email</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ overflow: 'hidden', maxHeight: isLogin ? '0px' : '120px', opacity: isLogin ? 0 : 1, transition: `max-height .4s ${EASE_OUT}, opacity .3s` }}>
            <InputField icon={<User size={18} />} type="text" placeholder="Your display name" value={displayName} onChange={e => setDisplayName(e.target.value)} label="Display Name" autoFocus={!isLogin} />
          </div>
          
          <InputField icon={<Mail size={18} />} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} label="Email" required autoFocus={isLogin} />
          <InputField icon={<Lock size={18} />} type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} label="Password" required minLength={6} />
          
          {!isLogin && <PasswordStrength password={password} />}

          {isLogin && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20, opacity: modeTrans ? 0 : 1, transition: 'opacity .2s' }}>
              <button type="button" className="zoka-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '.82rem', fontWeight: 600, padding: 0 }}>Forgot password?</button>
            </div>
          )}

          <button type="submit" className="zoka-btn" disabled={loading} style={{ 
            width: '100%', height: 48, fontSize: '.92rem', position: 'relative', overflow: 'hidden', 
            borderRadius: 10, background: 'var(--accent)', color: 'var(--bg-deep)', 
            fontWeight: 700, border: 'none', boxShadow: '0 4px 14px rgba(0,230,118,.2)' 
          }}>
            <span style={{ opacity: loading ? 0 : 1, transform: loading ? 'translateY(8px)' : 'translateY(0)', transition: 'opacity .2s, transform .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isLogin ? 'Sign In' : 'Create Account'} <ArrowRight size={18} />
            </span>
            {loading && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}><Loader size={22} style={{ animation: 'auth_spin .8s linear infinite' }} /></span>}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: '.84rem', color: 'var(--text-muted)' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={toggleMode} className="zoka-btn" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontSize: '.84rem', padding: 0 }}>
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        <div style={{ marginTop: 24, padding: '14px 16px', background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Shield size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <p style={{ textAlign: 'left', margin: 0, fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Secure authentication powered by Firebase. Configure in <code style={{ background: 'rgba(255,255,255,.06)', padding: '1px 5px', borderRadius: 4, fontSize: '.68rem' }}>.env</code> to enable live mode.
          </p>
        </div>
      </div>
    </div>
  );
}