import { useState, useEffect, useRef } from 'react';
import { Key, Trash } from '@phosphor-icons/react';
import { useConversation } from '../context/ConversationContext';
import { useAuth } from '../context/AuthContext';
import { guestHasAnyProviderKey } from '../lib/providerKeys';

function maskKey(key) {
  if (!key) return null;
  return `${key.slice(0, 10)}${'•'.repeat(6)}${key.slice(-4)}`;
}

/**
 * Shown automatically when a guest has no API keys stored.
 * Can also be opened from outside via the `open` prop (Header key button).
 */
export default function ApiKeyModal({ open, onClose }) {
  const { user } = useAuth();
  const isGuest = !user;
  const { anthropicApiKey, openaiApiKey, setProviderKeys } = useConversation();
  const [internalVisible, setInternalVisible] = useState(
    () => isGuest && !guestHasAnyProviderKey(),
  );
  const [draftAnthropic, setDraftAnthropic] = useState('');
  const [draftOpenai, setDraftOpenai] = useState('');
  const [confirmRemoveAnthropic, setConfirmRemoveAnthropic] = useState(false);
  const [confirmRemoveOpenai, setConfirmRemoveOpenai] = useState(false);
  const wasLoggedInRef = useRef(!!user);

  const visible = open || internalVisible;

  useEffect(() => {
    if (!isGuest) setInternalVisible(false);
  }, [isGuest]);

  useEffect(() => {
    const wasLoggedIn = wasLoggedInRef.current;
    wasLoggedInRef.current = !!user;
    if (wasLoggedIn && !user && !guestHasAnyProviderKey()) setInternalVisible(true);
  }, [user]);

  useEffect(() => {
    if (visible) {
      setDraftAnthropic('');
      setDraftOpenai('');
      setConfirmRemoveAnthropic(false);
      setConfirmRemoveOpenai(false);
    }
  }, [visible]);

  if (!visible) return null;

  function handleClose() {
    setInternalVisible(false);
    setConfirmRemoveAnthropic(false);
    setConfirmRemoveOpenai(false);
    onClose?.();
  }

  function handleSave() {
    setProviderKeys({
      anthropic: draftAnthropic.trim() || anthropicApiKey,
      openai: draftOpenai.trim() || openaiApiKey,
    });
    handleClose();
  }

  function handleRemoveAnthropic() {
    if (!confirmRemoveAnthropic) { setConfirmRemoveAnthropic(true); return; }
    setProviderKeys({ anthropic: '', openai: openaiApiKey });
    setConfirmRemoveAnthropic(false);
  }

  function handleRemoveOpenai() {
    if (!confirmRemoveOpenai) { setConfirmRemoveOpenai(true); return; }
    setProviderKeys({ anthropic: anthropicApiKey, openai: '' });
    setConfirmRemoveOpenai(false);
  }

  const hasStored = !!(anthropicApiKey || openaiApiKey);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,26,24,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          padding: '2rem',
          width: '100%',
          maxWidth: '480px',
          animation: 'apiModalIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
          <Key size={18} color="var(--color-accent)" />
          <h2 style={{ fontSize: '1.125rem', fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: 1 }}>
            API Keys
          </h2>
        </div>
        <p style={{
          fontSize: '0.875rem',
          fontWeight: 300,
          color: 'var(--color-text-secondary)',
          marginBottom: '1.75rem',
          lineHeight: 1.6,
        }}>
          Keys are stored locally in your browser and sent only to their respective provider.
        </p>

        {/* Anthropic */}
        <ProviderField
          id="api-key-anthropic"
          label="Anthropic"
          storedKey={anthropicApiKey}
          draft={draftAnthropic}
          placeholder="sk-ant-api03-…"
          autoFocus
          confirm={confirmRemoveAnthropic}
          onDraftChange={(v) => { setDraftAnthropic(v); setConfirmRemoveAnthropic(false); }}
          onRemove={handleRemoveAnthropic}
          onCancelRemove={() => setConfirmRemoveAnthropic(false)}
          style={{ marginBottom: '1.25rem' }}
        />

        {/* OpenAI */}
        <ProviderField
          id="api-key-openai"
          label="OpenAI"
          storedKey={openaiApiKey}
          draft={draftOpenai}
          placeholder="sk-…"
          confirm={confirmRemoveOpenai}
          onDraftChange={(v) => { setDraftOpenai(v); setConfirmRemoveOpenai(false); }}
          onRemove={handleRemoveOpenai}
          onCancelRemove={() => setConfirmRemoveOpenai(false)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ marginBottom: '1.75rem' }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {hasStored && (
            <button
              className="btn-ghost"
              onClick={handleClose}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
          )}
          <button
            id="api-key-save-btn"
            className="btn-primary"
            onClick={handleSave}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {hasStored ? 'Save' : 'Continue'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes apiModalIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function ProviderField({
  id, label, storedKey, draft, placeholder, autoFocus,
  confirm, onDraftChange, onRemove, onCancelRemove, onKeyDown, style,
}) {
  return (
    <div style={style}>
      {/* Label row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.375rem',
      }}>
        <span style={{
          fontSize: '0.6875rem',
          fontWeight: 500,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}>
          {label}
        </span>

        {storedKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              fontFamily: 'Menlo, Monaco, monospace',
              fontSize: '0.75rem',
              color: 'var(--color-text-tertiary)',
              letterSpacing: '0.03em',
            }}>
              {maskKey(storedKey)}
            </span>
            {confirm ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <button
                  onClick={onRemove}
                  style={{
                    background: 'var(--color-error)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.1875rem 0.5rem',
                    fontSize: '0.6875rem',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={onCancelRemove}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.1875rem 0.25rem',
                    fontSize: '0.6875rem',
                    fontFamily: 'var(--font-body)',
                    color: 'var(--color-text-secondary)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onRemove}
                title="Remove key"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.1875rem 0',
                  fontSize: '0.6875rem',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 400,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-tertiary)',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
              >
                <Trash size={11} />
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <input
        id={id}
        type="password"
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={storedKey ? 'Enter a new key to replace…' : placeholder}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border-strong)',
          padding: '0.625rem 0.875rem',
          fontFamily: 'var(--font-body)',
          fontSize: '0.9375rem',
          fontWeight: 300,
          color: 'var(--color-text-primary)',
          outline: 'none',
          letterSpacing: '0.05em',
        }}
      />
    </div>
  );
}
