import { useMemo, useCallback, memo } from 'react';
import { useConversation } from '../../context/ConversationContext';
import { stripTopicBlockForDisplay } from '../../lib/topicMetadata';

const NODE_W = 172;
const NODE_H = 64;
const GAP_X = 14;
const GAP_Y = 38;

// Sober red for the split path
export const SPLIT_COLOR = '#a03434';
const SPLIT_COLOR_CONNECTOR = 'rgba(160, 52, 52, 0.55)';
const SPLIT_COLOR_BORDER = 'rgba(160, 52, 52, 0.7)';
const SPLIT_COLOR_BG = 'rgba(160, 52, 52, 0.07)';

function buildTurnTree(nodes, rootUserId) {
  function walk(userId, turnNumber) {
    const user = nodes[userId];
    if (!user || user.role !== 'user') return null;
    const assistantId =
      (user.children || []).find((cid) => nodes[cid]?.role === 'assistant') ?? null;
    const turn = {
      id: assistantId || `pending-${userId}`,
      userId,
      assistantId,
      turnNumber,
      children: [],
    };
    if (assistantId) {
      const asst = nodes[assistantId];
      for (const cid of asst.children || []) {
        if (nodes[cid]?.role === 'user') {
          const child = walk(cid, turnNumber + 1);
          if (child) turn.children.push(child);
        }
      }
    }
    return turn;
  }
  return walk(rootUserId, 1);
}

function computeTurnLayout(turnRoot) {
  if (!turnRoot) return { positions: {}, totalWidth: NODE_W, totalHeight: NODE_H };

  const positions = {};
  let maxY = 0;

  function layout(turn, x, y) {
    const children = turn.children || [];
    if (children.length === 0) {
      positions[turn.id] = { x, y };
      maxY = Math.max(maxY, y);
      return { width: NODE_W };
    }

    let childX = x;
    children.forEach((child, i) => {
      const { width: w } = layout(child, childX, y + NODE_H + GAP_Y);
      childX += w + (i < children.length - 1 ? GAP_X : 0);
    });

    const centers = children.map((c) => positions[c.id].x + NODE_W / 2);
    const parentCenter = (Math.min(...centers) + Math.max(...centers)) / 2;
    const parentLeft = parentCenter - NODE_W / 2;
    positions[turn.id] = { x: parentLeft, y };
    maxY = Math.max(maxY, y);

    const rightFromChildren = childX;
    const rightFromParent = parentLeft + NODE_W;
    const spanRight = Math.max(rightFromChildren, rightFromParent);
    return { width: spanRight - x };
  }

  const { width: totalWidth } = layout(turnRoot, 0, 0);
  return {
    positions,
    totalWidth: Math.max(totalWidth, NODE_W),
    totalHeight: maxY + NODE_H,
  };
}

function getActivePathIds(nodes, leafId) {
  const ids = new Set();
  let cur = leafId;
  while (cur && nodes[cur]) {
    ids.add(cur);
    cur = nodes[cur].parentId;
  }
  return ids;
}

function isTurnOnActivePath(turn, pathIds) {
  if (!pathIds.has(turn.userId)) return false;
  if (turn.assistantId && !pathIds.has(turn.assistantId)) return false;
  return true;
}

function isTurnActiveLeaf(turn, activeLeafId) {
  if (turn.assistantId && activeLeafId === turn.assistantId) return true;
  if (activeLeafId === turn.userId) return true;
  return false;
}

function collectTurns(turn, acc = []) {
  if (!turn) return acc;
  acc.push(turn);
  for (const c of turn.children || []) collectTurns(c, acc);
  return acc;
}

function Connector({ fromX, fromY, toX, toY, isActive, isSplit }) {
  const x1 = fromX + NODE_W / 2;
  const y1 = fromY + NODE_H;
  const x2 = toX + NODE_W / 2;
  const y2 = toY;
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={isSplit ? SPLIT_COLOR_CONNECTOR : isActive ? 'var(--color-accent-dim)' : 'var(--color-border)'}
      strokeWidth={isSplit || isActive ? 2.75 : 2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeMiterlimit={2}
      opacity={isSplit ? 0.8 : isActive ? 0.9 : 0.55}
    />
  );
}

const TurnCard = memo(
  ({ turn, x, y, nodes, isActive, isOnPath, isSplitPath, streamingNodeId, streamingContent, onClick, onLeafDragStart, onLeafDragEnd }) => {
    const assistant = turn.assistantId ? nodes[turn.assistantId] : null;
    const streamingHere = turn.assistantId && turn.assistantId === streamingNodeId;

    let topicLine = '…';
    if (streamingHere) {
      const visible = stripTopicBlockForDisplay(streamingContent || '');
      topicLine =
        assistant?.topicLabel ||
        (visible.length > 0 ? visible.replace(/\s+/g, ' ').trim().slice(0, 56) : 'Responding…');
    } else if (assistant) {
      topicLine =
        assistant.topicLabel ||
        assistant.branchLabel ||
        (assistant.content ? assistant.content.replace(/\s+/g, ' ').trim().slice(0, 56) : '…');
    }

    const canDrag = !!turn.assistantId;

    let bg = 'var(--color-surface)';
    let borderColor = 'var(--color-border)';
    let borderLeft;

    if (isActive) {
      bg = 'var(--color-accent)';
      borderColor = 'var(--color-accent)';
    } else if (isSplitPath) {
      bg = SPLIT_COLOR_BG;
      borderColor = SPLIT_COLOR_BORDER;
      borderLeft = `3px solid ${SPLIT_COLOR}`;
    } else if (isOnPath) {
      bg = 'var(--color-bg-alt)';
      borderColor = 'var(--color-border-strong)';
      borderLeft = '3px solid var(--color-accent)';
    }

    return (
      <div
        role="button"
        tabIndex={0}
        draggable={canDrag}
        onDragStart={canDrag ? (e) => {
          e.dataTransfer.setData('grove/leaf', turn.assistantId);
          e.dataTransfer.effectAllowed = 'copy';
          onLeafDragStart?.(turn.assistantId);
        } : undefined}
        onDragEnd={canDrag ? () => onLeafDragEnd?.() : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(turn);
          }
        }}
        onClick={() => onClick(turn)}
        title={canDrag ? `${topicLine} — drag to compare` : topicLine}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: NODE_W,
          minHeight: NODE_H,
          boxSizing: 'border-box',
          background: bg,
          border: '1px solid',
          borderColor,
          borderLeft,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '6px 10px',
          gap: '4px',
          transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
          boxShadow: isActive ? '0 2px 12px rgba(61,90,71,0.18)' : isSplitPath ? '0 2px 8px rgba(160,52,52,0.12)' : 'none',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
        }}
      >
        <div
          style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: isActive ? 'rgba(255,255,255,0.85)' : isSplitPath ? SPLIT_COLOR : 'var(--color-text-tertiary)',
            lineHeight: 1.2,
          }}
        >
          Turn {turn.turnNumber}
        </div>
        <div
          style={{
            fontSize: '0.6875rem',
            fontWeight: 400,
            lineHeight: 1.35,
            color: isActive ? '#FFFFFF' : 'var(--color-text-secondary)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
            hyphens: 'auto',
          }}
        >
          {topicLine}
        </div>
      </div>
    );
  },
);

TurnCard.displayName = 'TurnCard';

export default function TreeCanvas({ splitLeafId, onLeafDragStart, onLeafDragEnd }) {
  const {
    nodes,
    rootId,
    activeLeafId,
    streamingNodeId,
    streamingContent,
    switchToBranch,
    branchFrom,
  } = useConversation();

  const rootIsUser = rootId && nodes[rootId]?.role === 'user';

  const turnRoot = useMemo(() => {
    if (!rootIsUser || !rootId) return null;
    return buildTurnTree(nodes, rootId);
  }, [nodes, rootId, rootIsUser]);

  const { positions, totalWidth, totalHeight } = useMemo(
    () => computeTurnLayout(turnRoot),
    [turnRoot],
  );

  const activePathIds = useMemo(
    () => getActivePathIds(nodes, activeLeafId),
    [nodes, activeLeafId],
  );

  const splitPathIds = useMemo(
    () => (splitLeafId ? getActivePathIds(nodes, splitLeafId) : new Set()),
    [nodes, splitLeafId],
  );

  const allTurns = useMemo(() => collectTurns(turnRoot, []), [turnRoot]);

  const handleTurnClick = useCallback(
    (turn) => {
      const aid = turn.assistantId;
      if (!aid || !nodes[aid]) return;
      const childUsers = (nodes[aid].children || []).filter((cid) => nodes[cid]?.role === 'user');
      if (childUsers.length === 0) {
        switchToBranch(aid);
      } else {
        branchFrom(aid);
      }
    },
    [nodes, switchToBranch, branchFrom],
  );

  const PADDING = 16;

  if (!rootId || !turnRoot) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-4)',
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '1px solid var(--color-border)',
            marginBottom: 'var(--space-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>1</span>
        </div>
        <p style={{ fontSize: '0.8125rem', fontWeight: 300, lineHeight: 1.5 }}>
          The conversation tree will appear here as you chat.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: `${PADDING}px`,
        position: 'relative',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          top: PADDING,
          left: PADDING,
          width: totalWidth,
          height: totalHeight,
          pointerEvents: 'none',
        }}
        width={totalWidth}
        height={totalHeight}
      >
        {allTurns.map((turn) =>
          (turn.children || []).map((child) => {
            const p = positions[turn.id];
            const c = positions[child.id];
            if (!p || !c) return null;
            const isActive =
              isTurnOnActivePath(turn, activePathIds) &&
              isTurnOnActivePath(child, activePathIds);
            const isSplit =
              !isActive &&
              isTurnOnActivePath(turn, splitPathIds) &&
              isTurnOnActivePath(child, splitPathIds);
            return (
              <Connector
                key={`${turn.id}-${child.id}`}
                fromX={p.x}
                fromY={p.y}
                toX={c.x}
                toY={c.y}
                isActive={isActive}
                isSplit={isSplit}
              />
            );
          }),
        )}
      </svg>

      <div style={{ position: 'relative', width: totalWidth, minHeight: totalHeight }}>
        {allTurns.map((turn) => {
          const pos = positions[turn.id];
          if (!pos) return null;
          const isOnActivePath = isTurnOnActivePath(turn, activePathIds);
          const isOnSplitPath = !isOnActivePath && isTurnOnActivePath(turn, splitPathIds);
          return (
            <TurnCard
              key={turn.id}
              turn={turn}
              x={pos.x}
              y={pos.y}
              nodes={nodes}
              isActive={isTurnActiveLeaf(turn, activeLeafId)}
              isOnPath={isOnActivePath}
              isSplitPath={isOnSplitPath}
              streamingNodeId={streamingNodeId}
              streamingContent={streamingContent}
              onClick={handleTurnClick}
              onLeafDragStart={onLeafDragStart}
              onLeafDragEnd={onLeafDragEnd}
            />
          );
        })}
      </div>
    </div>
  );
}
