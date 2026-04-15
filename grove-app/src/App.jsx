import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SPLIT_COLOR } from './components/TreePanel/TreeCanvas';
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

// Width of the tree panel when visually collapsed (header-only)
const TREE_COLLAPSED_PX = 110;

function MainLayout() {
  const layoutRef = useRef(null);
  const [treeWidth, setTreeWidth] = useState(() =>
    typeof window !== 'undefined'
      ? Math.round(window.innerWidth * DEFAULT_TREE_FRACTION)
      : 400,
  );
  const [dragging, setDragging] = useState(false);
  const [treeHidden, setTreeHidden] = useState(false);

  // Split view: leafId of the pinned second panel
  const [splitLeafId, setSplitLeafId] = useState(null);
  // Split panel width as a fraction of the chat area (0.5 = equal halves)
  const [splitFraction, setSplitFraction] = useState(0.5);
  const [splitDragging, setSplitDragging] = useState(false);
  // True while a turn card is being dragged from the tree
  const [isLeafDragging, setIsLeafDragging] = useState(false);
  // True while the drag is hovering over the primary chat area drop zone
  const [isDragOver, setIsDragOver] = useState(false);

  const chatAreaRef = useRef(null);

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
      const clamped = clampTreeWidth(next, rect.width);
      setTreeWidth(clamped);
      // Auto-show when dragged past the collapsed threshold; auto-hide when dragged below it
      if (clamped > TREE_COLLAPSED_PX + 20) setTreeHidden(false);
      else if (clamped <= TREE_COLLAPSED_PX + 20) setTreeHidden(true);
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

  useEffect(() => {
    if (!splitDragging) return undefined;

    const onMove = (e) => {
      const el = chatAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const MIN_PX = 220;
      const raw = (e.clientX - rect.left) / rect.width;
      const minFrac = MIN_PX / rect.width;
      const maxFrac = 1 - minFrac;
      setSplitFraction(Math.min(maxFrac, Math.max(minFrac, raw)));
    };

    const onUp = () => setSplitDragging(false);

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
  }, [splitDragging]);

  const handleLeafDragStart = useCallback(() => setIsLeafDragging(true), []);
  const handleLeafDragEnd   = useCallback(() => {
    setIsLeafDragging(false);
    setIsDragOver(false);
  }, []);

  const effectiveTreeWidth = treeHidden ? TREE_COLLAPSED_PX : treeWidth;
  const inSplitView = !!splitLeafId;

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
      {/* ── Chat area (primary + optional split panel) ── */}
      <div ref={chatAreaRef} style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex' }}>

        {/* Primary chat panel */}
        <div
          style={{
            flexShrink: 0,
            width: inSplitView ? `${splitFraction * 100}%` : '100%',
            minWidth: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
          onDragOver={isLeafDragging && !inSplitView ? (e) => { e.preventDefault(); setIsDragOver(true); } : undefined}
          onDragLeave={isLeafDragging && !inSplitView ? (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
          } : undefined}
          onDrop={isLeafDragging && !inSplitView ? (e) => {
            e.preventDefault();
            const leafId = e.dataTransfer.getData('grove/leaf');
            if (leafId) setSplitLeafId(leafId);
            setIsDragOver(false);
            setIsLeafDragging(false);
          } : undefined}
        >
          {/* Drop-to-compare overlay */}
          {isLeafDragging && !inSplitView && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 100,
                background: isDragOver ? 'rgba(160,52,52,0.10)' : 'rgba(160,52,52,0.04)',
                border: `2px dashed ${isDragOver ? SPLIT_COLOR : 'rgba(160,52,52,0.35)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
            >
              <span style={{
                color: SPLIT_COLOR,
                fontSize: '0.8125rem',
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-body)',
                opacity: isDragOver ? 1 : 0.6,
              }}>
                Drop to compare
              </span>
            </div>
          )}

          <ChatPanel colorMarker={inSplitView ? 'var(--color-accent)' : null} />
        </div>

        {/* Split panel */}
        {inSplitView && (
          <>
            {/* Draggable split divider */}
            <div
              onMouseDown={(e) => { e.preventDefault(); setSplitDragging(true); }}
              style={{
                flexShrink: 0,
                width: 6,
                background: splitDragging ? 'var(--color-border-strong)' : 'var(--color-border-strong)',
                cursor: 'col-resize',
                transition: splitDragging ? 'none' : 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-dim)'; }}
              onMouseLeave={(e) => { if (!splitDragging) e.currentTarget.style.background = 'var(--color-border-strong)'; }}
            />
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ChatPanel
                pinnedLeafId={splitLeafId}
                colorMarker={SPLIT_COLOR}
                onClose={() => setSplitLeafId(null)}
                onSplitLeafChange={setSplitLeafId}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Tree resize divider (always present so hidden tree can be dragged open) ── */}
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

      {/* ── Tree panel ── */}
      <div
        style={{
          flex: `0 0 ${effectiveTreeWidth}px`,
          width: effectiveTreeWidth,
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: treeHidden ? '1px solid var(--color-border)' : 'none',
        }}
      >
        <TreePanel
          treeHidden={treeHidden}
          onToggleTree={() => setTreeHidden((h) => !h)}
          splitLeafId={splitLeafId}
          onLeafDragStart={handleLeafDragStart}
          onLeafDragEnd={handleLeafDragEnd}
        />
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
