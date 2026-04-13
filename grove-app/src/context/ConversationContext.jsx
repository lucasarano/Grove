import { createContext, useContext, useCallback, useEffect, useReducer, useRef } from 'react';
import { nanoid } from 'nanoid';
import { streamMessage, DEFAULT_MODEL, MODELS } from '../services/claude';
import { streamOpenAIMessage } from '../services/openai';
import { splitTopicFromContent } from '../lib/topicMetadata';
import {
  readStoredProviderKeys,
  effectiveAnthropicKey,
  effectiveOpenaiKey,
  hasAnthropicAccess,
  hasOpenaiAccess,
} from '../lib/providerKeys';
import { db } from '../lib/firebase';
import { TOKEN_LIMIT } from './AuthContext';
import { doc, collection, setDoc, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';

/* ─── Types / Shape ────────────────────────────────────────────────────
  Node: {
    id: string,
    parentId: string | null,
    role: 'user' | 'assistant',
    content: string,
    model?: string,
    timestamp: number,
    children: string[],
    branchLabel: string,
    topicLabel?: string,
  }

  State: {
    nodes: { [id]: Node },
    rootId: string | null,
    activeLeafId: string | null,
    streamingNodeId: string | null,
    streamingContent: string,
    isStreaming: boolean,
    model: string,
    anthropicApiKey: string,
    openaiApiKey: string,
    firestoreConvId: string | null,
  }
──────────────────────────────────────────────────────────────────────── */

const ConversationContext = createContext(null);

// ─── Helpers ─────────────────────────────────────────────────────────

function branchLabel(content) {
  return content.slice(0, 48).replace(/\n/g, ' ').trim();
}

function makeNode({ parentId = null, role, content, model }) {
  return {
    id: nanoid(10),
    parentId,
    role,
    content,
    model,
    timestamp: Date.now(),
    children: [],
    branchLabel: branchLabel(content),
  };
}

/** Walk from a leaf up to root, return path as array [root, ..., leaf] */
function getPath(nodes, leafId) {
  const path = [];
  let cur = leafId;
  while (cur) {
    const node = nodes[cur];
    if (!node) break;
    path.unshift(node);
    cur = node.parentId;
  }
  return path;
}

/** Convert path to messages array (user/assistant) */
function pathToMessages(path) {
  return path.map((n) => ({ role: n.role, content: n.content }));
}

// ─── Reducer ─────────────────────────────────────────────────────────

const ACTIONS = {
  SET_PROVIDER_KEYS:   'SET_PROVIDER_KEYS',
  SET_MODEL:           'SET_MODEL',
  ADD_NODE:            'ADD_NODE',
  SET_ACTIVE_LEAF:     'SET_ACTIVE_LEAF',
  STREAMING_START:     'STREAMING_START',
  STREAMING_CHUNK:     'STREAMING_CHUNK',
  STREAMING_DONE:      'STREAMING_DONE',
  STREAMING_ERROR:     'STREAMING_ERROR',
  RESET_CONVERSATION:  'RESET_CONVERSATION',
  SET_CONV_ID:         'SET_CONV_ID',
  LOAD_CONVERSATION:   'LOAD_CONVERSATION',
};

const initialState = {
  nodes: {},
  rootId: null,
  activeLeafId: null,
  streamingNodeId: null,
  streamingContent: '',
  isStreaming: false,
  model: DEFAULT_MODEL,
  ...readStoredProviderKeys(),
  error: null,
  firestoreConvId: null,
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_PROVIDER_KEYS: {
      const { anthropic, openai } = action.payload;
      const nextAnthropic = anthropic !== undefined ? anthropic : state.anthropicApiKey;
      const nextOpenai = openai !== undefined ? openai : state.openaiApiKey;
      localStorage.setItem('grove_anthropic_api_key', nextAnthropic);
      localStorage.setItem('grove_openai_api_key', nextOpenai);
      localStorage.removeItem('grove_api_key');
      return {
        ...state,
        anthropicApiKey: nextAnthropic,
        openaiApiKey: nextOpenai,
        error: null,
      };
    }

    case ACTIONS.SET_MODEL:
      return { ...state, model: action.payload };

    case ACTIONS.ADD_NODE: {
      const { node, parentId } = action.payload;
      const nodes = { ...state.nodes, [node.id]: node };

      if (parentId && nodes[parentId]) {
        nodes[parentId] = {
          ...nodes[parentId],
          children: [...nodes[parentId].children, node.id],
        };
      }

      return {
        ...state,
        nodes,
        rootId: state.rootId ?? node.id,
        activeLeafId: node.id,
        error: null,
      };
    }

    case ACTIONS.SET_ACTIVE_LEAF:
      return { ...state, activeLeafId: action.payload, error: null };

    case ACTIONS.STREAMING_START: {
      const { streamingNodeId } = action.payload;
      return { ...state, streamingNodeId, streamingContent: '', isStreaming: true };
    }

    case ACTIONS.STREAMING_CHUNK:
      return { ...state, streamingContent: state.streamingContent + action.payload };

    case ACTIONS.STREAMING_DONE: {
      const { id, content: raw } = action.payload;
      const { content, topicLabel } = splitTopicFromContent(raw);
      const shouldFollowCompletedStream = state.activeLeafId === id;
      const nodes = {
        ...state.nodes,
        [id]: {
          ...state.nodes[id],
          content,
          topicLabel: topicLabel ?? undefined,
          branchLabel: branchLabel(content),
        },
      };
      return {
        ...state,
        nodes,
        activeLeafId: shouldFollowCompletedStream ? id : state.activeLeafId,
        streamingNodeId: null,
        streamingContent: '',
        isStreaming: false,
      };
    }

    case ACTIONS.STREAMING_ERROR:
      return {
        ...state,
        isStreaming: false,
        streamingNodeId: null,
        streamingContent: '',
        error: action.payload,
      };

    case ACTIONS.RESET_CONVERSATION:
      return {
        ...initialState,
        anthropicApiKey: state.anthropicApiKey,
        openaiApiKey: state.openaiApiKey,
        model: state.model,
      };

    case ACTIONS.SET_CONV_ID:
      return { ...state, firestoreConvId: action.payload };

    case ACTIONS.LOAD_CONVERSATION: {
      const { nodes, rootId, activeLeafId, firestoreConvId } = action.payload;
      return {
        ...initialState,
        anthropicApiKey: state.anthropicApiKey,
        openaiApiKey: state.openaiApiKey,
        model: state.model,
        nodes,
        rootId,
        activeLeafId,
        firestoreConvId,
      };
    }

    default:
      return state;
  }
}

// ─── Provider ────────────────────────────────────────────────────────

export function ConversationProvider({ children, currentUser, isAtTokenLimit, addTokenUsage, onRequireSignup }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef(null);
  const wasLoggedInRef = useRef(!!currentUser);

  // Derived: active path
  const getActivePath = useCallback(() => {
    if (!state.activeLeafId) return [];
    return getPath(state.nodes, state.activeLeafId);
  }, [state.nodes, state.activeLeafId]);

  // ── Firestore helpers ────────────────────────────────────────────────

  async function ensureConversation(firstMessage) {
    if (!currentUser) return null;

    let convId = state.firestoreConvId;
    if (!convId) {
      const ref = collection(db, 'users', currentUser.uid, 'conversations');
      const convDoc = await addDoc(ref, {
        title:     firstMessage.slice(0, 60),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        model:     state.model,
      });
      convId = convDoc.id;
      dispatch({ type: ACTIONS.SET_CONV_ID, payload: convId });
    }
    return convId;
  }

  async function saveMessageToFirestore(convId, node) {
    if (!currentUser || !convId) return;
    const msgRef = doc(
      db,
      'users', currentUser.uid,
      'conversations', convId,
      'messages', node.id
    );
    await setDoc(msgRef, {
      id:         node.id,
      parentId:   node.parentId,
      role:       node.role,
      content:    node.content,
      model:      node.model || null,
      topicLabel: node.topicLabel || null,
      timestamp:  node.timestamp,
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────

  const setProviderKeys = useCallback((payload) => {
    dispatch({ type: ACTIONS.SET_PROVIDER_KEYS, payload });
  }, []);

  const setModel = useCallback((model) => {
    dispatch({ type: ACTIONS.SET_MODEL, payload: model });
  }, []);

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || state.isStreaming) return;

    if (isAtTokenLimit) {
      dispatch({
        type: ACTIONS.STREAMING_ERROR,
        payload: `You've reached your ${TOKEN_LIMIT.toLocaleString()} token limit for the free tier. Upgrade to continue chatting.`,
      });
      return;
    }

    const isLoggedIn = !!currentUser;
    const guestHasKey =
      hasAnthropicAccess({ isLoggedIn: false, anthropicApiKey: state.anthropicApiKey }) ||
      hasOpenaiAccess({ isLoggedIn: false, openaiApiKey: state.openaiApiKey });
    if (!isLoggedIn && !guestHasKey) {
      onRequireSignup?.();
      return;
    }

    const parentId = state.activeLeafId;

    // 1. Create + add user node
    const userNode = makeNode({ parentId, role: 'user', content: content.trim() });
    dispatch({ type: ACTIONS.ADD_NODE, payload: { node: userNode, parentId } });

    // 2. Persist to Firestore if logged in
    const convId = await ensureConversation(content.trim());
    await saveMessageToFirestore(convId, userNode);

    // 3. Build conversation context
    const historyPath = parentId ? getPath(state.nodes, parentId) : [];
    const messages = [
      ...pathToMessages(historyPath),
      { role: 'user', content: content.trim() },
    ];

    // 4. Create placeholder streaming node (assistant)
    const modelDef = MODELS.find((m) => m.id === state.model) || MODELS[0];
    const assistantNode = makeNode({ parentId: userNode.id, role: 'assistant', content: '', model: state.model });
    dispatch({ type: ACTIONS.ADD_NODE, payload: { node: assistantNode, parentId: userNode.id } });
    dispatch({ type: ACTIONS.STREAMING_START, payload: { streamingNodeId: assistantNode.id } });

    const anthropicKey = effectiveAnthropicKey({
      isLoggedIn,
      anthropicApiKey: state.anthropicApiKey,
    });
    const openaiKey = effectiveOpenaiKey({
      isLoggedIn,
      openaiApiKey: state.openaiApiKey,
    });

    // 6. Stream response (route to correct provider)
    let accumulated = '';
    const streamFn = modelDef?.provider === 'openai'
      ? streamOpenAIMessage
      : streamMessage;

    const streamParams = modelDef?.provider === 'openai'
      ? { apiKey: openaiKey, model: state.model, messages }
      : { apiKey: anthropicKey, model: state.model, messages };

    const { abort } = await streamFn({
      ...streamParams,
      onChunk: (chunk) => {
        accumulated += chunk;
        dispatch({ type: ACTIONS.STREAMING_CHUNK, payload: chunk });
      },
      onDone: async (usage = {}) => {
        dispatch({
          type: ACTIONS.STREAMING_DONE,
          payload: { id: assistantNode.id, content: accumulated },
        });
        // Save completed assistant message
        const { content: cleanContent } = splitTopicFromContent(accumulated);
        await saveMessageToFirestore(convId, { ...assistantNode, content: cleanContent });
        // Record token usage for logged-in users
        const totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
        if (currentUser && totalTokens > 0 && addTokenUsage) {
          await addTokenUsage(totalTokens);
        }
      },
      onError: (err) => {
        dispatch({ type: ACTIONS.STREAMING_ERROR, payload: err.message || String(err) });
      },
    });

    abortRef.current = abort;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeLeafId, state.isStreaming, state.nodes, state.anthropicApiKey, state.openaiApiKey, state.model, state.firestoreConvId, currentUser, isAtTokenLimit, addTokenUsage, onRequireSignup]);

  const branchFrom = useCallback((nodeId) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_LEAF, payload: nodeId });
  }, []);

  const switchToBranch = useCallback((leafId) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_LEAF, payload: leafId });
  }, []);

  const abortStreaming = useCallback(() => {
    if (abortRef.current) abortRef.current();
    dispatch({ type: ACTIONS.STREAMING_ERROR, payload: null });
  }, []);

  const resetConversation = useCallback(() => {
    if (abortRef.current) abortRef.current();
    dispatch({ type: ACTIONS.RESET_CONVERSATION });
  }, []);

  useEffect(() => {
    const wasLoggedIn = wasLoggedInRef.current;
    wasLoggedInRef.current = !!currentUser;
    if (wasLoggedIn && !currentUser) {
      resetConversation();
    }
  }, [currentUser, resetConversation]);

  useEffect(() => {
    const isLoggedIn = !!currentUser;
    const hasA = hasAnthropicAccess({ isLoggedIn, anthropicApiKey: state.anthropicApiKey });
    const hasO = hasOpenaiAccess({ isLoggedIn, openaiApiKey: state.openaiApiKey });
    const usable = (m) =>
      m.tier !== 'blocked' &&
      ((m.provider === 'anthropic' && hasA) || (m.provider === 'openai' && hasO));
    const current = MODELS.find((m) => m.id === state.model);
    if (current && usable(current)) return;
    const next = MODELS.find(usable);
    if (next) dispatch({ type: ACTIONS.SET_MODEL, payload: next.id });
  }, [currentUser, state.anthropicApiKey, state.openaiApiKey, state.model]);

  const loadConversation = useCallback(async (uid, convId) => {
    if (!uid || !convId) return;
    const msgsRef = collection(db, 'users', uid, 'conversations', convId, 'messages');
    const snap = await getDocs(msgsRef);
    if (snap.empty) return;

    // Rebuild node map from stored messages
    const nodes = {};
    snap.forEach((d) => {
      const data = d.data();
      nodes[data.id] = {
        id:         data.id,
        parentId:   data.parentId ?? null,
        role:       data.role,
        content:    data.content,
        model:      data.model ?? null,
        topicLabel: data.topicLabel ?? undefined,
        timestamp:  data.timestamp,
        children:   [],
        branchLabel: branchLabel(data.content || ''),
      };
    });

    // Wire up children arrays
    Object.values(nodes).forEach((n) => {
      if (n.parentId && nodes[n.parentId]) {
        nodes[n.parentId].children.push(n.id);
      }
    });

    // Root = node with no parent; active leaf = latest leaf
    const rootId = Object.values(nodes).find((n) => !n.parentId)?.id ?? null;
    const leaves = Object.values(nodes).filter((n) => n.children.length === 0);
    const activeLeafId = leaves.sort((a, b) => b.timestamp - a.timestamp)[0]?.id ?? rootId;

    dispatch({ type: ACTIONS.LOAD_CONVERSATION, payload: { nodes, rootId, activeLeafId, firestoreConvId: convId } });
  }, []);

  const value = {
    nodes: state.nodes,
    rootId: state.rootId,
    activeLeafId: state.activeLeafId,
    streamingNodeId: state.streamingNodeId,
    streamingContent: state.streamingContent,
    isStreaming: state.isStreaming,
    model: state.model,
    anthropicApiKey: state.anthropicApiKey,
    openaiApiKey: state.openaiApiKey,
    error: state.error,
    firestoreConvId: state.firestoreConvId,
    getActivePath,
    setProviderKeys,
    setModel,
    sendMessage,
    branchFrom,
    switchToBranch,
    abortStreaming,
    resetConversation,
    loadConversation,
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversation must be used within ConversationProvider');
  return ctx;
}

export { getPath };
