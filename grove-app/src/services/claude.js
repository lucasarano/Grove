import Anthropic from '@anthropic-ai/sdk';
import { TOPIC_END, TOPIC_START } from '../lib/topicMetadata.js';

// We build a new client per request so the key can be changed at runtime
function getClient(apiKey) {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

// tier: 'free' = available to signed-in users at no charge
//       'blocked' = premium only (shown but disabled for free users)
const MODELS = [
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  provider: 'anthropic', tier: 'free'    },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'anthropic', tier: 'free'    },
  { id: 'gpt-4.1-mini',      label: 'GPT 5.2 Mini',      provider: 'openai',    tier: 'free'    },
  { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5',   provider: 'anthropic', tier: 'blocked' },
  { id: 'gpt-4.1',           label: 'GPT 5.4',           provider: 'openai',    tier: 'blocked' },
];

const DEFAULT_MODEL = MODELS[0].id;

const DEFAULT_SYSTEM_PROMPT = `You are Grove, a helpful AI assistant for branching conversations so users can explore topics without losing prior context.

When you finish your main answer, you MUST append exactly one metadata block at the very end of your reply (after all other text). Nothing may follow this block. Use this exact delimiter format:
${TOPIC_START}A short topic label for this turn only — what this exchange is about (max 12 words, plain text, no line breaks)${TOPIC_END}

The topic label is shown in a compact conversation tree; keep it specific and readable.`;

function composeSystemPrompt(systemPrompt) {
  return systemPrompt
    ? `${DEFAULT_SYSTEM_PROMPT}\n\n${systemPrompt}`
    : DEFAULT_SYSTEM_PROMPT;
}

/**
 * Stream a claude response.
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {{ role: 'user'|'assistant', content: string }[]} params.messages
 * @param {string} [params.systemPrompt]
 * @param {(chunk: string) => void} params.onChunk
 * @param {() => void} params.onDone
 * @param {(err: Error) => void} params.onError
 * @returns {{ abort: () => void }}
 */
/**
 * Anthropic's Messages API requires the `messages` array to start with a
 * `user` turn. Grove threads often begin with an assistant greeting; without
 * this, the leading assistant message is dropped or mishandled and the model
 * loses prior context (including highlight-to-branch turns).
 */
function ensureAnthropicMessagesStartWithUser(messages) {
  if (!messages?.length || messages[0].role === 'user') return messages;
  return [
    {
      role: 'user',
      content:
        '[This thread began with the assistant message below; treat it as prior context.]',
    },
    ...messages,
  ];
}

async function streamMessage({ apiKey, model, messages, systemPrompt, onChunk, onDone, onError }) {
  const client = getClient(apiKey);

  const abortController = new AbortController();

  try {
    const stream = client.messages.stream({
      model: model || DEFAULT_MODEL,
      max_tokens: 4096,
      system: composeSystemPrompt(systemPrompt),
      messages: ensureAnthropicMessagesStartWithUser(messages),
    });

    stream.on('text', (text) => onChunk(text));

    stream.on('error', (err) => {
      if (err.name !== 'AbortError') onError(err);
    });

    stream.on('finalMessage', (message) => {
      onDone({
        inputTokens:  message.usage?.input_tokens  ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
      });
    });

    // Attach abort signal — Anthropic SDK doesn't expose signal directly,
    // but we can call stream.abort() which it supports.
    abortController.signal.addEventListener('abort', () => {
      try { stream.abort(); } catch { /* stream may already be closed */ }
    });
  } catch (err) {
    onError(err);
  }

  return { abort: () => abortController.abort() };
}

export { MODELS, DEFAULT_MODEL, streamMessage };
