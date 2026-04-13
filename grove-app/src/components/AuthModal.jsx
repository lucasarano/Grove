import { useState, useEffect, useRef } from 'react';
import { X, GoogleLogo, EnvelopeSimple, Lock, User } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

const OVERLAY = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(26,26,24,0.55)',
  backdropFilter: 'blur(4px)',
  zIndex: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const PANEL = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  width: '100%',
  maxWidth: '420px',
  padding: '2.5rem',
  position: 'relative',
  boxShadow: '0 8px 40px rgba(26,26,24,0.12)',
};

const INPUT = {
  width: '100%',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  padding: '0.625rem 0.875rem 0.625rem 2.5rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.9375rem',
  fontWeight: 300,
  color: 'var(--color-text-primary)',
  outline: 'none',
  transition: 'border-color 0.15s ease',
  borderRadius: 0,
};

const INPUT_WRAP = { position: 'relative', marginBottom: '0.875rem' };

const ICON_STYLE = {
  position: 'absolute',
  left: '0.75rem',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--color-text-tertiary)',
  pointerEvents: 'none',
};

const DIVIDER = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  margin: '1.25rem 0',
  color: 'var(--color-text-tertiary)',
  fontSize: '0.8125rem',
  fontWeight: 400,
};

const LINE = { flex: 1, height: '1px', background: 'var(--color-border)' };

const ERROR_BOX = {
  background: 'rgba(139,58,58,0.08)',
  border: '1px solid rgba(139,58,58,0.25)',
  color: 'var(--color-error)',
  padding: '0.625rem 0.875rem',
  fontSize: '0.875rem',
  marginBottom: '1rem',
};

export default function AuthModal({ open, onClose, defaultMode = 'signup' }) {
  const { signUpWithEmail, signInWithEmail, signInWithGoogle } = useAuth();
  const [mode,       setMode]       = useState(defaultMode); // 'signup' | 'signin'
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setMode(defaultMode);
      setName('');
      setEmail('');
      setPassword('');
      setError('');
      setSubmitting(false);
    }
    wasOpenRef.current = open;
  }, [open, defaultMode]);

  if (!open) return null;

  function reset() {
    setName(''); setEmail(''); setPassword(''); setError('');
  }

  function switchMode(m) { setMode(m); reset(); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
      onClose();
    } catch (err) {
      setError(friendlyError(err.code || err.message));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err) {
      setError(friendlyError(err.code || err.message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={PANEL} onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button
          className="btn-icon"
          onClick={onClose}
          style={{ position: 'absolute', top: '1rem', right: '1rem' }}
        >
          <X size={18} />
        </button>

        {/* Heading */}
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.5rem', marginBottom: '0.375rem' }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', fontWeight: 300, marginBottom: '1.75rem' }}>
          {mode === 'signup'
            ? 'Sign up and get free credits for Haiku, Sonnet & GPT 5.2 Mini.'
            : 'Sign in to access your conversations and free credits.'}
        </p>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={submitting}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.625rem',
            background: 'transparent',
            border: '1px solid var(--color-border-strong)',
            padding: '0.625rem 1rem',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9375rem',
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            transition: 'border-color 0.15s ease, background 0.15s ease',
            borderRadius: 0,
            opacity: submitting ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <GoogleLogo size={18} weight="bold" />
          Continue with Google
        </button>

        <div style={DIVIDER}>
          <div style={LINE} />
          <span>or</span>
          <div style={LINE} />
        </div>

        {error && <div style={ERROR_BOX}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={INPUT_WRAP}>
              <User size={16} style={ICON_STYLE} />
              <input
                type="text"
                placeholder="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={INPUT}
                onFocus={(e) => { e.target.style.borderColor = 'var(--color-accent)'; }}
                onBlur={(e)  => { e.target.style.borderColor = 'var(--color-border)'; }}
              />
            </div>
          )}

          <div style={INPUT_WRAP}>
            <EnvelopeSimple size={16} style={ICON_STYLE} />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={INPUT}
              onFocus={(e) => { e.target.style.borderColor = 'var(--color-accent)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--color-border)'; }}
            />
          </div>

          <div style={INPUT_WRAP}>
            <Lock size={16} style={ICON_STYLE} />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={INPUT}
              onFocus={(e) => { e.target.style.borderColor = 'var(--color-accent)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--color-border)'; }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}
          >
            {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 300 }}>
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
          {' '}
          <button
            onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 500, padding: 0 }}
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use':   'This email is already registered. Try signing in.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/invalid-credential':     'Invalid email or password.',
    'auth/popup-closed-by-user':   'Google sign-in was cancelled.',
    'auth/network-request-failed': 'Network error — please try again.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
