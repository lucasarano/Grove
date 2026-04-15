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

// High-contrast palette — all token colors are bright enough to read
// clearly against the #0d1117 background.
const codeStyle = {
  'code[class*="language-"]': {
    fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
    fontSize: '0.875rem',
    lineHeight: 1.65,
    color: '#cdd9e5',   // base text: bright-ish blue-grey
    background: 'none',
  },
  'pre[class*="language-"]': {
    background: 'none',
    margin: 0,
    padding: 0,
    overflow: 'auto',
  },
  comment:     { color: '#768390', fontStyle: 'italic' },
  prolog:      { color: '#768390' },
  doctype:     { color: '#768390' },
  cdata:       { color: '#768390' },
  punctuation: { color: '#adbac7' },
  property:    { color: '#f47067' },   // bright coral-red
  tag:         { color: '#f47067' },
  boolean:     { color: '#f69d50' },   // bright amber
  number:      { color: '#f69d50' },
  constant:    { color: '#f69d50' },
  symbol:      { color: '#f69d50' },
  deleted:     { color: '#f47067' },
  selector:    { color: '#8ddb8c' },   // bright green
  'attr-name': { color: '#f69d50' },
  string:      { color: '#96d0ff' },   // bright sky blue (easier to read than green on dark)
  char:        { color: '#96d0ff' },
  builtin:     { color: '#6bc8d4' },   // bright teal
  inserted:    { color: '#8ddb8c' },
  operator:    { color: '#adbac7' },
  entity:      { color: '#f69d50', cursor: 'help' },
  url:         { color: '#6bc8d4' },
  variable:    { color: '#cdd9e5' },
  atrule:      { color: '#dcbdfb' },   // bright lavender
  'attr-value':{ color: '#96d0ff' },
  function:    { color: '#85c1f5' },   // bright calm blue
  'function-variable': { color: '#85c1f5' },
  keyword:     { color: '#dcbdfb' },
  regex:       { color: '#6bc8d4' },
  important:   { color: '#f47067', fontWeight: 'bold' },
  bold:        { fontWeight: 'bold' },
  italic:      { fontStyle: 'italic' },
};

// CodeBlock is used both for inline `code` and fenced ``` blocks.
// ReactMarkdown v8+ passes inline=true for backtick spans; for fenced blocks
// it renders <pre><code> and our custom `pre` wrapper hands the node straight
// to this component with inline=false.
function CodeBlock({ inline, className, children }) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  if (inline) {
    return (
      <code style={{
        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
        fontSize: '0.8em',
        background: 'rgba(148,163,184,0.12)',
        padding: '0.15em 0.4em',
        borderRadius: 4,
        color: 'var(--color-text-primary)',
        letterSpacing: '-0.01em',
      }}>
        {children}
      </code>
    );
  }

  return (
    <div style={{
      background: '#0d1117',
      borderRadius: 8,
      margin: '1rem 0',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.07)',
      color: '#cdd9e5',   // reset inherited prose color for all children
    }}>
      {/* toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.35rem 0.875rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{
          fontSize: '0.7rem',
          fontFamily: "'Menlo', 'Monaco', monospace",
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.06em',
        }}>
          {lang || 'code'}
        </span>
        <CopyButton text={code} />
      </div>

      {/* body */}
      <div className="code-block-body" style={{ padding: '1rem', overflowX: 'auto' }}>
        {lang ? (
          <SyntaxHighlighter
            language={lang}
            style={codeStyle}
            PreTag="div"
            customStyle={{ margin: 0, background: 'none', padding: 0 }}
            codeTagProps={{ style: {
              fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
              fontSize: '0.875rem',
              lineHeight: 1.7,
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#cdd9e5',   // unclassed tokens inherit this instead of dark prose color
            } }}
          >
            {code}
          </SyntaxHighlighter>
        ) : (
          <pre style={{ margin: 0, fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace", fontSize: '0.875rem', lineHeight: 1.7, color: '#abb2bf', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'none' }}>
            <code style={{ background: 'none', border: 'none', padding: 0 }}>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

// Custom `pre` strips the default <pre> wrapper ReactMarkdown adds around
// fenced code blocks — CodeBlock renders its own container div.
function PreBlock({ children }) {
  // Unwrap the single <code> child so CodeBlock receives inline=false.
  const child = Array.isArray(children) ? children[0] : children;
  if (child?.type === CodeBlock || child?.props?.className?.startsWith('language-')) {
    return <>{children}</>;
  }
  // Fallback: render as a plain pre for any other pre-wrapped content.
  return (
    <pre style={{
      margin: '1rem 0',
      padding: '1rem',
      background: '#0d1117',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.07)',
      overflowX: 'auto',
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: '0.875rem',
      lineHeight: 1.7,
      color: '#cbd5e1',
    }}>
      {children}
    </pre>
  );
}

const MD_COMPONENTS = {
  pre: PreBlock,
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

function makeMarkElement(text, branchId, onClick) {
  const mark = document.createElement('mark');
  mark.textContent = text;
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
  return mark;
}

/**
 * Find the first occurrence of `searchText` across the flattened text content
 * under `root` (skipping code/pre nodes) and wrap the matching portion(s) with
 * <mark> elements.  Works even when the selection spans multiple inline elements
 * such as <strong>, <em>, <a>, <h1>, etc.
 *
 * When the match sits entirely in one text node, a single <mark> is inserted.
 * When it spans multiple text nodes (e.g. bold + regular text), a <mark> is
 * inserted around the relevant fragment of each participating text node so the
 * whole run is visually highlighted and each fragment is clickable.
 *
 * Normalises whitespace in the search so that newlines inserted by the browser's
 * selection algorithm between block elements (e.g. paragraphs) are treated as
 * spaces and still match the DOM text content.
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

  const textNodes = [];
  let cur;
  while ((cur = walker.nextNode())) textNodes.push(cur);
  if (!textNodes.length) return;

  // Build a concatenated view of all visible text to locate the match.
  // Normalize whitespace so selections that span block boundaries (where the
  // browser adds \n) still match the DOM's plain text content.
  const combined = textNodes.map((n) => n.nodeValue).join('');
  const normalizedCombined = combined.replace(/\s+/g, ' ');
  const normalizedSearch = searchText.replace(/\s+/g, ' ').trim();

  const idx = normalizedCombined.indexOf(normalizedSearch);
  if (idx === -1) return;

  const endIdx = idx + normalizedSearch.length;

  // Map the match position back to individual text nodes.
  let pos = 0;
  const toWrap = [];
  for (const tn of textNodes) {
    const len = tn.nodeValue.length;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    if (nodeEnd > idx && nodeStart < endIdx) {
      toWrap.push({
        node: tn,
        start: Math.max(0, idx - nodeStart),
        end: Math.min(len, endIdx - nodeStart),
      });
    }
    pos += len;
    if (pos >= endIdx) break;
  }

  if (!toWrap.length) return;

  // Process in reverse order so earlier insertions don't shift later offsets.
  for (let i = toWrap.length - 1; i >= 0; i--) {
    const { node, start, end } = toWrap[i];
    const before = node.nodeValue.slice(0, start);
    const matched = node.nodeValue.slice(start, end);
    const after = node.nodeValue.slice(end);
    if (!matched) continue;

    const mark = makeMarkElement(matched, branchId, onClick);
    const parent = node.parentNode;
    if (!parent) continue;

    if (after) parent.insertBefore(document.createTextNode(after), node);
    parent.insertBefore(mark, node);
    if (before) parent.insertBefore(document.createTextNode(before), node);
    parent.removeChild(node);
  }
}

// ─── SelectionBranchPopover ──────────────────────────────────────────

function SelectionBranchPopover({ selection, onBranch, onDismiss }) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef(null);
  const popoverRef = useRef(null);

  // Do NOT auto-focus — stealing focus drops the browser's text selection,
  // which the user may still want to read or copy.  They can click the input
  // to start typing their branch prompt.

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

  const excerptRowStyle = {
    fontSize: '0.75rem',
    fontWeight: 400,
    letterSpacing: '0.01em',
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
        <div style={excerptRowStyle}>
          <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>Branch from </span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{excerpt}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="branch-popover-input"
            placeholder="Dig Deeper..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9375rem',
              fontWeight: 400,
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

/**
 * onBranchNodeCreated – when set, branching from this bubble runs with
 *   preserveActiveLeaf=true and calls onBranchNodeCreated(newNodeId) so the
 *   split panel's leaf stays in sync without disturbing the main panel.
 * panelLeafId – the "current leaf" for the panel this bubble lives in
 *   (overrides the global activeLeafId for the isLeaf check).
 */
function MessageBubble({ node, isStreaming = false, streamingContent = '', onBranchNodeCreated = null, panelLeafId = null }) {
  const [hovered, setHovered] = useState(false);
  const [selectionPopover, setSelectionPopover] = useState(null);
  const messageRef = useRef(null);
  const branchButtonRef = useRef(null);
  const proseRef = useRef(null);

  const { branchFrom, branchAndSend, sendMessage, navigateToBranchFrom, switchToBranch, activeLeafId, nodes } = useConversation();

  const isAssistant = node.role === 'assistant';
  const raw = isStreaming ? streamingContent : node.content;
  const content = isAssistant ? stripTopicBlockForDisplay(raw) : raw;
  const markdownContent = normalizeLatexDelimiters(content);

  function handleBranch() {
    branchFrom(node.id);
  }

  const effectivePanelLeafId = panelLeafId ?? activeLeafId;
  const shouldShowBranch = isAssistant && hovered && !isStreaming && node.id !== effectivePanelLeafId && !selectionPopover;

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
    const existingMarks = prose.querySelectorAll('mark[data-branch-id]');

    // Nothing to do — skip entirely to avoid any chance of disturbing the DOM.
    if (!branches.length && !existingMarks.length) return;

    function applyMarks() {
      // Re-query inside the deferred callback so we work on the current DOM.
      const marks = prose.querySelectorAll('mark[data-branch-id]');

      // If the marks already match the expected branches exactly, skip all DOM
      // mutations.  This prevents the drag-selection anchor from being
      // invalidated by an unnecessary remove+re-add cycle during re-renders.
      const existingIds = new Set([...marks].map((m) => m.dataset.branchId));
      const expectedIds = new Set(branches.map((b) => b.id));
      const alreadyCorrect =
        existingIds.size === expectedIds.size &&
        [...expectedIds].every((id) => existingIds.has(id));
      if (alreadyCorrect) return;

      marks.forEach((m) => {
        m.parentNode?.replaceChild(document.createTextNode(m.textContent), m);
      });
      prose.normalize();

      if (!branches.length) return;

      for (const branch of branches) {
        wrapTextInElement(prose, branch.text, branch.id, () => {
          navigateRef.current(branch.childNodeId);
        });
      }
    }

    // If the user has an active selection inside this prose block, any DOM
    // mutation would silently drop it.  Defer one animation frame — by then
    // the branch action will have cleared the selection and we can safely wrap.
    let hasActiveSelectionHere = false;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      try { hasActiveSelectionHere = prose.contains(sel.getRangeAt(0).commonAncestorContainer); }
      catch { /* ignore stale range errors */ }
    }

    if (hasActiveSelectionHere) {
      const raf = requestAnimationFrame(applyMarks);
      return () => cancelAnimationFrame(raf);
    }

    applyMarks();
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
    const effectiveLeafId = panelLeafId ?? activeLeafId;
    const isLeaf = node.id === effectiveLeafId;

    const branchOpts = onBranchNodeCreated
      ? { preserveActiveLeaf: true, onNodeCreated: onBranchNodeCreated }
      : {};

    if (isLeaf) {
      const sendOpts = {
        selectionQuote: selectedText,
        selectionSourceNodeId: node.id,
      };
      if (onBranchNodeCreated) {
        sendOpts.fromNodeId = node.id;
        sendOpts.onNodeCreated = onBranchNodeCreated;
      }
      sendMessage(prompt, [], sendOpts);
    } else {
      branchAndSend(node.id, prompt, selectedText, null, branchOpts);
    }

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

        {/* Selection quote — clicking navigates back to the source assistant message */}
        {!isAssistant && node.selectionQuote && (
          <div
            onClick={node.selectionSourceNodeId ? () => switchToBranch(node.selectionSourceNodeId) : undefined}
            title={node.selectionSourceNodeId ? 'Click to go back to the highlighted message' : undefined}
            style={{
              borderLeft: '2px solid var(--color-accent-dim)',
              paddingLeft: '0.65rem',
              marginBottom: '0.5rem',
              color: 'var(--color-text-tertiary)',
              fontSize: '0.875rem',
              fontStyle: 'italic',
              lineHeight: 1.5,
              maxWidth: '680px',
              wordBreak: 'break-word',
              cursor: node.selectionSourceNodeId ? 'pointer' : 'default',
              transition: 'color 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!node.selectionSourceNodeId) return;
              e.currentTarget.style.color = 'var(--color-accent)';
              e.currentTarget.style.borderLeftColor = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              if (!node.selectionSourceNodeId) return;
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
              e.currentTarget.style.borderLeftColor = 'var(--color-accent-dim)';
            }}
          >
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
