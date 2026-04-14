import { useCallback, useMemo, useRef } from 'react';
import { useConversation } from '../../context/ConversationContext';
import MessageList from './MessageList';
import InputBar from './InputBar';

export default function ChatPanel() {
  const { getActivePath, firestoreConvId, rootId, activeLeafId } = useConversation();
  const inputBarRef = useRef(null);

  // Active path is recalculated only when nodes/activeLeafId changes
  const activePath = useMemo(() => getActivePath(), [getActivePath]);

  // Key changes when the conversation changes, forcing MessageList to remount
  // and reset react-window's cached row heights (prevents visual overlap).
  const listKey = `${firestoreConvId ?? rootId ?? 'empty'}:${activeLeafId ?? 'none'}`;

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
      id="chat-panel"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <MessageList key={listKey} items={activePath} />
      <InputBar ref={inputBarRef} />
    </div>
  );
}
