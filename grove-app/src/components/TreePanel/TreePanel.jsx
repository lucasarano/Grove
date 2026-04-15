import { GitBranch } from '@phosphor-icons/react';
import TreeCanvas from './TreeCanvas';

export default function TreePanel({ treeHidden, onToggleTree, splitLeafId, onLeafDragStart, onLeafDragEnd }) {
  return (
    <div
      id="tree-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--color-bg-alt)',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          flexShrink: 0,
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: treeHidden ? 'center' : 'space-between',
          padding: '0 var(--space-3)',
          borderBottom: '1px solid var(--color-border)',
          overflow: 'hidden',
        }}
      >
        {/* Label + icon — hidden when collapsed so the button always fits */}
        {!treeHidden && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
            <GitBranch size={14} color="var(--color-text-tertiary)" style={{ flexShrink: 0 }} />
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Conversation Tree
            </span>
          </div>
        )}

        <button
          onClick={onToggleTree}
          title={treeHidden ? 'Show conversation tree' : 'Hide conversation tree'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: '0.7rem',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            padding: '0.2rem 0.4rem',
            transition: 'color 0.15s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
        >
          {treeHidden ? 'Show Tree' : 'Hide'}
        </button>
      </div>

      {/* Scrollable canvas — hidden when treeHidden */}
      {!treeHidden && (
        <TreeCanvas
          splitLeafId={splitLeafId}
          onLeafDragStart={onLeafDragStart}
          onLeafDragEnd={onLeafDragEnd}
        />
      )}
    </div>
  );
}
