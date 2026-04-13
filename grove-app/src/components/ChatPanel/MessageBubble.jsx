import { useCallback, useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GitFork, Robot, User } from '@phosphor-icons/react';
import { useConversation } from '../../context/ConversationContext';
import { stripTopicBlockForDisplay } from '../../lib/topicMetadata';

function MessageBubble({ node, isStreaming = false, streamingContent = '' }) {
  const [hovered, setHovered] = useState(false);
  const messageRef = useRef(null);
  const branchButtonRef = useRef(null);
  const { branchFrom, activeLeafId } = useConversation();

  const isAssistant = node.role === 'assistant';
  const raw = isStreaming ? streamingContent : node.content;
  const content = isAssistant ? stripTopicBlockForDisplay(raw) : raw;

  function handleBranch() {
    branchFrom(node.id);
  }

  const shouldShowBranch = isAssistant && hovered && !isStreaming && node.id !== activeLeafId;

  const syncBranchButtonPosition = useCallback(() => {
    if (!messageRef.current || !branchButtonRef.current || !shouldShowBranch) return;

    const rect = messageRef.current.getBoundingClientRect();
    const fixedViewportTop = 112; // 7rem anchor from top of viewport
    const minTop = 24;
    const maxTop = Math.max(minTop, rect.height - 24);
    const desiredTop = fixedViewportTop - rect.top;
    const nextTop = Math.min(maxTop, Math.max(minTop, desiredTop));
    branchButtonRef.current.style.top = `${nextTop}px`;
  }, [shouldShowBranch]);

  useLayoutEffect(() => {
    if (!shouldShowBranch) return;
    syncBranchButtonPosition();
  }, [shouldShowBranch, syncBranchButtonPosition]);

  useEffect(() => {
    if (!shouldShowBranch) return undefined;

    syncBranchButtonPosition();

    let rafId = null;
    const handleScrollOrResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        syncBranchButtonPosition();
      });
    };

    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [shouldShowBranch, syncBranchButtonPosition]);

  return (
    <div
      ref={messageRef}
      id={`msg-${node.id}`}
      onMouseEnter={() => {
        setHovered(true);
        syncBranchButtonPosition();
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        opacity: isStreaming && !content ? 0.5 : 1,
        transition: 'background 0.15s ease',
        position: 'relative',
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          flexShrink: 0,
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isAssistant ? 'var(--color-accent)' : 'var(--color-bg-alt)',
          border: '1px solid',
          borderColor: isAssistant ? 'var(--color-accent)' : 'var(--color-border)',
          marginTop: '2px',
        }}
      >
        {isAssistant
          ? <Robot size={14} weight="regular" color="#FFFFFF" />
          : <User size={14} weight="regular" color="var(--color-text-secondary)" />
        }
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Role label */}
        <div style={{
          fontSize: '0.75rem',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: isAssistant ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          marginBottom: '0.375rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {isAssistant ? 'Assistant' : 'You'}
        </div>

        {/* Message text */}
        <div className={`prose ${isStreaming ? 'streaming-cursor' : ''}`} style={{ maxWidth: '680px' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || (isStreaming ? '' : '—')}
          </ReactMarkdown>
        </div>
      </div>

      {/* Branch only after a completed assistant (model) message — one branch point per turn */}
      {shouldShowBranch && (
        <button
          ref={branchButtonRef}
          onClick={handleBranch}
          title="Branch conversation from here"
          style={{
            position: 'absolute',
            top: '24px',
            right: 0,
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-accent-dim)',
            padding: '0.7rem 1.15rem',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '0.98rem',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            transition: 'color 0.15s ease, border-color 0.15s ease',
            boxShadow: '0 0 0 2px rgba(61, 90, 71, 0.12), 0 4px 12px rgba(26, 26, 24, 0.08)',
            zIndex: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-accent)';
            e.currentTarget.style.borderColor = 'var(--color-accent)';
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(61, 90, 71, 0.2), 0 6px 14px rgba(26, 26, 24, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)';
            e.currentTarget.style.borderColor = 'var(--color-accent-dim)';
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(61, 90, 71, 0.12), 0 4px 12px rgba(26, 26, 24, 0.08)';
          }}
        >
          <GitFork size={18} />
          Branch
        </button>
      )}

      {/* Active leaf indicator — shows on hover if this IS the leaf */}
      {hovered && !isStreaming && node.id === activeLeafId && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.3rem 0.65rem',
          fontFamily: 'var(--font-body)',
          fontSize: '0.75rem',
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
        }}>
          <GitFork size={12} />
          Current leaf
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
