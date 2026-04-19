import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { useConversation } from '../../context/ConversationContext';

// ─── MessageList ──────────────────────────────────────────────────────

const NEAR_BOTTOM_PX = 80;

export default function MessageList({ items, onBranchNodeCreated = null, panelLeafId = null }) {
  const { streamingNodeId, streamingContent } = useConversation();
  const listRef = useRef(null);
  const prevLengthRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const newItem = items.length > prevLengthRef.current;
    prevLengthRef.current = items.length;

    const el = listRef.current;
    if (!el || items.length === 0) return;

    const scrollToBottom = () => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    };

    if (newItem) {
      scrollToBottom();
      stickToBottomRef.current = true;
      return;
    }

    const lastRowIsStreamingRow = items[items.length - 1]?.id === streamingNodeId;
    if (streamingNodeId && lastRowIsStreamingRow && stickToBottomRef.current) {
      scrollToBottom();
    }
  }, [items, streamingNodeId, streamingContent]);

  if (items.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-8)',
        userSelect: 'none',
      }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
          fontWeight: 400,
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
          lineHeight: 1.2,
        }}>
          Start a conversation.
        </p>
        <p style={{
          fontSize: '0.9375rem',
          fontWeight: 300,
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
          maxWidth: '360px',
          lineHeight: 1.6,
        }}>
          Hover an assistant reply to branch the conversation in a new direction — the original thread stays intact.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      onScroll={() => {
        const el = listRef.current;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const scrolledUp = scrollTop < lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        if (distanceFromBottom <= NEAR_BOTTOM_PX) {
          stickToBottomRef.current = true;
        } else if (scrolledUp) {
          stickToBottomRef.current = false;
        }
      }}
      style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
        contain: 'layout paint',
        overscrollBehavior: 'contain',
        padding: '0 var(--space-4)',
      }}
    >
      {items.map((node) => {
        const isStreaming = node.id === streamingNodeId;
        return (
          <MessageBubble
            key={node.id}
            node={node}
            isStreaming={isStreaming}
            streamingContent={isStreaming ? streamingContent : ''}
            onBranchNodeCreated={onBranchNodeCreated}
            panelLeafId={panelLeafId}
          />
        );
      })}
    </div>
  );
}
