import { createContext, useContext, useCallback, useEffect, useReducer, useRef } from 'react';
import { nanoid } from 'nanoid';
import { streamMessage, DEFAULT_MODEL, MODELS } from '../services/claude';
import { streamOpenAIMessage } from '../services/openai';
import { splitTopicFromContent, stripTopicBlockForDisplay } from '../lib/topicMetadata';
import {
  readStoredProviderKeys,
  readKeyMode,
  saveKeyMode,
  effectiveAnthropicKey,
  effectiveOpenaiKey,
  hasAnthropicAccess,
  hasOpenaiAccess,
} from '../lib/providerKeys';
import { db } from '../lib/firebase';
import { useAuth, formatTokenLimitResetHint } from './AuthContext';
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

function makeNode({ parentId = null, role, content, model, images = [], selectionQuote = null, selectionSourceNodeId = null }) {
  return {
    id: nanoid(10),
    parentId,
    role,
    content,
    model,
    images,
    selectionQuote,
    selectionSourceNodeId,
    timestamp: Date.now(),
    children: [],
    branchLabel: branchLabel(content),
  };
}

/** Walk down the tree always taking the most-recently-created child until a leaf is reached. */
function deepestLeaf(nodes, startId) {
  let cur = startId;
  for (;;) {
    const node = nodes[cur];
    if (!node || node.children.length === 0) return cur;
    const latest = node.children
      .map((id) => nodes[id])
      .filter(Boolean)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    cur = latest.id;
  }
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

/** Plain text as shown to the user (topic block stripped) for API context. */
function assistantPlainTextForModel(raw) {
  const { content } = splitTopicFromContent(raw || '');
  return stripTopicBlockForDisplay(content);
}

/**
 * Pull a window around the highlighted substring so the model sees local
 * context even when the selection is a broken fragment vs. stored markdown.
 */
function excerptWindowAroundSelection(plain, quote, radius = 220) {
  if (!plain || !quote) return null;
  const q = quote.trim();
  if (!q) return null;

  let idx = plain.indexOf(q);
  let matchLen = q.length;

  if (idx === -1) {
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    const pattern = parts.map(escapeRe).join('\\s+');
    const re = new RegExp(pattern, 'im');
    const m = plain.match(re);
    if (!m || m.index === undefined) return null;
    idx = m.index;
    matchLen = m[0].length;
  }

  const start = Math.max(0, idx - radius);
  const end = Math.min(plain.length, idx + matchLen + radius);
  let slice = plain.slice(start, end).trim();
  if (start > 0) slice = `…${slice}`;
  if (end < plain.length) slice = `${slice}…`;
  return slice;
}

/**
 * User message for highlight-to-branch: anchor the excerpt in the assistant's
 * prior reply and optionally include surrounding text from that reply.
 */
function withSelectionQuote(text, selectionQuote, sourceAssistantPlain = null) {
  if (!selectionQuote) return text || '';
  let ref =
    'Context for that earlier follow-up:\n' +
    `Referenced text: """${selectionQuote}"""`;
  const win = sourceAssistantPlain
    ? excerptWindowAroundSelection(sourceAssistantPlain, selectionQuote)
    : null;
  if (win) {
    ref += `\nNearby context:\n${win}`;
  }
  return text ? `${text}\n\n${ref}` : ref;
}

function selectionSystemPrompt(selectionQuote, sourceAssistantPlain = null) {
  if (!selectionQuote) return null;
  let prompt =
    'Private context for this turn: the user is asking about the referenced text below. ' +
    'If their message says "this", "that", "it", or asks what something is, treat it as referring to the referenced text. ' +
    'If the referenced text is only part of a word or phrase, infer the complete concept from nearby context. ' +
    'Answer directly about that concept. Do not say you lack context when nearby context is present. ' +
    'Do not mention highlights, selections, snippets, excerpts, or your previous response unless the user explicitly asks.\n' +
    `Referenced excerpt: """${selectionQuote}"""`;
  const win = sourceAssistantPlain
    ? excerptWindowAroundSelection(sourceAssistantPlain, selectionQuote)
    : null;
  if (win) {
    prompt += `\nNearby context:\n${win}`;
  }
  return prompt;
}

/**
 * Convert path to messages array for a given provider.
 * When a node has images, build a multimodal content array.
 * When a node has selectionQuote, prepend it as a blockquote.
 */
function pathToMessages(path, provider = 'anthropic') {
  return path.map((n) => {
    const text =
      n.role === 'assistant'
        ? assistantPlainTextForModel(n.content)
        : withSelectionQuote(n.content, n.selectionQuote);
    if (n.images && n.images.length > 0) {
      if (provider === 'openai') {
        return {
          role: n.role,
          content: [
            ...n.images.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
            })),
            { type: 'text', text },
          ],
        };
      }
      return {
        role: n.role,
        content: [
          ...n.images.map((img) => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
          })),
          { type: 'text', text },
        ],
      };
    }
    return { role: n.role, content: text };
  });
}

// ─── Reducer ─────────────────────────────────────────────────────────

const ACTIONS = {
  SET_PROVIDER_KEYS:      'SET_PROVIDER_KEYS',
  SET_KEY_MODE:           'SET_KEY_MODE',
  SET_MODEL:              'SET_MODEL',
  ADD_NODE:               'ADD_NODE',
  SET_ACTIVE_LEAF:        'SET_ACTIVE_LEAF',
  STREAMING_START:        'STREAMING_START',
  STREAMING_CHUNK:        'STREAMING_CHUNK',
  STREAMING_DONE:         'STREAMING_DONE',
  STREAMING_ERROR:        'STREAMING_ERROR',
  RESET_CONVERSATION:     'RESET_CONVERSATION',
  SET_CONV_ID:            'SET_CONV_ID',
  LOAD_CONVERSATION:      'LOAD_CONVERSATION',
  ADD_SESSION_TOKENS:     'ADD_SESSION_TOKENS',
  ADD_SELECTION_BRANCH:   'ADD_SELECTION_BRANCH',
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
  keyMode: readKeyMode(),
  sessionTokensUsed: 0,
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

    case ACTIONS.SET_KEY_MODE: {
      saveKeyMode(action.payload);
      return { ...state, keyMode: action.payload, sessionTokensUsed: 0 };
    }

    case ACTIONS.ADD_SESSION_TOKENS:
      return { ...state, sessionTokensUsed: state.sessionTokensUsed + action.payload };

    case ACTIONS.SET_MODEL:
      return { ...state, model: action.payload };

    case ACTIONS.ADD_NODE: {
      const { node, parentId, preserveActiveLeaf = false } = action.payload;
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
        // When branching from a split panel we don't want to move the main
        // panel's active leaf — the caller tracks its own leaf separately.
        activeLeafId: preserveActiveLeaf ? state.activeLeafId : node.id,
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

    case ACTIONS.ADD_SELECTION_BRANCH: {
      const { nodeId, branch } = action.payload;
      const target = state.nodes[nodeId];
      if (!target) return state;
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [nodeId]: {
            ...target,
            selectionBranches: [...(target.selectionBranches || []), branch],
          },
        },
      };
    }

    case ACTIONS.RESET_CONVERSATION:
      return {
        ...initialState,
        anthropicApiKey: state.anthropicApiKey,
        openaiApiKey: state.openaiApiKey,
        keyMode: state.keyMode,
        model: state.model,
        sessionTokensUsed: 0,
      };

    case ACTIONS.SET_CONV_ID:
      return { ...state, firestoreConvId: action.payload };

    case ACTIONS.LOAD_CONVERSATION: {
      const { nodes, rootId, activeLeafId, firestoreConvId } = action.payload;
      return {
        ...initialState,
        anthropicApiKey: state.anthropicApiKey,
        openaiApiKey: state.openaiApiKey,
        keyMode: state.keyMode,
        model: state.model,
        sessionTokensUsed: 0,
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
  const { tokenLimit, isPremium } = useAuth();
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

  const setKeyMode = useCallback((mode) => {
    dispatch({ type: ACTIONS.SET_KEY_MODE, payload: mode });
  }, []);

  const setModel = useCallback((model) => {
    dispatch({ type: ACTIONS.SET_MODEL, payload: model });
  }, []);

  /**
   * @param {string} content
   * @param {Array}  images
   * @param {{ fromNodeId?: string|null, onNodeCreated?: (id:string)=>void }} [opts]
   *   fromNodeId    – use this node as parent instead of activeLeafId; does NOT
   *                   change activeLeafId so the main panel is unaffected.
   *   onNodeCreated – called with each newly created node id (user then assistant)
   *                   so the caller can track its own leaf independently.
   */
  const sendMessage = useCallback(async (content, images = [], { fromNodeId = null, onNodeCreated = null, selectionQuote = null, selectionSourceNodeId = null } = {}) => {
    const hasContent = (content && content.trim()) || images.length > 0;
    if (!hasContent || state.isStreaming) return;

    if (isAtTokenLimit && state.keyMode !== 'api-keys') {
      dispatch({
        type: ACTIONS.STREAMING_ERROR,
        payload: `You've reached your monthly limit of ${tokenLimit.toLocaleString()} tokens on Grove credits. ${formatTokenLimitResetHint()} Use your own API key in settings to keep chatting, or wait until your allowance renews.`,
      });
      return;
    }

    const isLoggedIn = !!currentUser;
    const guestHasKey =
      hasAnthropicAccess({ isLoggedIn: false, anthropicApiKey: state.anthropicApiKey, keyMode: state.keyMode }) ||
      hasOpenaiAccess({ isLoggedIn: false, openaiApiKey: state.openaiApiKey, keyMode: state.keyMode });
    if (!isLoggedIn && !guestHasKey) {
      onRequireSignup?.();
      return;
    }

    const parentId = fromNodeId ?? state.activeLeafId;
    const preserveActiveLeaf = !!fromNodeId;
    const modelDef = MODELS.find((m) => m.id === state.model) || MODELS[0];
    const provider = modelDef.provider;

    // Strip previewUrl before storing (too large and not needed beyond the current session)
    const storedImages = images.map(({ mediaType, base64 }) => ({ mediaType, base64 }));

    // 1. Create + add user node
    const userNode = makeNode({ parentId, role: 'user', content: content.trim(), images: storedImages, selectionQuote, selectionSourceNodeId });
    dispatch({ type: ACTIONS.ADD_NODE, payload: { node: userNode, parentId, preserveActiveLeaf } });
    onNodeCreated?.(userNode.id);

    if (selectionQuote && selectionSourceNodeId) {
      dispatch({
        type: ACTIONS.ADD_SELECTION_BRANCH,
        payload: {
          nodeId: selectionSourceNodeId,
          branch: { id: nanoid(8), text: selectionQuote, childNodeId: userNode.id },
        },
      });
    }

    // 2. Persist to Firestore if logged in (images omitted — base64 data too large)
    const convId = await ensureConversation(content.trim() || '(image)');
    await saveMessageToFirestore(convId, userNode);

    // 3. Build conversation context with provider-specific multimodal format
    const historyPath = parentId ? getPath(state.nodes, parentId) : [];

    const sourceNode = selectionSourceNodeId ? state.nodes[selectionSourceNodeId] : null;
    const sourceAssistantPlain = sourceNode?.role === 'assistant'
      ? assistantPlainTextForModel(sourceNode.content)
      : null;
    const turnSystemPrompt = selectionQuote
      ? selectionSystemPrompt(selectionQuote, sourceAssistantPlain)
      : null;

    const modelText = content.trim();

    const userContent = storedImages.length > 0
      ? provider === 'openai'
        ? [
            ...storedImages.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
            })),
            { type: 'text', text: modelText || '' },
          ]
        : [
            ...storedImages.map((img) => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
            })),
            { type: 'text', text: modelText || '' },
          ]
      : modelText;

    const messages = [
      ...pathToMessages(historyPath, provider),
      { role: 'user', content: userContent },
    ];

    // 4. Create placeholder streaming node (assistant)
    const assistantNode = makeNode({ parentId: userNode.id, role: 'assistant', content: '', model: state.model });
    dispatch({ type: ACTIONS.ADD_NODE, payload: { node: assistantNode, parentId: userNode.id, preserveActiveLeaf } });
    onNodeCreated?.(assistantNode.id);
    dispatch({ type: ACTIONS.STREAMING_START, payload: { streamingNodeId: assistantNode.id } });

    const anthropicKey = effectiveAnthropicKey({
      isLoggedIn,
      anthropicApiKey: state.anthropicApiKey,
      keyMode: state.keyMode,
    });
    const openaiKey = effectiveOpenaiKey({
      isLoggedIn,
      openaiApiKey: state.openaiApiKey,
      keyMode: state.keyMode,
    });

    // 6. Stream response (route to correct provider)
    let accumulated = '';
    const streamFn = provider === 'openai'
      ? streamOpenAIMessage
      : streamMessage;

    const streamParams = provider === 'openai'
      ? { apiKey: openaiKey, model: state.model, messages, systemPrompt: turnSystemPrompt }
      : { apiKey: anthropicKey, model: state.model, messages, systemPrompt: turnSystemPrompt };

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
        // Record token usage
        const totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
        if (state.keyMode === 'api-keys') {
          // Track locally for the session display; don't bill against Grove credits
          if (totalTokens > 0) {
            dispatch({ type: ACTIONS.ADD_SESSION_TOKENS, payload: totalTokens });
          }
        } else if (currentUser && totalTokens > 0 && addTokenUsage) {
          await addTokenUsage(totalTokens);
        }
      },
      onError: (err) => {
        dispatch({ type: ACTIONS.STREAMING_ERROR, payload: err.message || String(err) });
      },
    });

    abortRef.current = abort;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeLeafId, state.isStreaming, state.nodes, state.anthropicApiKey, state.openaiApiKey, state.model, state.keyMode, state.firestoreConvId, currentUser, isAtTokenLimit, tokenLimit, addTokenUsage, onRequireSignup]);

  /**
   * Branch from an assistant node using a text selection as context.
   * Creates a new user+assistant turn as a child of `assistantNodeId`,
   * and records the selection highlight on that node so MessageBubble
   * can render a clickable mark.
   */
  /**
   * `highlightNodeId` is the node the user actually highlighted (where the visual
   * mark is stored). It defaults to `assistantNodeId` but differs when we branch
   * from a grandparent while still recording the highlight on the leaf.
   */
  /**
   * @param {string} assistantNodeId  – branch parent (assistant node)
   * @param {string} content          – user's prompt
   * @param {string} selectionText    – highlighted excerpt
   * @param {string|null} highlightNodeId – node that carries the visual mark
   * @param {{ preserveActiveLeaf?: boolean, onNodeCreated?: (id:string)=>void }} [opts]
   */
  const branchAndSend = useCallback(async (assistantNodeId, content, selectionText, highlightNodeId = null, { preserveActiveLeaf = false, onNodeCreated = null } = {}) => {
    if (!content?.trim() || state.isStreaming) return;

    if (isAtTokenLimit && state.keyMode !== 'api-keys') {
      dispatch({
        type: ACTIONS.STREAMING_ERROR,
        payload: `You've reached your monthly limit of ${tokenLimit.toLocaleString()} tokens on Grove credits. ${formatTokenLimitResetHint()} Use your own API key in settings to keep chatting, or wait until your allowance renews.`,
      });
      return;
    }

    const isLoggedIn = !!currentUser;
    const guestHasKey =
      hasAnthropicAccess({ isLoggedIn: false, anthropicApiKey: state.anthropicApiKey, keyMode: state.keyMode }) ||
      hasOpenaiAccess({ isLoggedIn: false, openaiApiKey: state.openaiApiKey, keyMode: state.keyMode });
    if (!isLoggedIn && !guestHasKey) {
      onRequireSignup?.();
      return;
    }

    const parentId = assistantNodeId;
    const modelDef = MODELS.find((m) => m.id === state.model) || MODELS[0];
    const provider = modelDef.provider;

    const userNode = makeNode({
      parentId,
      role: 'user',
      content: content.trim(),
      images: [],
      selectionQuote: selectionText,
      selectionSourceNodeId: highlightNodeId ?? assistantNodeId,
    });
    dispatch({ type: ACTIONS.ADD_NODE, payload: { node: userNode, parentId, preserveActiveLeaf } });
    onNodeCreated?.(userNode.id);

    dispatch({
      type: ACTIONS.ADD_SELECTION_BRANCH,
      payload: {
        nodeId: highlightNodeId ?? assistantNodeId,
        branch: { id: nanoid(8), text: selectionText, childNodeId: userNode.id },
      },
    });

    const convId = await ensureConversation(content.trim());
    await saveMessageToFirestore(convId, userNode);

    // When branching from the leaf, parentId is the grandparent (for tree
    // structure) but the model needs the full conversation up to the node
    // the user actually highlighted, otherwise it has no context for the
    // selected excerpt.
    const contextNodeId = highlightNodeId ?? parentId;
    const highlightSource = state.nodes[contextNodeId];
    const sourceAssistantPlain =
      highlightSource?.role === 'assistant'
        ? assistantPlainTextForModel(highlightSource.content)
        : null;

    const historyPath = getPath(state.nodes, contextNodeId);
    const messages = [
      ...pathToMessages(historyPath, provider),
      {
        role: 'user',
        content: content.trim(),
      },
    ];
    const turnSystemPrompt = selectionSystemPrompt(selectionText, sourceAssistantPlain);

    const assistantNode = makeNode({ parentId: userNode.id, role: 'assistant', content: '', model: state.model });
    dispatch({ type: ACTIONS.ADD_NODE, payload: { node: assistantNode, parentId: userNode.id, preserveActiveLeaf } });
    onNodeCreated?.(assistantNode.id);
    dispatch({ type: ACTIONS.STREAMING_START, payload: { streamingNodeId: assistantNode.id } });

    const anthropicKey = effectiveAnthropicKey({ isLoggedIn, anthropicApiKey: state.anthropicApiKey, keyMode: state.keyMode });
    const openaiKey = effectiveOpenaiKey({ isLoggedIn, openaiApiKey: state.openaiApiKey, keyMode: state.keyMode });

    let accumulated = '';
    const streamFn = provider === 'openai' ? streamOpenAIMessage : streamMessage;
    const streamParams = provider === 'openai'
      ? { apiKey: openaiKey, model: state.model, messages, systemPrompt: turnSystemPrompt }
      : { apiKey: anthropicKey, model: state.model, messages, systemPrompt: turnSystemPrompt };

    const { abort } = await streamFn({
      ...streamParams,
      onChunk: (chunk) => {
        accumulated += chunk;
        dispatch({ type: ACTIONS.STREAMING_CHUNK, payload: chunk });
      },
      onDone: async (usage = {}) => {
        dispatch({ type: ACTIONS.STREAMING_DONE, payload: { id: assistantNode.id, content: accumulated } });
        const { content: cleanContent } = splitTopicFromContent(accumulated);
        await saveMessageToFirestore(convId, { ...assistantNode, content: cleanContent });
        const totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
        if (state.keyMode === 'api-keys') {
          if (totalTokens > 0) dispatch({ type: ACTIONS.ADD_SESSION_TOKENS, payload: totalTokens });
        } else if (currentUser && totalTokens > 0 && addTokenUsage) {
          await addTokenUsage(totalTokens);
        }
      },
      onError: (err) => {
        dispatch({ type: ACTIONS.STREAMING_ERROR, payload: err.message || String(err) });
      },
    });

    abortRef.current = abort;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isStreaming, state.nodes, state.anthropicApiKey, state.openaiApiKey, state.model, state.keyMode, state.firestoreConvId, currentUser, isAtTokenLimit, tokenLimit, addTokenUsage, onRequireSignup]);

  const branchFrom = useCallback((nodeId) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_LEAF, payload: nodeId });
  }, []);

  const navigateToBranchFrom = useCallback((childNodeId) => {
    const leafId = deepestLeaf(state.nodes, childNodeId);
    dispatch({ type: ACTIONS.SET_ACTIVE_LEAF, payload: leafId });
  }, [state.nodes]);

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
    const hasA = hasAnthropicAccess({ isLoggedIn, anthropicApiKey: state.anthropicApiKey, keyMode: state.keyMode });
    const hasO = hasOpenaiAccess({ isLoggedIn, openaiApiKey: state.openaiApiKey, keyMode: state.keyMode });
    const usable = (m) =>
      (m.tier !== 'blocked' || isPremium) &&
      ((m.provider === 'anthropic' && hasA) || (m.provider === 'openai' && hasO));
    const current = MODELS.find((m) => m.id === state.model);
    if (current && usable(current)) return;
    const next = MODELS.find(usable);
    if (next) dispatch({ type: ACTIONS.SET_MODEL, payload: next.id });
  }, [currentUser, state.anthropicApiKey, state.openaiApiKey, state.keyMode, state.model, isPremium]);

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
        id:                    data.id,
        parentId:              data.parentId ?? null,
        role:                  data.role,
        content:               data.content,
        model:                 data.model ?? null,
        topicLabel:            data.topicLabel ?? undefined,
        selectionQuote:        data.selectionQuote ?? null,
        selectionSourceNodeId: data.selectionSourceNodeId ?? null,
        timestamp:             data.timestamp,
        children:              [],
        branchLabel:           branchLabel(data.content || ''),
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
    keyMode: state.keyMode,
    sessionTokensUsed: state.sessionTokensUsed,
    error: state.error,
    firestoreConvId: state.firestoreConvId,
    getActivePath,
    setProviderKeys,
    setKeyMode,
    setModel,
    sendMessage,
    branchAndSend,
    branchFrom,
    navigateToBranchFrom,
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

export { getPath, deepestLeaf };
