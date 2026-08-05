import React, { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader, Shield, X, Zap } from 'lucide-react';
import SEO from '../components/SEO';
import { useToast } from '../core/ToastManager';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

const PasswordStrength = memo(function PasswordStrength({ password }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['var(--danger)', 'var(--warning)', 'var(--gold)', 'var(--primary)', 'var(--accent)'];
  const activeColor = colors[Math.max(0, score - 1)];

  return (
    <div className="flex-col gap-4 mt-8">
      <div className="flex gap-4">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 h-1 rounded-md" style={{ background: i < score ? activeColor : 'var(--bg-elevated)', boxShadow: i < score ? `0 0 8px ${activeColor}44` : 'none', transition: 'background 0.3s' }} />
        ))}
      </div>
      <div className="flex-between text-xs">
        <span style={{ color: activeColor, fontWeight: 700 }}>{labels[Math.max(0, score - 1)]}</span>
        {password.length < 6 && <span className="text-muted">6+ characters required</span>}
      </div>
    </div>
  );
});

const InputField = memo(function InputField({ icon, type, placeholder, value, onChange, required, minLength, autoFocus, label }) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="flex-col gap-4">
      {label && <label className={`text-xs font-bold ${focused ? 'text-primary' : 'text-muted'}`}>{label}</label>}
      <div className={`glass-card flex-center gap-12 ${focused ? 'border-primary' : ''}`} style={{ padding: '0 16px', height: '48px' }}>
        <div style={{ color: focused ? 'var(--primary)' : 'var(--text-muted)' }}>{icon}</div>
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
          className="flex-1 bg-transparent border-none outline-none text-primary text-sm"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--fs-sm)' }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPass(p => !p)} className="btn-icon-sm" aria-label="Toggle password visibility">
            {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
    </div>
  );
});

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [modeTrans, setModeTrans] = useState(false);

  const { currentUser, authLoading, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!authLoading && currentUser) navigate('/profile', { replace: true });
  }, [currentUser, authLoading, navigate]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        if (!displayName.trim()) { toast.error('Display name is required'); setLoading(false); return; }
        await register(email, password, displayName.trim());
        toast.success('Account created successfully!');
      }
    } catch (err) {
      const errors = {
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/email-already-in-use': 'Email already registered',
        'auth/weak-password': 'Password must be at least 6 characters',
        'auth/invalid-email': 'Invalid email address',
        'auth/invalid-credential': 'Invalid email or password',
        'auth/network-request-failed': 'Network error. Check connection.'
      };
      toast.error(errors[err.code] || err.message);
    }
    setLoading(false);
  }, [isLogin, email, password, displayName, login, register, toast]);

  const handleGoogle = useCallback(async () => {
    setLoading(true);
    try { 
      await loginWithGoogle(); 
      toast.success('Signed in with Google!');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        toast.error('Google sign-in failed. Please try again.');
      }
    }
    setLoading(false);
  }, [loginWithGoogle, toast]);

  const toggleMode = useCallback(() => {
    setModeTrans(true);
    setTimeout(() => { setIsLogin(p => !p); setModeTrans(false); }, 250);
  }, []);

  if (authLoading) {
    return (
      <main className="flex-center" style={{ minHeight: '100vh' }}>
        <Loader size={32} className="anim-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="flex-center" style={{ minHeight: '100vh', padding: 'var(--sp-16)', position: 'relative', overflow: 'hidden' }}>
      <SEO
        title="Sign In or Create Account | ZOKASCORE"
        description="Sign in to your ZOKASCORE account to manage your profile, track your prediction progress, view leaderboard rankings, and access your personalized football experience."
        keywords="ZOKASCORE login, sign in, football account, prediction account, user login"
        robots="noindex,nofollow"
      />
      
      <div className="glass-card flex-col gap-20 p-24" style={{ width: '100%', maxWidth: '420px', zIndex: 1, opacity: modeTrans ? 0 : 1, transition: 'opacity 0.25s ease' }}>
        <div className="flex-col items-center gap-12">
          <div className="glass-card flex-center" style={{ width: 64, height: 64, borderRadius: 'var(--r-16)', background: 'linear-gradient(135deg, var(--primary), var(--primary-dim))' }}>
            <span className="font-extrabold text-inverse" style={{ fontSize: 'var(--fs-2xl)' }}>Z</span>
          </div>
          <h1 className="text-primary font-extrabold text-xl">{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="text-muted text-sm">{isLogin ? 'Sign in to track your predictions' : 'Join the prediction community'}</p>
        </div>

        <button onClick={handleGoogle} disabled={loading} className="btn btn-secondary btn-lg w-full">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex-center gap-12">
          <div className="flex-1 h-px bg-border"></div>
          <span className="text-muted text-xs">or use email</span>
          <div className="flex-1 h-px bg-border"></div>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-16">
          {!isLogin && (
            <InputField icon={<User size={20} />} type="text" placeholder="Your display name" value={displayName} onChange={e => setDisplayName(e.target.value)} label="Display Name" autoFocus={!isLogin} />
          )}
          <InputField icon={<Mail size={20} />} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} label="Email" required autoFocus={isLogin} />
          <InputField icon={<Lock size={20} />} type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} label="Password" required minLength={6} />
          {!isLogin && <PasswordStrength password={password} />}

          {isLogin && (
            <div className="text-right">
              <button type="button" className="text-muted text-xs hover:text-primary">Forgot password?</button>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <Loader size={26} className="anim-spin" /> : <>{isLogin ? 'Sign In' : 'Create Account'} <ArrowRight size={20} /></>}
          </button>
        </form>

        <div className="text-center text-muted text-sm">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={toggleMode} className="text-primary font-bold">{isLogin ? 'Sign Up' : 'Sign In'}</button>
        </div>

        <div className="glass-card flex-center gap-12 p-12 text-muted text-xs">
          <Shield size={16} className="text-primary" />
          <div>
            <p className="font-bold text-secondary">Secure authentication powered by Firebase</p>
            <p>Your data is encrypted and protected.</p>
          </div>
        </div>
      </div>
    </main>
  );
}