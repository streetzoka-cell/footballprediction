import React, { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../utils/routes';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader, Shield, ShieldCheck, FileText, Zap } from 'lucide-react';
import SEO from '../components/SEO';
import { useToast } from '../core/ToastManager';

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
          <div key={i} className="pass-strength-bar flex-1" style={{ background: i < score ? activeColor : 'var(--bg-elevated)', boxShadow: i < score ? `0 0 8px ${activeColor}44` : 'none' }} />
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
      <div className={`login-input-wrap ${focused ? 'border-primary' : ''}`}>
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

// ★ Shared checkbox — native accent-color styling, zero new CSS required
const ConsentCheck = memo(function ConsentCheck({ checked, onChange, children }) {
  return (
    <label className="flex-center gap-8 text-xs text-secondary" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--primary)', width: 16, height: 16, marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
      />
      <span style={{ lineHeight: 1.5 }}>{children}</span>
    </label>
  );
});

const PolicyLink = ({ to, children }) => (
  <Link to={to} target="_blank" rel="noopener noreferrer" className="text-primary font-bold" style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>
    {children}
  </Link>
);

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [modeTrans, setModeTrans] = useState(false);

  // ★ Consent gate — required before ANY signup path (email or Google)
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const consentOk = isLogin || (agreeTerms && agreePrivacy);

  // ★ Remember me — ON by default (matches browserLocalPersistence default)
  const [remember, setRemember] = useState(true);

  const { currentUser, authLoading, lastAccount, login, register, loginWithGoogle, resetPassword, forgetLastAccount } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!authLoading && currentUser) navigate(ROUTES.PROFILE, { replace: true });
  }, [currentUser, authLoading, navigate]);

  // ★ Pre-fill returning user's email (welcome-back memory)
  useEffect(() => {
    if (isLogin && lastAccount?.email) setEmail(prev => prev || lastAccount.email);
  }, [isLogin, lastAccount]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!isLogin && !consentOk) {
      toast.error('Please accept the Terms of Service and Privacy Policy first.');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password, remember);
        toast.success('Welcome back!');
      } else {
        if (!displayName.trim()) { toast.error('Display name is required'); setLoading(false); return; }
        await register(email, password, displayName.trim(), remember);
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
  }, [isLogin, consentOk, email, password, displayName, remember, login, register, toast]);

  const handleGoogle = useCallback(async () => {
    if (!isLogin && !consentOk) {
      toast.error('Please accept the Terms of Service and Privacy Policy first.');
      return;
    }
    setLoading(true);
    try {
      await loginWithGoogle(remember);
      toast.success('Signed in with Google!');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        toast.error('Google sign-in failed. Please try again.');
      }
    }
    setLoading(false);
  }, [isLogin, consentOk, remember, loginWithGoogle, toast]);

  // ★ Forgot password now actually works
  const handleForgot = useCallback(async () => {
    if (!email.trim()) {
      toast.error('Enter your email above first, then tap "Forgot password?".');
      return;
    }
    try {
      await resetPassword(email.trim());
      toast.success(`Password reset email sent to ${email.trim()}`);
    } catch (err) {
      toast.error(err?.code === 'auth/user-not-found'
        ? 'No account found with this email'
        : 'Could not send reset email. Please try again.');
    }
  }, [email, resetPassword, toast]);

  const handleNotYou = useCallback(() => {
    forgetLastAccount();
    setEmail('');
    setPassword('');
  }, [forgetLastAccount]);

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

  const lastIsAdmin = lastAccount && ['admin', 'staff', 'super_admin'].includes(lastAccount.role);

  return (
    <main className="flex-center" style={{ minHeight: '100vh', padding: 'var(--sp-16)', position: 'relative', overflow: 'hidden' }}>
      <SEO
        title="Sign In or Create Account | ZOKASCORE"
        description="Sign in to your ZOKASCORE account to manage your profile, track your prediction progress, view leaderboard rankings, and access your personalized football experience."
        keywords="ZOKASCORE login, sign in, football account, prediction account, user login"
        robots="noindex,nofollow"
      />

      <div className="glass-card flex-col gap-20 login-card" style={{ opacity: modeTrans ? 0 : 1, transition: 'opacity 0.25s ease' }}>
        <div className="flex-col items-center gap-12">
          <div className="login-logo-box">
            <span className="font-extrabold text-inverse text-2xl">Z</span>
          </div>
          <h1 className="text-primary font-extrabold text-xl">{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="text-muted text-sm">{isLogin ? 'Sign in to track your predictions' : 'Join the prediction community'}</p>
        </div>

        {/* ★ Welcome-back chip — remembers the last user, admins included */}
        {isLogin && lastAccount?.email && (
          <div className="glass-card flex-between gap-12 p-12 w-full" style={{ background: 'rgba(var(--primary-rgb), 0.06)', borderColor: 'rgba(var(--primary-rgb), 0.25)' }}>
            <div className="flex-center gap-12" style={{ minWidth: 0 }}>
              <div className="nav-avatar" style={{ width: 36, height: 36, flexShrink: 0 }}>
                {(lastAccount.displayName || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-col gap-2" style={{ minWidth: 0 }}>
                <div className="font-bold text-sm flex-center gap-8" style={{ justifyContent: 'flex-start' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastAccount.displayName}</span>
                  {lastIsAdmin && <span className="badge badge-gold">ADMIN</span>}
                </div>
                <span className="text-muted text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastAccount.email}</span>
              </div>
            </div>
            <button onClick={handleNotYou} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>Not you?</button>
          </div>
        )}

        <button onClick={handleGoogle} disabled={loading || !consentOk} className="btn btn-secondary btn-lg w-full">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex-center gap-12">
          <div className="login-divider"></div>
          <span className="text-muted text-xs">or use email</span>
          <div className="login-divider"></div>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-16">
          {!isLogin && (
            <InputField icon={<User size={20} />} type="text" placeholder="Your display name" value={displayName} onChange={e => setDisplayName(e.target.value)} label="Display Name" autoFocus={!isLogin} />
          )}
          <InputField icon={<Mail size={20} />} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} label="Email" required autoFocus={isLogin && !lastAccount} />
          <InputField icon={<Lock size={20} />} type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} label="Password" required minLength={6} />
          {!isLogin && <PasswordStrength password={password} />}

          {isLogin && (
            <div className="flex-between">
              <ConsentCheck checked={remember} onChange={setRemember}>
                Remember me
              </ConsentCheck>
              <button type="button" onClick={handleForgot} className="text-muted text-xs hover:text-primary">Forgot password?</button>
            </div>
          )}

          {/* ★ CONSENT GATE — required reading before account creation */}
          {!isLogin && (
            <div className="glass-card flex-col gap-8 p-12" style={{ borderColor: consentOk ? 'rgba(var(--primary-rgb), 0.3)' : 'var(--border)' }}>
              <div className="flex-center gap-8">
                <ShieldCheck size={14} className="text-primary" />
                <span className="font-bold text-xs text-secondary">Before you continue</span>
              </div>
              <ConsentCheck checked={agreeTerms} onChange={setAgreeTerms}>
                I have read and accept the <PolicyLink to={ROUTES.TERMS}>Terms of Service</PolicyLink>
              </ConsentCheck>
              <ConsentCheck checked={agreePrivacy} onChange={setAgreePrivacy}>
                I have read the <PolicyLink to={ROUTES.PRIVACY}>Privacy Policy</PolicyLink> and understand how my data is used
              </ConsentCheck>
            </div>
          )}

          {isLogin && (
            <p className="text-muted text-xs text-center">
              By signing in you agree to our <PolicyLink to={ROUTES.TERMS}>Terms</PolicyLink> and <PolicyLink to={ROUTES.PRIVACY}>Privacy Policy</PolicyLink>.
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || !consentOk}>
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