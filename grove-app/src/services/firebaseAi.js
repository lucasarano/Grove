import { app, auth } from '../lib/firebase';

function functionsOrigin() {
  const configured = import.meta.env.VITE_FIREBASE_FUNCTIONS_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return `https://us-central1-${app.options.projectId}.cloudfunctions.net`;
}

function parseSseEvent(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  return { event, data: data.join('\n') };
}

function consumeSseBuffer(buffer, onEvent) {
  let rest = buffer;
  for (;;) {
    const match = rest.match(/\r?\n\r?\n/);
    if (!match) return rest;
    const raw = rest.slice(0, match.index);
    rest = rest.slice(match.index + match[0].length);
    if (raw.trim()) onEvent(parseSseEvent(raw));
  }
}

async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    return data?.error || data?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function streamFirebaseAIMessage({
  provider,
  model,
  messages,
  systemPrompt,
  onChunk,
  onDone,
  onError,
}) {
  const abortController = new AbortController();

  (async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Sign in to use Grove credits.');
      }

      const token = await user.getIdToken();
      const response = await fetch(`${functionsOrigin()}/streamAIMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, model, messages, systemPrompt }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }
      if (!response.body) {
        throw new Error('AI stream did not return a response body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneReceived = false;

      const handleEvent = ({ event, data }) => {
        if (!data) return;
        const payload = JSON.parse(data);
        if (event === 'chunk') {
          onChunk(payload.text || '');
        } else if (event === 'done') {
          doneReceived = true;
          onDone({
            inputTokens: payload.inputTokens ?? 0,
            outputTokens: payload.outputTokens ?? 0,
          });
        } else if (event === 'error') {
          throw new Error(payload.message || 'AI stream failed.');
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = consumeSseBuffer(buffer, handleEvent);
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        handleEvent(parseSseEvent(buffer));
      }
      if (!doneReceived) {
        onDone({ inputTokens: 0, outputTokens: 0 });
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError(err);
    }
  })();

  return { abort: () => abortController.abort() };
}
