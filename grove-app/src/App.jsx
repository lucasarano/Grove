import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConversationProvider } from './context/ConversationContext';
import Header from './components/Header';
import ChatPanel from './components/ChatPanel/ChatPanel';
import TreePanel from './components/TreePanel/TreePanel';
import ApiKeyModal from './components/ApiKeyModal';
import AuthModal from './components/AuthModal';
import UpgradeModal from './components/UpgradeModal';
import PremiumManageModal from './components/PremiumManageModal';
import ConversationSidebar from './components/ConversationSidebar';
import TutorialModal from './components/TutorialModal';

const MIN_TREE_PX = 200;
const MIN_CHAT_PX = 280;
const DEFAULT_TREE_FRACTION = 0.32;

/** Persisted when the user closes the onboarding tutorial (any dismiss). */
const TUTORIAL_SEEN_STORAGE_KEY = 'grove:onboarding-seen-v1';
const TUTORIAL_SEEN_LEGACY_KEY = 'grove:tutorial-seen';

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

function CheckoutBanner({ status, onDismiss }) {
  if (!status) return null;
  const isSuccess = status === 'success';
  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 600,
      background: isSuccess ? 'var(--color-accent)' : 'var(--color-surface)',
      border: `1px solid ${isSuccess ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
      color: isSuccess ? '#fff' : 'var(--color-text-primary)',
      padding: '0.75rem 1.25rem',
      boxShadow: '0 4px 20px rgba(26,26,24,0.16)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.875rem',
      maxWidth: '420px',
      width: '90vw',
      fontFamily: 'var(--font-body)',
      fontSize: '0.9375rem',
      fontWeight: 300,
      animation: 'bannerIn 0.3s ease-out',
    }}>
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        {isSuccess
          ? '🎉 Welcome to Premium! All models are now unlocked.'
          : 'Checkout cancelled — you can upgrade anytime.'}
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: isSuccess ? 'rgba(255,255,255,0.7)' : 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          lineHeight: 1,
          padding: '0.125rem',
          flexShrink: 0,
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes bannerIn {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function AppInner() {
  const { user, loading, isAtTokenLimit, addTokenUsage } = useAuth();
  const [apiKeyOpen,    setApiKeyOpen]    = useState(false);
  const [authOpen,      setAuthOpen]      = useState(false);
  const [authModalMode, setAuthModalMode] = useState('signup');
  const [upgradeOpen,   setUpgradeOpen]   = useState(false);
  const [premiumManageOpen, setPremiumManageOpen] = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState(null); // 'success' | 'cancel' | null
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const markTutorialSeen = useCallback(() => {
    try {
      window.localStorage.setItem(TUTORIAL_SEEN_STORAGE_KEY, '1');
      window.localStorage.removeItem(TUTORIAL_SEEN_LEGACY_KEY);
    } catch {
      /* private mode / quota */
    }
  }, []);

  const closeTutorial = useCallback(() => {
    markTutorialSeen();
    setTutorialOpen(false);
  }, [markTutorialSeen]);

  // Client-only: open on first visit before paint (useState initializer + localStorage is unreliable).
  useLayoutEffect(() => {
    try {
      const store = window.localStorage;
      if (store.getItem(TUTORIAL_SEEN_LEGACY_KEY) && !store.getItem(TUTORIAL_SEEN_STORAGE_KEY)) {
        store.setItem(TUTORIAL_SEEN_STORAGE_KEY, store.getItem(TUTORIAL_SEEN_LEGACY_KEY));
      }
      if (!store.getItem(TUTORIAL_SEEN_STORAGE_KEY)) {
        setTutorialOpen(true);
      }
    } catch {
      setTutorialOpen(true);
    }
  }, []);

  // Handle ?checkout=success / ?checkout=cancel from Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    if (status === 'success' || status === 'cancel') {
      setCheckoutStatus(status);
      // Clean the URL param without a full page reload
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const openAuthModal = useCallback((mode) => {
    setAuthModalMode(mode);
    setAuthOpen(true);
  }, []);

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
          onShowUpgrade={() => setUpgradeOpen(true)}
          onShowPremiumManage={() => setPremiumManageOpen(true)}
          onShowTutorial={() => setTutorialOpen(true)}
        />
        <MainLayout />
        <ApiKeyModal open={apiKeyOpen} onClose={() => setApiKeyOpen(false)} />
        <AuthModal open={authOpen} defaultMode={authModalMode} onClose={() => setAuthOpen(false)} />
        <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
        <PremiumManageModal open={premiumManageOpen} onClose={() => setPremiumManageOpen(false)} />
        <CheckoutBanner status={checkoutStatus} onDismiss={() => setCheckoutStatus(null)} />
        <TutorialModal open={tutorialOpen} onClose={closeTutorial} />
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
