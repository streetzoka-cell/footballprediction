import React, { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader, Shield, X, Zap } from 'lucide-react';
import SEO from '../components/SEO';
import { useToast } from '../core/ToastManager';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

// ─── Memoized Sub-components ───

const PasswordStrength = memo(function PasswordStrength({ password }) {
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
    <div className="auth-strength-meter">
      <div className="auth-strength-bars">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className={`auth-bar ${i < score ? 'active' : ''}`} style={{ background: i < score ? activeColor : 'transparent', boxShadow: i < score ? `0 0 8px ${activeColor}44` : 'none' }} />
        ))}
      </div>
      <div className="auth-strength-info">
        <span style={{ color: activeColor }}>{labels[Math.max(0, score - 1)]}</span>
        {password.length < 6 && <span>6+ characters required</span>}
      </div>
    </div>
  );
});

const InputField = memo(function InputField({ icon, type, placeholder, value, onChange, required, minLength, autoFocus, label }) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="auth-input-group">
      {label && <label className={`auth-label ${focused ? 'focused' : ''}`}>{label}</label>}
      <div className="auth-input-wrap">
        <div className={`auth-input-icon ${focused ? 'focused' : ''}`}>{icon}</div>
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
          className={`auth-input ${focused ? 'focused' : ''}`}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPass(p => !p)} className="auth-pass-toggle" aria-label="Toggle password visibility">
            {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
    </div>
  );
});

const PitchDecoration = memo(function PitchDecoration() {
  return (
    <svg width="100%" height="100%" className="auth-pitch-svg" preserveAspectRatio="none" viewBox="0 0 400 600">
      <rect x="0" y="0" width="400" height="600" fill="none" stroke="white" strokeWidth="2" />
      <line x1="200" y1="0" x2="200" y2="600" stroke="white" strokeWidth="1.5" />
      <circle cx="200" cy="300" r="60" fill="none" stroke="white" strokeWidth="1.5" />
      <circle cx="200" cy="300" r="3" fill="white" />
      <rect x="80" y="0" width="240" height="80" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="140" y="0" width="120" height="30" fill="none" stroke="white" strokeWidth="1" />
      <rect x="80" y="520" width="240" height="80" fill="none" stroke="white" strokeWidth="1.5" />
      <rect x="140" y="570" width="120" height="30" fill="none" stroke="white" strokeWidth="1" />
    </svg>
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
    if (!authLoading && currentUser) {
      navigate('/profile', { replace: true });
    }
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
      <div className="auth-loading-screen">
        <Loader size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="auth-page-wrap">
      <SEO
        title="Sign In to Your ZOKASCORE Account"
        description="Sign in to your ZOKASCORE account to manage your profile, track your prediction progress, view leaderboard rankings, and access your personalized football experience."
        keywords="ZOKASCORE login, sign in, football account, prediction account, user login"
        robots="noindex,nofollow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Login", path: "/login" }]}
      />
      
      <PitchDecoration />
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />
      <div className="auth-glow auth-glow-3" />

      <div className="auth-card">
        <div className="auth-shine-overlay" />

        <div className="auth-header">
          <div className="auth-logo-box">
            <span>Z</span>
            <div className="auth-logo-shine" />
          </div>

          <h2 className={`auth-title ${modeTrans ? 'transitioning' : ''}`}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className={`auth-subtitle ${modeTrans ? 'transitioning' : ''}`}>
            {isLogin ? 'Sign in to track your predictions' : 'Join the prediction community'}
          </p>
        </div>

        <button onClick={handleGoogle} disabled={loading} className={`auth-google-btn ${loading ? 'loading' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider">
          <div className="auth-divider-line"></div>
          <span>or use email</span>
          <div className="auth-divider-line"></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={`auth-name-field ${isLogin ? 'collapsed' : ''}`}>
            <InputField icon={<User size={20} />} type="text" placeholder="Your display name" value={displayName} onChange={e => setDisplayName(e.target.value)} label="Display Name" autoFocus={!isLogin} />
          </div>

          <InputField icon={<Mail size={20} />} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} label="Email" required autoFocus={isLogin} />
          <InputField icon={<Lock size={20} />} type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} label="Password" required minLength={6} />

          {!isLogin && <PasswordStrength password={password} />}

          {isLogin && (
            <div className={`auth-forgot-pass ${modeTrans ? 'transitioning' : ''}`}>
              <button type="button">Forgot password?</button>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            <div className="auth-btn-shine"></div>
            <span className={loading ? 'hidden' : ''}>
              {isLogin ? 'Sign In' : 'Create Account'}
              <ArrowRight size={20} strokeWidth={2.5} />
            </span>
            {loading && <Loader size={26} className="auth-spinner" />}
          </button>
        </form>

        <div className="auth-toggle-mode">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={toggleMode}>{isLogin ? 'Sign Up' : 'Sign In'}</button>
        </div>

        <div className="auth-security-note">
          <div className="auth-security-icon"><Shield size={18} /></div>
          <div>
            <p>Secure authentication powered by Firebase</p>
            <p className="sub">Your data is encrypted and protected.</p>
          </div>
        </div>
      </div>
    </div>
  );
}