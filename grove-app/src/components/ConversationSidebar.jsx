import { useEffect, useState, useCallback } from 'react';
import { X, Plus, ChatCircle } from '@phosphor-icons/react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useConversation } from '../context/ConversationContext';

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ConversationSidebar({ isOpen, onClose }) {
  const { user, isLoggedIn } = useAuth();
  const { loadConversation, resetConversation, firestoreConvId } = useConversation();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const ref = collection(db, 'users', user.uid, 'conversations');
      const q = query(ref, orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      const convs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setConversations(convs);
    } catch {
      // silently ignore — user may have no conversations yet
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && isLoggedIn) {
      fetchConversations();
    }
  }, [isOpen, isLoggedIn, fetchConversations]);

  useEffect(() => {
    if (!user) setConversations([]);
  }, [user]);

  async function handleSelect(convId) {
    await loadConversation(user.uid, convId);
    onClose();
  }

  function handleNew() {
    resetConversation();
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 149,
            background: 'rgba(26,26,24,0.18)',
            backdropFilter: 'blur(1px)',
          }}
        />
      )}

      {/* Drawer */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '280px',
          zIndex: 150,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg)',
          borderRight: '1px solid var(--color-border)',
          boxShadow: isOpen ? '4px 0 24px rgba(26,26,24,0.10)' : 'none',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1), box-shadow 0.22s ease',
          overflowY: 'auto',
        }}
        aria-hidden={!isOpen}
      >
        {/* Sidebar header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '56px',
          padding: '0 var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.01em',
          }}>
            Conversations
          </span>
          <button
            className="btn-icon"
            onClick={onClose}
            title="Close sidebar"
            style={{ padding: '0.375rem' }}
          >
            <X size={17} />
          </button>
        </div>

        {/* New chat button */}
        <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <button
            className="btn-primary"
            onClick={handleNew}
            style={{ width: '100%', justifyContent: 'center', gap: '0.375rem', padding: '0.5rem 1rem' }}
          >
            <Plus size={14} />
            New Chat
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
          {!isLoggedIn ? (
            <div style={{
              padding: '2rem 1.25rem',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: '0.875rem',
              fontWeight: 300,
              lineHeight: 1.6,
            }}>
              Sign in to save and revisit your conversations.
            </div>
          ) : loading ? (
            <div style={{
              padding: '2rem 1.25rem',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: '0.875rem',
              fontWeight: 300,
            }}>
              Loading…
            </div>
          ) : conversations.length === 0 ? (
            <div style={{
              padding: '2rem 1.25rem',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: '0.875rem',
              fontWeight: 300,
              lineHeight: 1.6,
            }}>
              No conversations yet. Start chatting to save your history.
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === firestoreConvId;
              return (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  isActive={isActive}
                  onSelect={() => handleSelect(conv.id)}
                />
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

function ConvItem({ conv, isActive, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.625rem',
        width: '100%',
        textAlign: 'left',
        background: isActive
          ? 'var(--color-bg-alt)'
          : hovered
          ? 'rgba(61,90,71,0.05)'
          : 'transparent',
        border: 'none',
        borderLeft: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
        padding: '0.625rem 1rem 0.625rem calc(1rem - 2px)',
        cursor: 'pointer',
        transition: 'background 0.12s ease, border-color 0.12s ease',
        fontFamily: 'var(--font-body)',
      }}
    >
      <ChatCircle
        size={15}
        weight={isActive ? 'fill' : 'regular'}
        color={isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
        style={{ flexShrink: 0, marginTop: '0.2rem' }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: isActive ? 500 : 300,
          color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}>
          {conv.title || 'Untitled'}
        </div>
        <div style={{
          fontSize: '0.75rem',
          fontWeight: 300,
          color: 'var(--color-text-tertiary)',
          marginTop: '0.125rem',
        }}>
          {formatDate(conv.updatedAt)}
        </div>
      </div>
    </button>
  );
}
