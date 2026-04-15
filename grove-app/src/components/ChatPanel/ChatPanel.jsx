import { useCallback, useMemo, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { useConversation } from '../../context/ConversationContext';
import { getPath } from '../../context/ConversationContext';
import { SPLIT_COLOR } from '../TreePanel/TreeCanvas';
import MessageList from './MessageList';
import InputBar from './InputBar';

/**
 * pinnedLeafId      – when set the panel is "split" (read-only path pinned to
 *                     this leaf).  It now also gets its own independent InputBar.
 * onSplitLeafChange – called with newly created node ids so the parent can
 *                     keep splitLeafId in sync as the user chats in this panel.
 */
export default function ChatPanel({ pinnedLeafId = null, colorMarker = null, onClose = null, onSplitLeafChange = null }) {
  const { sendMessage, getActivePath, firestoreConvId, rootId, activeLeafId, nodes } = useConversation();
  const inputBarRef = useRef(null);
  const isPinned = !!pinnedLeafId;

  // When the split panel sends, route through fromNodeId so the main panel's
  // activeLeafId is never touched.  onSplitLeafChange keeps splitLeafId fresh.
  const splitSendFn = useCallback((content, images) => {
    if (!pinnedLeafId) return;
    sendMessage(content, images, {
      fromNodeId: pinnedLeafId,
      onNodeCreated: onSplitLeafChange ?? undefined,
    });
  }, [sendMessage, pinnedLeafId, onSplitLeafChange]);

  const activePath = useMemo(() => {
    if (isPinned) return getPath(nodes, pinnedLeafId);
    return getActivePath();
  }, [isPinned, pinnedLeafId, nodes, getActivePath]);

  const listKey = useMemo(() => {
    const leafId = isPinned ? pinnedLeafId : activeLeafId;
    return `${firestoreConvId ?? rootId ?? 'empty'}:${leafId ?? 'none'}`;
  }, [isPinned, pinnedLeafId, activeLeafId, firestoreConvId, rootId]);

  const hasImageFile = useCallback((dataTransfer) => {
    const items = Array.from(dataTransfer.items ?? []);
    if (items.length > 0) {
      return items.some((item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')));
    }
    return Array.from(dataTransfer.files ?? []).some((file) => file.type.startsWith('image/'));
  }, []);

  const handleDragEnter = useCallback((event) => {
    if (!hasImageFile(event.dataTransfer)) return;
    event.preventDefault();
    inputBarRef.current?.setChatImageDragging(true);
  }, [hasImageFile]);

  const handleDragOver = useCallback((event) => {
    if (!hasImageFile(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    inputBarRef.current?.setChatImageDragging(true);
  }, [hasImageFile]);

  const handleDragLeave = useCallback((event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    inputBarRef.current?.setChatImageDragging(false);
  }, []);

  const handleDrop = useCallback((event) => {
    if (!hasImageFile(event.dataTransfer)) return;
    event.preventDefault();
    inputBarRef.current?.addDroppedImages(event.dataTransfer.files);
  }, [hasImageFile]);

  return (
    <div
      id={isPinned ? 'split-chat-panel' : 'chat-panel'}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Path color marker bar */}
      {colorMarker && (
        <div style={{ height: 6, background: colorMarker, flexShrink: 0 }} />
      )}

      {/* Close button for split panel */}
      {isPinned && onClose && (
        <button
          onClick={onClose}
          title="Close split view"
          style={{
            position: 'absolute',
            top: colorMarker ? 14 : 8,
            right: 8,
            zIndex: 10,
            background: 'color-mix(in srgb, var(--color-bg-alt) 92%, white)',
            border: `1px solid color-mix(in srgb, ${SPLIT_COLOR} 35%, var(--color-border))`,
            width: 28,
            height: 28,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: SPLIT_COLOR,
            transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = SPLIT_COLOR;
            e.currentTarget.style.borderColor = SPLIT_COLOR;
            e.currentTarget.style.background = 'color-mix(in srgb, var(--color-bg-alt) 70%, white)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = SPLIT_COLOR;
            e.currentTarget.style.borderColor = `color-mix(in srgb, ${SPLIT_COLOR} 35%, var(--color-border))`;
            e.currentTarget.style.background = 'color-mix(in srgb, var(--color-bg-alt) 92%, white)';
          }}
        >
          <X size={15} weight="bold" />
        </button>
      )}

      <MessageList
        key={listKey}
        items={activePath}
        onBranchNodeCreated={isPinned ? onSplitLeafChange : null}
        panelLeafId={isPinned ? pinnedLeafId : null}
      />

      {isPinned ? (
        // Split panel: independent InputBar wired to this panel's leaf
        <InputBar
          ref={inputBarRef}
          overrideLeafId={pinnedLeafId}
          onSend={splitSendFn}
          autoFocusAfterStream={false}
        />
      ) : (
        <InputBar ref={inputBarRef} />
      )}
    </div>
  );
}
