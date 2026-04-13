const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');

initializeApp();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

const PRICE_ID = 'price_1TLpKT7mlLE0rLbZGBPNon2f';
const STRIPE_API_VERSION = '2026-01-28.clover';

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
