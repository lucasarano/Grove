export function readStoredProviderKeys() {
  const legacy = localStorage.getItem('grove_api_key');
  let anthropic = localStorage.getItem('grove_anthropic_api_key') || '';
  if (!anthropic && legacy) {
    anthropic = legacy;
    localStorage.setItem('grove_anthropic_api_key', legacy);
  }
  const openai = localStorage.getItem('grove_openai_api_key') || '';
  return { anthropicApiKey: anthropic, openaiApiKey: openai };
}

/** 'credits' = use Grove's hosted key; 'api-keys' = always use the user's own key */
export function readKeyMode() {
  return localStorage.getItem('grove_key_mode') || 'credits';
}
export function saveKeyMode(mode) {
  localStorage.setItem('grove_key_mode', mode);
}

/**
 * Resolve which API keys are actually used for requests.
 * When keyMode === 'api-keys' logged-in users bypass the env key and use their own.
 */
export function effectiveAnthropicKey({ isLoggedIn, anthropicApiKey, keyMode = 'credits' }) {
  const env = (import.meta.env.VITE_ANTHROPIC_API_KEY || '').trim();
  const local = (anthropicApiKey || '').trim();
  if (isLoggedIn && keyMode === 'credits') return env || local;
  return local;
}

export function effectiveOpenaiKey({ isLoggedIn, openaiApiKey, keyMode = 'credits' }) {
  const env = (import.meta.env.VITE_OPENAI_API_KEY || '').trim();
  const local = (openaiApiKey || '').trim();
  if (isLoggedIn && keyMode === 'credits') return env || local;
  return local;
}

export function hasAnthropicAccess(ctx) {
  return !!effectiveAnthropicKey(ctx);
}

export function hasOpenaiAccess(ctx) {
  return !!effectiveOpenaiKey(ctx);
}

export function guestHasAnyProviderKey() {
  const { anthropicApiKey, openaiApiKey } = readStoredProviderKeys();
  return (
    hasAnthropicAccess({ isLoggedIn: false, anthropicApiKey }) ||
    hasOpenaiAccess({ isLoggedIn: false, openaiApiKey })
  );
}
