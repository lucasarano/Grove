import { useState, useRef, useEffect } from 'react';
import { Plus, CaretDown, GitBranch, UserCircle, SignOut, List, Lightning, Question } from '@phosphor-icons/react';
import { useConversation } from '../context/ConversationContext';
import { useAuth } from '../context/AuthContext';
import { MODELS } from '../services/claude';
import { hasAnthropicAccess, hasOpenaiAccess } from '../lib/providerKeys';

export default function Header({ onShowAuth, onToggleSidebar, onShowUpgrade, onShowPremiumManage, onShowTutorial }) {
  const { model, setModel, resetConversation, isStreaming, anthropicApiKey, openaiApiKey, keyMode } = useConversation();
  const { user, isLoggedIn, isPremium, logout } = useAuth();
  const [modelOpen,   setModelOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const modelMenuWrapRef = useRef(null);
  const userMenuWrapRef = useRef(null);

  useEffect(() => {
    if (!modelOpen && !userMenuOpen) return;
    function onPointerDown(e) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (modelOpen && modelMenuWrapRef.current && !modelMenuWrapRef.current.contains(t)) {
        setModelOpen(false);
      }
      if (userMenuOpen && userMenuWrapRef.current && !userMenuWrapRef.current.contains(t)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [modelOpen, userMenuOpen]);

  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0];
  const isBlocked = (m) => m.tier === 'blocked' && !isPremium;
  const hasAnthropic = hasAnthropicAccess({ isLoggedIn, anthropicApiKey, keyMode });
  const hasOpenai = hasOpenaiAccess({ isLoggedIn, openaiApiKey, keyMode });
  const missingProviderKey = (m) =>
    (m.provider === 'anthropic' && !hasAnthropic) || (m.provider === 'openai' && !hasOpenai);

  function handleModelSelect(m) {
    if (isBlocked(m) || missingProviderKey(m)) return;
    setModel(m.id);
    setModelOpen(false);
  }

  return (
    <header
      id="app-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-4)',
        background: 'rgba(244,241,236,0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}
    >
      {/* Left: sidebar toggle + logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          className="btn-icon"
          onClick={onToggleSidebar}
          title="Toggle conversations"
          style={{ padding: '0.375rem' }}
        >
          <List size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <GitBranch size={20} weight="regular" color="var(--color-accent)" />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.125rem',
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.01em',
          }}>
            Grove
          </span>
        </div>
      </div>

      {/* Controls — help + keys first so they stay visible when the row overflows (root has overflow:hidden) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        <button
          id="tutorial-btn"
          type="button"
          className="btn-icon"
          onClick={onShowTutorial}
          title="How Grove works"
          aria-label="How Grove works"
          style={{ flexShrink: 0 }}
        >
          <Question size={18} />
        </button>

        {/* Free credits prompt — shown when NOT logged in */}
        {!isLoggedIn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              fontSize: '0.8125rem',
              fontWeight: 300,
              color: 'var(--color-text-secondary)',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}>
              Sign up for free credits
            </span>
            <button
              id="sign-up-btn"
              className="btn-primary"
              onClick={onShowAuth}
              style={{ padding: '0.375rem 0.875rem', fontSize: '0.8125rem', letterSpacing: '0.05em' }}
            >
              Sign In
            </button>
          </div>
        )}

        {/* Upgrade CTA — logged in but not premium */}
        {isLoggedIn && !isPremium && (
          <button
            onClick={onShowUpgrade}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              background: 'transparent',
              border: '1px solid var(--color-accent-dim)',
              padding: '0.375rem 0.75rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
              transition: 'background 0.15s ease, border-color 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 8%, transparent)';
              e.currentTarget.style.borderColor = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--color-accent-dim)';
            }}
          >
            <Lightning size={14} weight="fill" />
            Upgrade
          </button>
        )}

        {/* Premium badge — opens billing / cancel flow */}
        {isLoggedIn && isPremium && (
          <button
            type="button"
            onClick={() => onShowPremiumManage?.()}
            title="Manage subscription"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
              border: '1px solid var(--color-accent-dim)',
              padding: '0.375rem 0.75rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
              userSelect: 'none',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 16%, transparent)';
              e.currentTarget.style.borderColor = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
              e.currentTarget.style.borderColor = 'var(--color-accent-dim)';
            }}
          >
            <Lightning size={14} weight="fill" />
            Premium
          </button>
        )}

        {/* Model selector */}
        <div ref={modelMenuWrapRef} style={{ position: 'relative' }}>
          <button
            id="model-selector-btn"
            onClick={() => setModelOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              padding: '0.375rem 0.75rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              transition: 'color 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)';
              e.currentTarget.style.borderColor = 'var(--color-border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          >
            <span>{currentModel.label}</span>
            <CaretDown size={12} />
          </button>

          {modelOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              minWidth: '220px',
              boxShadow: '0 4px 16px rgba(26,26,24,0.08)',
              zIndex: 200,
            }}>
              {MODELS.map((m) => {
                const noKey = missingProviderKey(m);
                const locked = isBlocked(m) || noKey;
                const selected = model === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { if (!locked) handleModelSelect(m); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      width: '100%',
                      textAlign: 'left',
                      background: selected ? 'var(--color-bg-alt)' : 'transparent',
                      border: 'none',
                      padding: '0.625rem 1rem',
                      cursor: locked ? 'default' : 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      fontWeight: selected ? 500 : 300,
                      color: locked
                        ? 'var(--color-text-tertiary)'
                        : selected
                          ? 'var(--color-accent)'
                          : 'var(--color-text-primary)',
                      transition: 'background 0.1s ease',
                      borderBottom: '1px solid var(--color-border)',
                      opacity: locked ? 0.55 : 1,
                    }}
                    onMouseEnter={(e) => { if (!locked && !selected) e.currentTarget.style.background = 'var(--color-bg)'; }}
                    onMouseLeave={(e) => { if (!locked && !selected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{m.label}</span>
                    {m.tier === 'blocked' && !isPremium && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setModelOpen(false); onShowUpgrade?.(); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          fontSize: '0.75rem', color: 'var(--color-accent)',
                          flexShrink: 0,
                          background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                          border: 'none',
                          cursor: 'pointer', padding: '0.125rem 0.375rem',
                          fontFamily: 'var(--font-body)', fontWeight: 500,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}
                      >
                        <Lightning size={11} weight="fill" />
                        Upgrade
                      </button>
                    )}
                    {m.tier === 'blocked' && isPremium && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-accent)', flexShrink: 0 }}>
                        <Lightning size={11} weight="fill" />
                        Premium
                      </span>
                    )}
                    {!isBlocked(m) && noKey && !isLoggedIn && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setModelOpen(false); onShowAuth?.(); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          fontSize: '0.75rem', color: 'var(--color-text-secondary)',
                          flexShrink: 0,
                          background: 'var(--color-bg-alt)',
                          border: 'none',
                          cursor: 'pointer', padding: '0.125rem 0.375rem',
                          fontFamily: 'var(--font-body)', fontWeight: 500,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}
                      >
                        Sign in
                      </button>
                    )}
                    {!isBlocked(m) && noKey && isLoggedIn && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                        No API Key
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* User menu — shown when logged in */}
        {isLoggedIn && (
          <div ref={userMenuWrapRef} style={{ position: 'relative' }}>
            <button
              className="btn-icon"
              onClick={() => setUserMenuOpen((o) => !o)}
              title={user?.displayName || user?.email}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.5rem' }}
            >
              <UserCircle size={22} color="var(--color-accent)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: 'var(--color-text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.displayName || user?.email?.split('@')[0]}
              </span>
              <CaretDown size={11} />
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                minWidth: '180px',
                boxShadow: '0 4px 16px rgba(26,26,24,0.08)',
                zIndex: 200,
              }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '0.125rem' }}>
                    {user?.displayName || 'Account'}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 300, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email}
                  </div>
                </div>
                <button
                  onClick={() => { logout(); setUserMenuOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.625rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    fontWeight: 300,
                    color: 'var(--color-text-primary)',
                    transition: 'background 0.1s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <SignOut size={15} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}

        {/* New Chat */}
        <button
          id="new-chat-btn"
          className="btn-primary"
          onClick={resetConversation}
          disabled={isStreaming}
          style={{
            padding: '0.375rem 0.75rem',
            gap: '0.375rem',
            fontSize: '0.8125rem',
          }}
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>
    </header>
  );
}
