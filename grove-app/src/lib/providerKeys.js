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
 * Grove credits use Firebase Functions secrets, so no shared provider key is
 * returned to the browser. BYOK mode still uses the user's local key directly.
 */
export function effectiveAnthropicKey({ isLoggedIn, anthropicApiKey, keyMode = 'credits' }) {
  const local = (anthropicApiKey || '').trim();
  if (isLoggedIn && keyMode === 'credits') return '';
  return local;
}

export function effectiveOpenaiKey({ isLoggedIn, openaiApiKey, keyMode = 'credits' }) {
  const local = (openaiApiKey || '').trim();
  if (isLoggedIn && keyMode === 'credits') return '';
  return local;
}

export function hasAnthropicAccess(ctx) {
  return (ctx.isLoggedIn && (ctx.keyMode ?? 'credits') === 'credits') || !!effectiveAnthropicKey(ctx);
}

export function hasOpenaiAccess(ctx) {
  return (ctx.isLoggedIn && (ctx.keyMode ?? 'credits') === 'credits') || !!effectiveOpenaiKey(ctx);
}

export function guestHasAnyProviderKey() {
  const { anthropicApiKey, openaiApiKey } = readStoredProviderKeys();
  return (
    hasAnthropicAccess({ isLoggedIn: false, anthropicApiKey }) ||
    hasOpenaiAccess({ isLoggedIn: false, openaiApiKey })
  );
}
