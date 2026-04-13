import { GitBranch } from '@phosphor-icons/react';
import TreeCanvas from './TreeCanvas';

export default function TreePanel() {
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
          gap: '0.5rem',
          padding: '0 var(--space-3)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <GitBranch size={14} color="var(--color-text-tertiary)" />
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Conversation Tree
        </span>
      </div>

      {/* Scrollable canvas */}
      <TreeCanvas />
    </div>
  );
}
