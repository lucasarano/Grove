import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, Stop, Warning } from '@phosphor-icons/react';
import { useConversation } from '../../context/ConversationContext';
import { useAuth } from '../../context/AuthContext';

export default function InputBar() {
  const { sendMessage, isStreaming, abortStreaming, activeLeafId, nodes } = useConversation();
  const { isLoggedIn, tokensRemaining, isAtTokenLimit, TOKEN_LIMIT } = useAuth();
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }, [value]);

  // Focus on mount and when branch changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeLeafId]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || isAtTokenLimit) return;
    sendMessage(trimmed);
    setValue('');
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [value, isStreaming, sendMessage, isAtTokenLimit]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Show branch context hint
  const activeNode = activeLeafId && nodes[activeLeafId];
  const isBranchPoint = activeNode && activeNode.children && activeNode.children.length > 0;

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--color-border)',
      background: 'var(--color-bg)',
      padding: 'var(--space-3) var(--space-4)',
    }}>
      {/* Token limit reached banner */}
      {isLoggedIn && isAtTokenLimit && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: 'var(--space-2)',
          padding: '0.5rem 0.75rem',
          background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)',
          fontSize: '0.8125rem',
          fontWeight: 400,
          color: 'var(--color-error)',
        }}>
          <Warning size={15} weight="fill" style={{ flexShrink: 0 }} />
          {`You've reached your ${TOKEN_LIMIT.toLocaleString()} token limit for the free tier. Upgrade to continue chatting.`}
        </div>
      )}

      {/* Branch indicator */}
      {isBranchPoint && !isAtTokenLimit && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: 'var(--space-2)',
          padding: '0.375rem 0.75rem',
          background: 'var(--color-bg-alt)',
          border: '1px solid var(--color-border)',
          fontSize: '0.8125rem',
          fontWeight: 400,
          letterSpacing: '0.04em',
          color: 'var(--color-accent)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-block' }} />
          Branching from: <em style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
            {activeNode.branchLabel || activeNode.content.slice(0, 40)}…
          </em>
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 'var(--space-2)',
        background: 'var(--color-surface)',
        border: `1px solid ${isAtTokenLimit && isLoggedIn ? 'color-mix(in srgb, var(--color-error) 40%, transparent)' : 'var(--color-border-strong)'}`,
        padding: '0.75rem 1rem',
        transition: 'border-color 0.15s ease',
        opacity: isAtTokenLimit && isLoggedIn ? 0.6 : 1,
      }}
        onFocusCapture={(e) => { if (!isAtTokenLimit) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
        onBlurCapture={(e) => { if (!isAtTokenLimit) e.currentTarget.style.borderColor = 'var(--color-border-strong)'; }}
      >
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isAtTokenLimit && isLoggedIn
              ? 'Token limit reached…'
              : isStreaming
              ? 'Waiting for response…'
              : 'Message Grove…'
          }
          disabled={isStreaming || (isAtTokenLimit && isLoggedIn)}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            fontWeight: 300,
            color: 'var(--color-text-primary)',
            lineHeight: 1.6,
            maxHeight: '220px',
            overflow: 'auto',
          }}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            id="stop-btn"
            onClick={abortStreaming}
            style={{
              flexShrink: 0,
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-error)',
              border: 'none',
              cursor: 'pointer',
              color: '#FFFFFF',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            title="Stop generation"
          >
            <Stop size={14} weight="fill" />
          </button>
        ) : (
          <button
            id="send-btn"
            onClick={handleSend}
            disabled={!value.trim() || (isAtTokenLimit && isLoggedIn)}
            style={{
              flexShrink: 0,
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: (value.trim() && !(isAtTokenLimit && isLoggedIn)) ? 'var(--color-accent)' : 'var(--color-border)',
              border: 'none',
              cursor: (value.trim() && !(isAtTokenLimit && isLoggedIn)) ? 'pointer' : 'default',
              color: '#FFFFFF',
              transition: 'background 0.2s ease',
            }}
            title="Send message (Enter)"
          >
            <ArrowUp size={16} weight="bold" />
          </button>
        )}
      </div>

      {/* Bottom status row: keyboard hints + token counter */}
      <div style={{
        marginTop: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <p style={{
          margin: 0,
          fontSize: '0.75rem',
          fontWeight: 400,
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.02em',
        }}>
          Enter to send · Shift+Enter for newline · Hover an assistant reply to branch
        </p>

        {isLoggedIn && (
          <p style={{
            margin: 0,
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: isAtTokenLimit
              ? 'var(--color-error)'
              : tokensRemaining < TOKEN_LIMIT * 0.1
              ? 'var(--color-warning, #f59e0b)'
              : 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap',
          }}>
            {isAtTokenLimit
              ? '0 tokens remaining'
              : `${tokensRemaining.toLocaleString()} / ${TOKEN_LIMIT.toLocaleString()} tokens remaining`}
          </p>
        )}
      </div>
    </div>
  );
}
