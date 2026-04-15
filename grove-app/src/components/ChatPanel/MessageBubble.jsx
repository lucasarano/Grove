import { useCallback, useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { GitFork, Robot, User, Copy, Check } from '@phosphor-icons/react';
import { useConversation } from '../../context/ConversationContext';
import { stripTopicBlockForDisplay } from '../../lib/topicMetadata';

// ─── CopyButton ──────────────────────────────────────────────────────

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

// ─── CodeBlock ───────────────────────────────────────────────────────

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

// ─── Utilities ───────────────────────────────────────────────────────

function normalizeLatexDelimiters(markdown) {
  if (!markdown || typeof markdown !== 'string') return markdown;
  const segments = markdown.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment) => {
      if (segment.startsWith('```')) return segment;
      return segment
        .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expr) => `$$${expr}$$`)
        .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expr) => `$${expr}$`);
    })
    .join('');
}

/**
 * Find the first occurrence of `searchText` in the DOM text nodes under
 * `root`, wrap it with a <mark> element, and attach the onClick handler.
 * Skips text nodes inside <code> and <pre> blocks.
 */
function wrapTextInElement(root, searchText, branchId, onClick) {
  if (!root || !searchText) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent && (parent.closest('code') || parent.closest('pre'))) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let cur;
  while ((cur = walker.nextNode())) {
    const idx = cur.nodeValue.indexOf(searchText);
    if (idx === -1) continue;

    const before = cur.nodeValue.slice(0, idx);
    const after = cur.nodeValue.slice(idx + searchText.length);

    const mark = document.createElement('mark');
    mark.textContent = searchText;
    mark.dataset.branchId = branchId;
    mark.title = 'Click to go to this branch';
    Object.assign(mark.style, {
      background: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
      color: 'inherit',
      borderRadius: '2px',
      cursor: 'pointer',
      padding: '1px 0',
      borderBottom: '1.5px solid color-mix(in srgb, var(--color-accent) 70%, transparent)',
      transition: 'background 0.15s ease',
    });
    mark.addEventListener('mouseenter', () => {
      mark.style.background = 'color-mix(in srgb, var(--color-accent) 42%, transparent)';
    });
    mark.addEventListener('mouseleave', () => {
      mark.style.background = 'color-mix(in srgb, var(--color-accent) 28%, transparent)';
    });
    mark.addEventListener('click', onClick);

    const parent = cur.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), cur);
    parent.insertBefore(mark, cur);
    if (after) parent.insertBefore(document.createTextNode(after), cur);
    parent.removeChild(cur);
    return; // only first occurrence per branch
  }
}

// ─── SelectionBranchPopover ──────────────────────────────────────────

function SelectionBranchPopover({ selection, onBranch, onDismiss }) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef(null);
  const popoverRef = useRef(null);

  // Focus the input when the popover appears
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Dismiss on click-outside or Escape
  useEffect(() => {
    function onMouseDown(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onDismiss();
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);

  function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onBranch(trimmed, selection.text);
    setPrompt('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Position: centered above the selection, with a small gap
  const style = {
    position: 'fixed',
    top: selection.top - 8,
    left: selection.centerX,
    transform: 'translate(-50%, -100%)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'var(--color-surface, var(--color-bg))',
    border: '1px solid var(--color-accent-dim)',
    padding: '0.45rem 0.6rem',
    boxShadow: '0 4px 16px rgba(26, 26, 24, 0.18), 0 0 0 1px rgba(61,90,71,0.1)',
    minWidth: 320,
    maxWidth: 480,
  };

  const excerptStyle = {
    fontSize: '0.7rem',
    fontWeight: 400,
    color: 'var(--color-text-tertiary)',
    letterSpacing: '0.02em',
    marginBottom: '0.4rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 440,
  };

  const excerpt = selection.text.length > 60
    ? `"${selection.text.slice(0, 60)}…"`
    : `"${selection.text}"`;

  return createPortal(
    <div ref={popoverRef} style={style}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <div style={excerptStyle}>Branch from {excerpt}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter branch prompt…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              fontWeight: 300,
              color: 'var(--color-text-primary)',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            title="Branch from selection (Enter)"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: prompt.trim() ? 'var(--color-accent)' : 'var(--color-border)',
              border: 'none',
              padding: '0.3rem 0.65rem',
              cursor: prompt.trim() ? 'pointer' : 'default',
              fontFamily: 'var(--font-body)',
              fontSize: '0.78rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#FFFFFF',
              transition: 'background 0.15s ease',
            }}
          >
            <GitFork size={13} weight="bold" />
            Branch
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── MessageBubble ───────────────────────────────────────────────────

function MessageBubble({ node, isStreaming = false, streamingContent = '' }) {
  const [hovered, setHovered] = useState(false);
  const [selectionPopover, setSelectionPopover] = useState(null);
  const messageRef = useRef(null);
  const branchButtonRef = useRef(null);
  const proseRef = useRef(null);

  const { branchFrom, branchAndSend, navigateToBranchFrom, activeLeafId } = useConversation();

  const isAssistant = node.role === 'assistant';
  const raw = isStreaming ? streamingContent : node.content;
  const content = isAssistant ? stripTopicBlockForDisplay(raw) : raw;
  const markdownContent = normalizeLatexDelimiters(content);

  function handleBranch() {
    branchFrom(node.id);
  }

  const shouldShowBranch = isAssistant && hovered && !isStreaming && node.id !== activeLeafId && !selectionPopover;

  // ── Sticky branch-button position ────────────────────────────────

  const syncBranchButtonPosition = useCallback(() => {
    if (!messageRef.current || !branchButtonRef.current || !shouldShowBranch) return;

    const rect = messageRef.current.getBoundingClientRect();
    const fixedViewportTop = 112;
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

  // ── Selection-branch marks (DOM post-processing) ──────────────────
  // Runs after every render so React reconciliation can't orphan our marks.

  const navigateRef = useRef(navigateToBranchFrom);
  navigateRef.current = navigateToBranchFrom;

  useLayoutEffect(() => {
    const prose = proseRef.current;
    if (!prose) return;

    const branches = node.selectionBranches || [];

    // Remove any existing marks first so we don't double-wrap.
    prose.querySelectorAll('mark[data-branch-id]').forEach((m) => {
      m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
    });
    prose.normalize();

    if (!branches.length) return;

    for (const branch of branches) {
      wrapTextInElement(prose, branch.text, branch.id, () => {
        navigateRef.current(branch.childNodeId);
      });
    }
  });

  // ── Text selection → popover ──────────────────────────────────────

  function handleMouseUp() {
    if (!isAssistant || isStreaming) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    const range = sel.getRangeAt(0);
    if (!proseRef.current?.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    setSelectionPopover({
      top: rect.top,
      centerX: rect.left + rect.width / 2,
      text: selectedText,
    });
  }

  function handleBranchFromSelection(prompt, selectedText) {
    branchAndSend(node.id, prompt, selectedText);
    setSelectionPopover(null);
    window.getSelection()?.removeAllRanges();
  }

  function dismissPopover() {
    setSelectionPopover(null);
  }

  return (
    <div
      ref={messageRef}
      id={`msg-${node.id}`}
      onMouseEnter={() => {
        setHovered(true);
        syncBranchButtonPosition();
      }}
      onMouseLeave={() => setHovered(false)}
      onMouseUp={handleMouseUp}
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

        {/* Selection quote (shown above user prompts branched from a highlight) */}
        {!isAssistant && node.selectionQuote && (
          <div style={{
            borderLeft: '2px solid var(--color-accent-dim)',
            paddingLeft: '0.65rem',
            marginBottom: '0.5rem',
            color: 'var(--color-text-tertiary)',
            fontSize: '0.875rem',
            fontStyle: 'italic',
            lineHeight: 1.5,
            maxWidth: '680px',
            wordBreak: 'break-word',
          }}>
            &ldquo;{node.selectionQuote}&rdquo;
          </div>
        )}

        {/* Message text */}
        <div
          ref={proseRef}
          className={`prose ${isStreaming ? 'streaming-cursor' : ''}`}
          style={{ maxWidth: '680px' }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
            components={MD_COMPONENTS}
          >
            {markdownContent || (isStreaming ? '' : '—')}
          </ReactMarkdown>
        </div>
      </div>

      {/* Hover branch button — shown on non-leaf assistant messages */}
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

      {/* Active leaf indicator */}
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

      {/* Selection-branch popover (portal to document.body) */}
      {selectionPopover && (
        <SelectionBranchPopover
          selection={selectionPopover}
          onBranch={handleBranchFromSelection}
          onDismiss={dismissPopover}
        />
      )}
    </div>
  );
}

export default memo(MessageBubble);
