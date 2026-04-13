import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConversationProvider } from './context/ConversationContext';
import Header from './components/Header';
import ChatPanel from './components/ChatPanel/ChatPanel';
import TreePanel from './components/TreePanel/TreePanel';
import ApiKeyModal from './components/ApiKeyModal';
import AuthModal from './components/AuthModal';
import ConversationSidebar from './components/ConversationSidebar';

const MIN_TREE_PX = 200;
const MIN_CHAT_PX = 280;
const DEFAULT_TREE_FRACTION = 0.32;

function MainLayout() {
  const layoutRef = useRef(null);
  const [treeWidth, setTreeWidth] = useState(() =>
    typeof window !== 'undefined'
      ? Math.round(window.innerWidth * DEFAULT_TREE_FRACTION)
      : 400,
  );
  const [dragging, setDragging] = useState(false);

  const clampTreeWidth = useCallback((next, total) => {
    const maxTree = Math.max(MIN_TREE_PX, total - MIN_CHAT_PX);
    return Math.min(maxTree, Math.max(MIN_TREE_PX, next));
  }, []);

  useEffect(() => {
    const onResize = () => {
      const el = layoutRef.current;
      if (!el) return;
      const total = el.getBoundingClientRect().width;
      setTreeWidth((tw) => clampTreeWidth(tw, total));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampTreeWidth]);

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (e) => {
      const el = layoutRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = rect.right - e.clientX;
      setTreeWidth(clampTreeWidth(next, rect.width));
    };

    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, clampTreeWidth]);

  return (
    <div
      ref={layoutRef}
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ChatPanel />
      </div>
      <button
        type="button"
        aria-label="Resize conversation tree panel"
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        style={{
          flexShrink: 0,
          width: 6,
          margin: 0,
          padding: 0,
          border: 'none',
          borderLeft: '1px solid var(--color-border)',
          cursor: 'col-resize',
          background: dragging ? 'var(--color-border)' : 'transparent',
          transition: dragging ? 'none' : 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!dragging) e.currentTarget.style.background = 'var(--color-border)';
        }}
        onMouseLeave={(e) => {
          if (!dragging) e.currentTarget.style.background = 'transparent';
        }}
      />
      <div
        style={{
          flex: `0 0 ${treeWidth}px`,
          width: treeWidth,
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TreePanel />
      </div>
    </div>
  );
}

function AppInner() {
  const { user, loading, isAtTokenLimit, addTokenUsage } = useAuth();
  const [apiKeyOpen,   setApiKeyOpen]   = useState(false);
  const [authOpen,     setAuthOpen]     = useState(false);
  const [authModalMode, setAuthModalMode] = useState('signup');
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const openAuthModal = useCallback((mode) => {
    setAuthModalMode(mode);
    setAuthOpen(true);
  }, []);

  // While Firebase resolves auth state, render nothing to avoid flash
  if (loading) return null;

  return (
    <ConversationProvider
      currentUser={user}
      isAtTokenLimit={isAtTokenLimit}
      addTokenUsage={addTokenUsage}
      onRequireSignup={() => openAuthModal('signup')}
    >
      <ConversationSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <Header
          onShowApiKey={() => setApiKeyOpen(true)}
          onShowAuth={() => openAuthModal('signin')}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />
        <MainLayout />
        <ApiKeyModal open={apiKeyOpen} onClose={() => setApiKeyOpen(false)} />
        <AuthModal open={authOpen} defaultMode={authModalMode} onClose={() => setAuthOpen(false)} />
      </div>
    </ConversationProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
