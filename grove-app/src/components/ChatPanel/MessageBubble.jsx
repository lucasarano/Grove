import { useCallback, useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { GitFork, Robot, User, Copy, Check } from '@phosphor-icons/react';
import { useConversation } from '../../context/ConversationContext';
import { stripTopicBlockForDisplay } from '../../lib/topicMetadata';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy code'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: copied ? 'var(--color-accent)' : 'rgba(255,255,255,0.5)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-body)',
        fontWeight: 500,
        letterSpacing: '0.04em',
        padding: '0.25rem 0.5rem',
        transition: 'color 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
    >
      {copied ? <Check size={13} weight="bold" /> : <Copy size={13} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

const codeStyle = {
  'code[class*="language-"]': {
    fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
    fontSize: '0.875rem',
    lineHeight: 1.65,
    color: '#e2e8f0',
    background: 'none',
  },
  'pre[class*="language-"]': {
    background: 'none',
    margin: 0,
    padding: 0,
    overflow: 'auto',
  },
  comment: { color: '#64748b', fontStyle: 'italic' },
  prolog: { color: '#64748b' },
  doctype: { color: '#64748b' },
  cdata: { color: '#64748b' },
  punctuation: { color: '#94a3b8' },
  property: { color: '#7dd3fc' },
  tag: { color: '#f87171' },
  boolean: { color: '#fb923c' },
  number: { color: '#fb923c' },
  constant: { color: '#7dd3fc' },
  symbol: { color: '#34d399' },
  deleted: { color: '#f87171' },
  selector: { color: '#86efac' },
  'attr-name': { color: '#7dd3fc' },
  string: { color: '#86efac' },
  char: { color: '#86efac' },
  builtin: { color: '#c084fc' },
  inserted: { color: '#86efac' },
  operator: { color: '#94a3b8' },
  entity: { color: '#fbbf24', cursor: 'help' },
  url: { color: '#7dd3fc' },
  variable: { color: '#e2e8f0' },
  atrule: { color: '#c084fc' },
  'attr-value': { color: '#86efac' },
  function: { color: '#38bdf8' },
  'function-variable': { color: '#38bdf8' },
  keyword: { color: '#c084fc' },
  regex: { color: '#fbbf24' },
  important: { color: '#fbbf24', fontWeight: 'bold' },
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
};

function CodeBlock({ inline, className, children }) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  if (inline) {
    return (
      <code style={{
        fontFamily: "'Menlo', 'Monaco', monospace",
        fontSize: '0.875em',
        background: 'var(--color-bg-alt)',
        padding: '0.15em 0.4em',
        borderRadius: 2,
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
      }}>
        {children}
      </code>
    );
  }

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 0,
      margin: 'var(--space-2) 0',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.4rem 0.75rem',
        background: '#1e293b',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          fontSize: '0.7rem',
          fontFamily: "'Menlo', 'Monaco', monospace",
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.06em',
          textTransform: 'lowercase',
        }}>
          {lang || 'code'}
        </span>
        <CopyButton text={code} />
      </div>
      <div style={{ padding: '0.875rem 1rem', overflowX: 'auto' }}>
        {lang ? (
          <SyntaxHighlighter
            language={lang}
            style={codeStyle}
            PreTag="div"
            customStyle={{ margin: 0, background: 'none', padding: 0 }}
            codeTagProps={{ style: { fontFamily: "'Menlo', 'Monaco', monospace", fontSize: '0.875rem', lineHeight: 1.65 } }}
          >
            {code}
          </SyntaxHighlighter>
        ) : (
          <pre style={{ margin: 0, fontFamily: "'Menlo', 'Monaco', monospace", fontSize: '0.875rem', lineHeight: 1.65, color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

const MD_COMPONENTS = {
  code: CodeBlock,
};

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
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={MD_COMPONENTS}
          >
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
