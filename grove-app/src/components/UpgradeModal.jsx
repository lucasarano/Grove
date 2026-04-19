import { useState } from 'react';
import { X, Lightning, Infinity as InfinityIcon, Lock } from '@phosphor-icons/react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { FREE_TOKEN_LIMIT, PREMIUM_TOKEN_LIMIT } from '../context/AuthContext';

const OVERLAY = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(26,26,24,0.6)',
  backdropFilter: 'blur(4px)',
  zIndex: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const PANEL = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  width: '100%',
  maxWidth: '460px',
  position: 'relative',
  boxShadow: '0 8px 48px rgba(26,26,24,0.14)',
  overflow: 'hidden',
};

const FEATURE_ITEMS = [
  { icon: <InfinityIcon size={16} weight="bold" />, text: `Up to ${PREMIUM_TOKEN_LIMIT.toLocaleString()} Grove-credit tokens per month on Premium (${FREE_TOKEN_LIMIT.toLocaleString()} on free) — resets each calendar month` },
  { icon: <Lock size={16} weight="bold" />,     text: 'Claude Opus 4.5 — most powerful reasoning' },
  { icon: <Lock size={16} weight="bold" />,     text: 'GPT 5.4 — OpenAI\'s flagship model' },
  { icon: <Lightning size={16} weight="bold" />, text: 'All current and future premium models' },
];

export default function UpgradeModal({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  if (!open) return null;

  async function handleCheckout() {
    setError('');
    setLoading(true);
    try {
      const createSession = httpsCallable(functions, 'createCheckoutSession');
      const result = await createSession({ origin: window.location.origin });
      window.location.href = result.data.url;
    } catch (err) {
      const msg = err?.message || 'Something went wrong. Please try again.';
      if (msg.includes('already-exists') || msg.includes('already have')) {
        setError('You already have an active Premium subscription.');
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={PANEL} onClick={(e) => e.stopPropagation()}>

        {/* Accent header bar */}
        <div style={{
          background: 'var(--color-accent)',
          padding: '1.75rem 2rem 1.5rem',
          color: '#fff',
        }}>
          <button
            className="btn-icon"
            onClick={onClose}
            style={{ position: 'absolute', top: '1rem', right: '1rem', color: 'rgba(255,255,255,0.7)' }}
          >
            <X size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Lightning size={18} weight="fill" style={{ color: 'rgba(255,255,255,0.8)' }} />
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              opacity: 0.8,
            }}>
              Grove Premium
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '1.625rem',
              lineHeight: 1.2,
              margin: 0,
            }}>
              Unlock the full<br />model lineup
            </h2>

            <div style={{ textAlign: 'right', flexShrink: 0, paddingBottom: '0.125rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: 600, fontFamily: 'var(--font-body)', lineHeight: 1 }}>
                $4.99
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 300, opacity: 0.75, display: 'block', marginTop: '0.125rem' }}>
                / month
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.75rem 2rem 2rem' }}>
          <p style={{
            fontSize: '0.9375rem',
            fontWeight: 300,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}>
            Remove all usage limits and get instant access to every model Grove supports, now and in the future.
          </p>

          {/* Feature list */}
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {FEATURE_ITEMS.map(({ icon, text }, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--color-accent)', flexShrink: 0 }}>
                  {icon}
                </span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 300, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                  {text}
                </span>
              </li>
            ))}
          </ul>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(139,58,58,0.08)',
              border: '1px solid rgba(139,58,58,0.25)',
              color: 'var(--color-error)',
              padding: '0.625rem 0.875rem',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              background: loading ? 'var(--color-accent-dim)' : 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              padding: '0.8125rem 1.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9375rem',
              fontWeight: 500,
              letterSpacing: '0.04em',
              transition: 'background 0.15s ease, opacity 0.15s ease',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1'; }}
          >
            {loading ? (
              <>Redirecting to checkout…</>
            ) : (
              <><Lightning size={16} weight="fill" /> Upgrade to Premium — $4.99/mo</>
            )}
          </button>

          <p style={{
            textAlign: 'center',
            marginTop: '0.875rem',
            fontSize: '0.8125rem',
            fontWeight: 300,
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.5,
          }}>
            Secure checkout via Stripe · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
