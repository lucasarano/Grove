import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, GitBranch, GitFork, Robot, User, X } from '@phosphor-icons/react';

/* ─── Tree layout constants (mirrors TreeCanvas.jsx) ─────────────── */
const NODE_W = 164;
const NODE_H = 60;

/* ─── Split / compare colours (mirrors TreeCanvas.jsx) ──────────── */
const SPLIT_COLOR        = '#a03434';
const SPLIT_COLOR_BG     = 'rgba(160,52,52,0.05)';
const SPLIT_COLOR_BORDER = 'rgba(160,52,52,0.35)';

/* ─── Static mock tree data ──────────────────────────────────────── */
const MOCK_NODES = {
  a1:  { topicLabel: 'Machine learning basics',    turnNumber: 1 },
  a2a: { topicLabel: 'Neural networks deep dive',  turnNumber: 2 },
  a2b: { topicLabel: 'Practical Python example',   turnNumber: 2 },
  a3:  { topicLabel: 'Deep vs. shallow learning',  turnNumber: 3 },
};

// Positions pre-computed via the same algorithm used in TreeCanvas
// (NODE_W=164, NODE_H=60, GAP_X=16, GAP_Y=40)
const POSITIONS = {
  a1:  { x: 90,  y: 0   },
  a2a: { x: 0,   y: 100 },
  a2b: { x: 180, y: 100 },
  a3:  { x: 0,   y: 200 },
};

const CONNECTORS = [
  { from: 'a1', to: 'a2a' },
  { from: 'a1', to: 'a2b' },
  { from: 'a2a', to: 'a3' },
];

const TREE_W = 344;
const TREE_H = 260;

/* ─── Tutorial step definitions ───────────────────────────────────── */
const STEPS = [
  {
    eyebrow: 'Step 1 of 7',
    title: 'Welcome to Grove',
    body: 'Grove is an AI learning tool built around a simple idea: your process shouldn\'t disappear as a conversation grows.',
    visibleTurnIds: [],
    activeTurnId: null,
    pathTurnIds: [],
    showBranchHint: false,
    showType: 'tree',
  },
  {
    eyebrow: 'Step 2 of 7',
    title: 'Every exchange becomes a Turn',
    body: 'Ask a question and the AI responds. The active card is highlighted in green. The tree panel on the right tracks your conversation.',
    visibleTurnIds: ['a1'],
    activeTurnId: 'a1',
    pathTurnIds: ['a1'],
    showBranchHint: false,
    showType: 'tree',
  },
  {
    eyebrow: 'Step 3 of 7',
    title: 'Branch to explore another angle',
    body: 'Hover any AI response in the chat and Branch. This creates two paths from the same point without losing your conversation.',
    visibleTurnIds: ['a1', 'a2a', 'a2b'],
    activeTurnId: 'a1',
    pathTurnIds: ['a1'],
    showBranchHint: true,
    showType: 'tree',
  },
  {
    eyebrow: 'Step 4 of 7',
    title: 'Follow Path A as deep as you like',
    body: 'You chose to go deeper into path A. The highlighted path traces your full journey. You always have the option to rollback and branch into path B.',
    visibleTurnIds: ['a1', 'a2a', 'a2b', 'a3'],
    activeTurnId: 'a3',
    pathTurnIds: ['a1', 'a2a', 'a3'],
    showBranchHint: false,
    showType: 'tree',
  },
  {
    eyebrow: 'Step 5 of 7',
    title: 'Jump to Path B, nothing is lost',
    body: 'Click any card in the tree to switch paths instantly.\n\nAI will only have the context of the path you are in.',
    visibleTurnIds: ['a1', 'a2a', 'a2b', 'a3'],
    activeTurnId: 'a2b',
    pathTurnIds: ['a1', 'a2b'],
    showBranchHint: false,
    showType: 'tree',
  },
  {
    eyebrow: 'Step 6 of 7',
    title: 'Highlight text to branch',
    body: 'Select any text in a response and branch from it. Type a follow-up question without loosing the current path.',
    showBranchHint: false,
    showHighlightHint: true,
    showType: 'highlight',
  },
  {
    eyebrow: 'Step 7 of 7',
    title: 'Compare branches side by side',
    body: 'Drag any card from the Conversation Tree into the chat to compare both branches at the same time.',
    showBranchHint: false,
    showDragHint: true,
    showType: 'compare',
  },
];

/* ─── Orthogonal connector path ───────────────────────────────────── */
function connectorPath(fromId, toId) {
  const from = POSITIONS[fromId];
  const to = POSITIONS[toId];
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

/* ─── Single mock turn card ───────────────────────────────────────── */
function MockTurnCard({ turnId, isActive, isOnPath, isVisible, showBranchHint }) {
  const node = MOCK_NODES[turnId];
  const pos = POSITIONS[turnId];

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: NODE_W,
        height: NODE_H,
        boxSizing: 'border-box',
        background: isActive
          ? 'var(--color-accent)'
          : isOnPath
            ? 'var(--color-bg-alt)'
            : 'var(--color-surface)',
        border: '1px solid',
        borderColor: isActive
          ? 'var(--color-accent)'
          : isOnPath
            ? 'var(--color-border-strong)'
            : 'var(--color-border)',
        borderLeft: isOnPath && !isActive ? '3px solid var(--color-accent)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '6px 10px',
        gap: '3px',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'none' : 'translateY(6px) scale(0.97)',
        transition: 'opacity 0.3s ease, transform 0.3s ease, background 0.2s ease, border-color 0.2s ease',
        boxShadow: isActive ? '0 2px 12px rgba(61,90,71,0.18)' : 'none',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--color-text-tertiary)',
          lineHeight: 1.2,
        }}
      >
        Turn {node.turnNumber}
      </div>
      <div
        style={{
          fontSize: '0.6875rem',
          fontWeight: 400,
          lineHeight: 1.3,
          color: isActive ? '#fff' : 'var(--color-text-secondary)',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word',
        }}
      >
        {node.topicLabel}
      </div>

      {/* Branch button hint floats to the right of Turn 1 */}
      {showBranchHint && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: NODE_W + 10,
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-accent-dim)',
            padding: '0.45rem 0.8rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            boxShadow: '0 0 0 2px rgba(61,90,71,0.12), 0 4px 12px rgba(26,26,24,0.08)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            animation: 'tutorialPulse 2s ease-in-out infinite',
          }}
        >
          <GitFork size={13} />
          Branch
        </div>
      )}
    </div>
  );
}

/* ─── Static tree preview panel ───────────────────────────────────── */
function TreePreview({ step }) {
  const { visibleTurnIds, activeTurnId, pathTurnIds, showBranchHint } = step;
  const PADDING = 16;

  const isVisible = (id) => visibleTurnIds.includes(id);
  const isConnVisible = (from, to) => isVisible(from) && isVisible(to);
  const isConnActive = (from, to) => pathTurnIds.includes(from) && pathTurnIds.includes(to);

  const isEmpty = visibleTurnIds.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg-alt)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          flexShrink: 0,
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0 12px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-alt)',
        }}
      >
        <GitBranch size={13} color="var(--color-text-tertiary)" />
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Conversation Tree
        </span>
      </div>

      {/* Canvas */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          padding: `${PADDING}px`,
        }}
      >
        {/* Empty state */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            gap: '0.75rem',
            opacity: isEmpty ? 1 : 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: isEmpty ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>1</span>
          </div>
          <p
            style={{
              fontSize: '0.8rem',
              fontWeight: 300,
              lineHeight: 1.5,
              color: 'var(--color-text-tertiary)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            The conversation tree will appear here as you chat.
          </p>
        </div>

        {/* SVG connectors */}
        <svg
          style={{
            position: 'absolute',
            top: PADDING,
            left: PADDING,
            width: TREE_W,
            height: TREE_H,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
          width={TREE_W}
          height={TREE_H}
        >
          {CONNECTORS.map(({ from, to }) => {
            const visible = isConnVisible(from, to);
            const active = isConnActive(from, to);
            return (
              <path
                key={`${from}-${to}`}
                d={connectorPath(from, to)}
                fill="none"
                stroke={active ? 'var(--color-accent-dim)' : 'var(--color-border)'}
                strokeWidth={active ? 2.75 : 2}
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeMiterlimit={2}
                opacity={visible ? (active ? 0.9 : 0.5) : 0}
                style={{ transition: 'opacity 0.35s ease, stroke 0.2s ease' }}
              />
            );
          })}
        </svg>

        {/* Turn cards */}
        <div style={{ position: 'relative', width: TREE_W, height: TREE_H }}>
          {Object.keys(MOCK_NODES).map((id) => (
            <MockTurnCard
              key={id}
              turnId={id}
              isVisible={isVisible(id)}
              isActive={id === activeTurnId}
              isOnPath={pathTurnIds.includes(id)}
              showBranchHint={showBranchHint && id === 'a1'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Highlight-to-branch preview ────────────────────────────────── */
function MockHighlightPreview() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg-alt)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          flexShrink: 0,
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0 12px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-alt)',
        }}
      >
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Chat
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          padding: '18px 16px 14px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        {/* Branch popover */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-accent-dim)',
            padding: '0.45rem 0.6rem',
            boxShadow: '0 4px 16px rgba(26,26,24,0.18), 0 0 0 1px rgba(61,90,71,0.10)',
            animation: 'tutorialPulse 2s ease-in-out infinite',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              fontSize: '0.68rem',
              marginBottom: '5px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>Branch from </span>
            <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>&ldquo;learning from data and improving…&rdquo;</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>
              Dig deeper...
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: 'var(--color-accent)',
                padding: '0.22rem 0.55rem',
                fontSize: '0.63rem',
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#fff',
              }}
            >
              <GitFork size={10} weight="bold" />
              Branch
            </div>
          </div>
        </div>

        {/* Caret pointing down to the highlighted text */}
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--color-accent-dim)',
            marginLeft: '20px',
            marginBottom: '5px',
            flexShrink: 0,
          }}
        />

        {/* Assistant message with highlighted selection */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div
            style={{
              width: 22,
              height: 22,
              flexShrink: 0,
              background: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Robot size={11} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-accent)',
                marginBottom: '4px',
              }}
            >
              Assistant
            </div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.65,
              }}
            >
              Machine learning is a field of AI focused on{' '}
              <mark
                style={{
                  background: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
                  color: 'inherit',
                  borderRadius: '2px',
                  padding: '1px 0',
                  borderBottom: '1.5px solid color-mix(in srgb, var(--color-accent) 70%, transparent)',
                }}
              >
                learning from data and improving over time
              </mark>
              {' '}without being explicitly programmed.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Compare-branches preview ────────────────────────────────────── */
function MockMiniMessage({ role, text, isCompare }) {
  const isAssistant = role === 'assistant';
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
      <div
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          background: isAssistant
            ? isCompare ? SPLIT_COLOR : 'var(--color-accent)'
            : 'var(--color-bg-alt)',
          border: '1px solid',
          borderColor: isAssistant
            ? isCompare ? SPLIT_COLOR : 'var(--color-accent)'
            : 'var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isAssistant
          ? <Robot size={8} color="#fff" />
          : <User size={8} color="var(--color-text-secondary)" />}
      </div>
      <div
        style={{
          flex: 1,
          fontSize: '0.655rem',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.45,
          wordBreak: 'break-word',
          overflow: 'hidden',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function MockComparePreview() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
      }}
    >
      {/* Path A — active */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-alt)',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 10px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              background: 'var(--color-accent)',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '0.585rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            Path A · Active
          </span>
        </div>
        <div
          style={{
            flex: 1,
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
            overflow: 'hidden',
          }}
        >
          <MockMiniMessage role="user" text="What is machine learning?" />
          <MockMiniMessage role="assistant" text="Machine learning is a field of AI focused on learning from data and improving over time…" />
          <MockMiniMessage role="user" text="Tell me about neural networks" />
          <MockMiniMessage role="assistant" text="Neural networks are computational models loosely inspired by the structure of the brain…" />
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: '2px', background: `${SPLIT_COLOR}66`, flexShrink: 0 }} />

      {/* Path B — compare */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: SPLIT_COLOR_BG,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 10px',
            borderBottom: `1px solid ${SPLIT_COLOR_BORDER}`,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              background: SPLIT_COLOR,
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '0.585rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: SPLIT_COLOR,
              opacity: 0.85,
              whiteSpace: 'nowrap',
            }}
          >
            Path B · Compare
          </span>
        </div>
        <div
          style={{
            flex: 1,
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
            overflow: 'hidden',
          }}
        >
          <MockMiniMessage role="user" text="What is machine learning?" />
          <MockMiniMessage role="assistant" text="Machine learning is a field of AI focused on learning from data and improving over time…" isCompare />
          <MockMiniMessage role="user" text="Show me a Python example" />
          <MockMiniMessage role="assistant" text="Here's a simple example using scikit-learn: from sklearn.linear_model import…" isCompare />
        </div>
      </div>
    </div>
  );
}

/* ─── Main tutorial modal ─────────────────────────────────────────── */
export default function TutorialModal({ open, onClose }) {
  const [step, setStep] = useState(0);

  // Reset to first step on open
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setStep((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Escape') {
        onClose?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return createPortal(
    <>
      <style>{`
        @keyframes tutorialPulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(61,90,71,0.12), 0 4px 12px rgba(26,26,24,0.08); }
          50%       { box-shadow: 0 0 0 4px rgba(61,90,71,0.22), 0 6px 16px rgba(26,26,24,0.14); }
        }
        @keyframes tutorialIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tutorialFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(26, 26, 24, 0.55)',
          backdropFilter: 'blur(4px)',
          zIndex: 10050,
          animation: 'tutorialFadeIn 0.2s ease-out',
        }}
      />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10051,
          width: '860px',
          height: '600px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 64px rgba(26,26,24,0.22)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'tutorialIn 0.25s ease-out',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            flexShrink: 0,
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--space-6)',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-alt)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <GitBranch size={22} color="var(--color-accent)" />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 400,
                color: 'var(--color-text-primary)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              Grove
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close tutorial"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.375rem',
              color: 'var(--color-text-tertiary)',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: two columns */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* LEFT: step content */}
          <div
            style={{
              width: '320px',
              flexShrink: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: 'var(--space-6) var(--space-6)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {/* Eyebrow */}
              <div
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                  marginBottom: '0.75rem',
                }}
              >
                {current.eyebrow}
              </div>

              {/* Title */}
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.375rem',
                  fontWeight: 400,
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.25,
                  margin: '0 0 1rem 0',
                }}
              >
                {current.title}
              </h2>

              {/* Body */}
              <p
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 300,
                  lineHeight: 1.65,
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                  whiteSpace: 'pre-line',
                }}
              >
                {current.body}
              </p>

              {/* Branch button hint (step 3) */}
              {current.showBranchHint && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    padding: '0.875rem 1rem',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-alt)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 300,
                      color: 'var(--color-text-tertiary)',
                      marginBottom: '0.625rem',
                      letterSpacing: '0.02em',
                    }}
                  >
                    Hover any AI response to see:
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-accent-dim)',
                      padding: '0.55rem 1rem',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-secondary)',
                      boxShadow: '0 0 0 2px rgba(61,90,71,0.1), 0 4px 10px rgba(26,26,24,0.07)',
                    }}
                  >
                    <GitFork size={15} />
                    Branch
                  </div>
                </div>
              )}

            </div>

            {/* Navigation */}
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                paddingTop: 'var(--space-4)',
                marginTop: 'var(--space-4)',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              {/* Dot indicator */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    aria-label={`Go to step ${i + 1}`}
                    style={{
                      width: i === step ? '20px' : '6px',
                      height: '6px',
                      background: i === step ? 'var(--color-accent)' : 'var(--color-border-strong)',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'width 0.25s ease, background 0.2s ease',
                    }}
                  />
                ))}
              </div>

              <div
                aria-hidden="true"
                style={{
                  flex: 1,
                  minWidth: 'var(--space-2)',
                }}
              />

              {/* Prev / Next arrows */}
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={() => setStep((s) => Math.max(s - 1, 0))}
                  disabled={isFirst}
                  aria-label="Previous step"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '34px',
                    height: '34px',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    cursor: isFirst ? 'default' : 'pointer',
                    color: isFirst ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                    opacity: isFirst ? 0.4 : 1,
                    transition: 'color 0.15s ease, border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isFirst) {
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                      e.currentTarget.style.borderColor = 'var(--color-border-strong)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = isFirst ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                  }}
                >
                  <ArrowLeft size={15} />
                </button>

                {isLast ? (
                  <button
                    onClick={onClose}
                    className="btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 0.625rem',
                      height: '34px',
                      fontSize: '0.6875rem',
                      letterSpacing: '0.05em',
                      lineHeight: 1,
                    }}
                  >
                    Get Started
                  </button>
                ) : (
                  <button
                    onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
                    aria-label="Next step"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '34px',
                      height: '34px',
                      background: 'var(--color-accent)',
                      border: '1px solid var(--color-accent)',
                      cursor: 'pointer',
                      color: '#fff',
                      transition: 'opacity 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: tree visualization */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: 'var(--space-6)',
              background: 'var(--color-bg)',
              overflow: 'hidden',
            }}
          >
            {/* Context label */}
            <div
              style={{
                fontSize: '0.6875rem',
                fontWeight: 400,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Live preview
            </div>

            {/* Preview — switches based on step type */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {current.showType === 'highlight' ? (
                <MockHighlightPreview />
              ) : current.showType === 'compare' ? (
                <MockComparePreview />
              ) : (
                <TreePreview step={current} />
              )}
            </div>

            {/* Tree legend — only for tree steps */}
            {current.showType === 'tree' && (
              <div
                style={{
                  display: 'flex',
                  gap: '1.25rem',
                  marginTop: 'var(--space-3)',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <LegendItem color="var(--color-accent)" label="Active turn" solid />
                <LegendItem color="var(--color-accent)" label="Active path" />
                <LegendItem color="var(--color-border-strong)" label="Other branches" />
              </div>
            )}

            {/* Highlight legend */}
            {current.showType === 'highlight' && (
              <div
                style={{
                  display: 'flex',
                  gap: '1.25rem',
                  marginTop: 'var(--space-3)',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--color-border)',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <mark
                    style={{
                      background: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
                      borderBottom: '1.5px solid color-mix(in srgb, var(--color-accent) 70%, transparent)',
                      borderRadius: '2px',
                      padding: '0 5px',
                      fontSize: '0.6875rem',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    selected
                  </mark>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 300, color: 'var(--color-text-tertiary)', letterSpacing: '0.02em' }}>
                    Highlighted selection
                  </span>
                </div>
                <LegendItem color="var(--color-accent)" label="Branch popover" />
              </div>
            )}

            {/* Compare legend */}
            {current.showType === 'compare' && (
              <div
                style={{
                  display: 'flex',
                  gap: '1.25rem',
                  marginTop: 'var(--space-3)',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <LegendItem color="var(--color-accent)" label="Your active path" />
                <LegendItem color={SPLIT_COLOR} label="Compared path" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function LegendItem({ color, label, solid }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <div
        style={{
          width: solid ? '10px' : '3px',
          height: solid ? '10px' : '18px',
          background: solid ? color : color,
          opacity: solid ? 1 : 0.6,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: '0.6875rem',
          fontWeight: 300,
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </span>
    </div>
  );
}
