import OpenAI from 'openai';
import { TOPIC_END, TOPIC_START } from '../lib/topicMetadata.js';

function getClient(apiKey) {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

const OPENAI_SYSTEM_PROMPT = `You are Grove, a helpful AI assistant for branching conversations so users can explore topics without losing prior context.

When you finish your main answer, you MUST append exactly one metadata block at the very end of your reply (after all other text). Nothing may follow this block. Use this exact delimiter format:
${TOPIC_START}A short topic label for this turn only — what this exchange is about (max 12 words, plain text, no line breaks)${TOPIC_END}

The topic label is shown in a compact conversation tree; keep it specific and readable.`;

/**
 * Stream an OpenAI response.
 */
async function streamOpenAIMessage({ apiKey, model, messages, onChunk, onDone, onError }) {
  const client = getClient(apiKey);
  const abortController = new AbortController();

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: OPENAI_SYSTEM_PROMPT },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: abortController.signal }
    );

    (async () => {
      try {
        let usage = null;
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) onChunk(text);
          if (chunk.usage) usage = chunk.usage;
        }
        onDone({
          inputTokens:  usage?.prompt_tokens     ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
        });
      } catch (err) {
        if (err.name !== 'AbortError') onError(err);
      }
    })();
  } catch (err) {
    onError(err);
  }

  return { abort: () => abortController.abort() };
}

export { streamOpenAIMessage };
