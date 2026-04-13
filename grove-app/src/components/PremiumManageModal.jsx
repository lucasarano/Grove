import { useState } from 'react';
import { X, Lightning } from '@phosphor-icons/react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

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
  maxWidth: '420px',
  position: 'relative',
  boxShadow: '0 8px 48px rgba(26,26,24,0.14)',
  overflow: 'hidden',
};

export default function PremiumManageModal({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function openPortal() {
    setError('');
    setLoading(true);
    try {
      const createPortal = httpsCallable(functions, 'createCustomerPortalSession');
      const result = await createPortal({ origin: window.location.origin });
      window.location.href = result.data.url;
    } catch (err) {
      const code = err?.code;
      const msg = (err?.message || '').toLowerCase();
      if (code === 'functions/failed-precondition') {
        if (msg.includes('billing') || msg.includes('stripe')) {
          setError('We could not open billing for this account. Contact support if this persists.');
        } else {
          setError('No active Premium subscription was found.');
        }
      } else if (code === 'functions/unauthenticated') {
        setError('You must be signed in.');
      } else {
        setError(err?.message || 'Something went wrong. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={PANEL} onClick={(e) => e.stopPropagation()}>
        <div style={{
          background: 'var(--color-accent)',
          padding: '1.5rem 1.75rem 1.25rem',
          color: '#fff',
        }}>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{ position: 'absolute', top: '0.875rem', right: '0.875rem', color: 'rgba(255,255,255,0.7)' }}
          >
            <X size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <Lightning size={18} weight="fill" style={{ color: 'rgba(255,255,255,0.85)' }} />
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              opacity: 0.85,
            }}>
              Premium
            </span>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: '1.375rem',
            lineHeight: 1.25,
            margin: 0,
          }}>
            Manage your subscription
          </h2>
        </div>

        <div style={{ padding: '1.5rem 1.75rem 1.75rem' }}>
          <p style={{
            fontSize: '0.9375rem',
            fontWeight: 300,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            margin: '0 0 1.25rem',
          }}>
            Open Stripe's secure customer portal to cancel your plan, update your payment method, or view invoices.
          </p>

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

          <button
            type="button"
            onClick={openPortal}
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
              transition: 'opacity 0.15s ease',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1'; }}
          >
            {loading ? 'Opening billing portal…' : 'Open billing portal'}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              width: '100%',
              marginTop: '0.625rem',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              padding: '0.625rem 1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 400,
              color: 'var(--color-text-secondary)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
