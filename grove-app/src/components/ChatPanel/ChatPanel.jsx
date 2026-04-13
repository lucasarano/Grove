import { useMemo } from 'react';
import { useConversation } from '../../context/ConversationContext';
import MessageList from './MessageList';
import InputBar from './InputBar';

export default function ChatPanel() {
  const { getActivePath, firestoreConvId, rootId, activeLeafId } = useConversation();

  // Active path is recalculated only when nodes/activeLeafId changes
  const activePath = useMemo(() => getActivePath(), [getActivePath]);

  // Key changes when the conversation changes, forcing MessageList to remount
  // and reset react-window's cached row heights (prevents visual overlap).
  const listKey = `${firestoreConvId ?? rootId ?? 'empty'}:${activeLeafId ?? 'none'}`;

  return (
    <div
      id="chat-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <MessageList key={listKey} items={activePath} />
      <InputBar />
    </div>
  );
}
