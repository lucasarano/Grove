const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');

initializeApp();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const openaiApiKey = defineSecret('OPENAI_API_KEY');
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const PRICE_ID = 'price_1TLpKT7mlLE0rLbZGBPNon2f';
const STRIPE_API_VERSION = '2026-01-28.clover';
const FREE_TOKEN_LIMIT = 30_000;
const PREMIUM_TOKEN_LIMIT = 400_000;
const ANTHROPIC_VERSION = '2023-06-01';

const AI_MODELS = {
  'claude-haiku-4-5':  { provider: 'anthropic', tier: 'free' },
  'gpt-5.4-mini':      { provider: 'openai',    tier: 'free' },
  'claude-sonnet-4-5': { provider: 'anthropic', tier: 'premium' },
  'claude-opus-4-5':   { provider: 'anthropic', tier: 'premium' },
  'gpt-5.4':           { provider: 'openai',    tier: 'premium' },
};
const ALLOWED_BROWSER_ORIGINS = new Set([
  'https://www.thegrovelab.com',
  'https://thegrovelab.com',
  'https://grove-ai-app.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function calendarMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function tokenLimitFor(isPremium) {
  return isPremium ? PREMIUM_TOKEN_LIMIT : FREE_TOKEN_LIMIT;
}

function currentMonthlyTokens(data, monthKey) {
  if (!data) return 0;
  const storedMonth = data.tokenUsageMonth;
  if (storedMonth === undefined || storedMonth === monthKey) {
    return data.tokensUsed ?? 0;
  }
  return 0;
}

function isAllowedBrowserOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_BROWSER_ORIGINS.has(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('-grove-ai.vercel.app');
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.get('origin') || '*';
  if (!isAllowedBrowserOrigin(req.get('origin'))) return false;
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Vary', 'Origin');
  return true;
}

function sendJsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

async function requireFirebaseUser(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, 'Sign in to use Grove credits.');
  }
  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, 'Your sign-in expired. Please sign in again.');
  }
}

async function assertCreditAccess(uid, provider, modelId) {
  const model = AI_MODELS[modelId];
  if (!model || model.provider !== provider) {
    throw new HttpError(400, 'Unsupported model.');
  }

  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpError(403, 'User account is not initialized.');
  }

  const data = snap.data() || {};
  const isPremium = data.isPremium === true;
  if (model.tier === 'premium' && !isPremium) {
    throw new HttpError(403, 'Upgrade to use this model.');
  }

  const used = currentMonthlyTokens(data, calendarMonthKey());
  if (used >= tokenLimitFor(isPremium)) {
    throw new HttpError(429, 'Monthly Grove-credit token limit reached.');
  }

  return { isPremium };
}

async function recordTokenUsage(uid, count) {
  if (!count || count < 0) return;

  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const monthKey = calendarMonthKey();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    const storedMonth = data.tokenUsageMonth;
    const previous = data.tokensUsed ?? 0;
    if (storedMonth !== monthKey) {
      const carry = storedMonth === undefined ? previous : 0;
      transaction.update(userRef, { tokenUsageMonth: monthKey, tokensUsed: carry + count });
    } else {
      transaction.update(userRef, { tokensUsed: previous + count });
    }
  });
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

async function readSseBody(body, onEvent) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    for (;;) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match) break;
      const raw = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (raw.trim()) onEvent(parseSseEvent(raw));
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) onEvent(parseSseEvent(buffer));
}

async function streamOpenAI({ res, model, messages, systemPrompt }) {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt || '' },
        ...messages,
      ],
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    throw new HttpError(response.status, 'OpenAI request failed.');
  }

  await readSseBody(response.body, ({ data }) => {
    if (!data || data === '[DONE]') return;
    const payload = JSON.parse(data);
    const text = payload.choices?.[0]?.delta?.content || '';
    if (text) writeSse(res, 'chunk', { text });
    if (payload.usage) {
      usage.inputTokens = payload.usage.prompt_tokens ?? usage.inputTokens;
      usage.outputTokens = payload.usage.completion_tokens ?? usage.outputTokens;
    }
  });

  return usage;
}

async function streamAnthropic({ res, model, messages, systemPrompt }) {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey.value(),
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt || undefined,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new HttpError(response.status, 'Anthropic request failed.');
  }

  await readSseBody(response.body, ({ event, data }) => {
    if (!data) return;
    const payload = JSON.parse(data);
    if (event === 'message_start') {
      usage.inputTokens = payload.message?.usage?.input_tokens ?? usage.inputTokens;
    } else if (event === 'content_block_delta' && payload.delta?.type === 'text_delta') {
      if (payload.delta.text) writeSse(res, 'chunk', { text: payload.delta.text });
    } else if (event === 'message_delta') {
      usage.outputTokens = payload.usage?.output_tokens ?? usage.outputTokens;
    } else if (event === 'error') {
      throw new Error(payload.error?.message || 'Anthropic stream failed.');
    }
  });

  return usage;
}

/**
 * Authenticated streaming proxy for Grove-credit AI calls.
 * Provider API keys stay in Firebase Secret Manager and never enter the browser bundle.
 */
exports.streamAIMessage = onRequest(
  {
    secrets: [openaiApiKey, anthropicApiKey],
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (req, res) => {
    if (!applyCors(req, res)) {
      return sendJsonError(res, 403, 'Origin not allowed.');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }
    if (req.method !== 'POST') {
      return sendJsonError(res, 405, 'Method Not Allowed');
    }

    let uid;
    try {
      const decoded = await requireFirebaseUser(req);
      uid = decoded.uid;

      const { provider, model, messages, systemPrompt } = parseJsonBody(req);
      if (!['anthropic', 'openai'].includes(provider)) {
        throw new HttpError(400, 'Unsupported provider.');
      }
      if (!Array.isArray(messages)) {
        throw new HttpError(400, 'Missing messages.');
      }

      await assertCreditAccess(uid, provider, model);

      setSseHeaders(res);

      const usage = provider === 'openai'
        ? await streamOpenAI({ res, model, messages, systemPrompt })
        : await streamAnthropic({ res, model, messages, systemPrompt });

      const totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
      await recordTokenUsage(uid, totalTokens);
      writeSse(res, 'done', usage);
      return res.end();
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError
        ? err.message
        : 'Unable to stream AI response.';

      console.error('[grove] streamAIMessage failed:', err);
      if (res.headersSent) {
        writeSse(res, 'error', { message });
        return res.end();
      }
      return sendJsonError(res, status, message);
    }
  }
);

/**
 * Creates a Stripe Checkout Session for the authenticated user.
 * Called client-side via httpsCallable; returns { url }.
 * The frontend redirects to this URL to complete payment on Stripe's hosted page.
 */
exports.createCheckoutSession = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to upgrade.');
    }

    const { uid, email } = request.auth.token;
    const origin = (request.data?.origin || '').replace(/\/$/, '');

    if (!origin) {
      throw new HttpsError('invalid-argument', 'Missing origin.');
    }

    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: STRIPE_API_VERSION });

    // Check if user already has an active subscription to avoid duplicates
    const db = getFirestore();
    const userSnap = await db.doc(`users/${uid}`).get();
    if (userSnap.exists && userSnap.data()?.isPremium) {
      throw new HttpsError('already-exists', 'You already have an active Premium subscription.');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${origin}?checkout=success`,
      cancel_url: `${origin}?checkout=cancel`,
      client_reference_id: uid,
      customer_email: email,
      metadata: { firebaseUID: uid },
      subscription_data: {
        metadata: { firebaseUID: uid },
      },
    });

    return { url: session.url };
  }
);

/**
 * Creates a Stripe Customer Portal session for the signed-in Premium user.
 * The portal is where subscribers update payment methods and cancel the subscription.
 */
exports.createCustomerPortalSession = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const { uid } = request.auth.token;
    const origin = (request.data?.origin || '').replace(/\/$/, '');

    if (!origin) {
      throw new HttpsError('invalid-argument', 'Missing origin.');
    }

    const db = getFirestore();
    const userSnap = await db.doc(`users/${uid}`).get();
    const data = userSnap.data() || {};

    if (!data.isPremium) {
      throw new HttpsError('failed-precondition', 'No active Premium subscription.');
    }

    const customerId = data.stripeCustomerId;
    if (!customerId || typeof customerId !== 'string') {
      throw new HttpsError(
        'failed-precondition',
        'No Stripe billing profile on file. Please contact support if you believe this is an error.',
      );
    }

    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: STRIPE_API_VERSION });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin,
    });

    return { url: session.url };
  }
);

/**
 * Stripe webhook endpoint — verifies signature and processes subscription events.
 * Register this URL in the Stripe dashboard:
 *   https://dashboard.stripe.com/webhooks
 * Events to enable:
 *   - checkout.session.completed
 *   - customer.subscription.deleted
 *   - invoice.payment_failed
 */
exports.stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).send('Missing stripe-signature header');
    }

    const stripe = new Stripe(stripeSecretKey.value(), { apiVersion: STRIPE_API_VERSION });

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret.value());
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = getFirestore();

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const uid = session.client_reference_id;

          if (uid && session.payment_status === 'paid') {
            await db.doc(`users/${uid}`).update({
              isPremium: true,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              premiumSince: FieldValue.serverTimestamp(),
            });
            console.log(`[grove] User ${uid} upgraded to Premium`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const snap = await db
            .collection('users')
            .where('stripeCustomerId', '==', subscription.customer)
            .limit(1)
            .get();

          if (!snap.empty) {
            await snap.docs[0].ref.update({ isPremium: false });
            console.log(`[grove] Subscription cancelled for customer ${subscription.customer}`);
          }
          break;
        }

        case 'invoice.payment_failed': {
          console.warn(`[grove] Payment failed for customer ${event.data.object.customer}`);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[grove] Error processing webhook event:', err);
      return res.status(500).send('Internal error processing event');
    }

    res.json({ received: true });
  }
);
