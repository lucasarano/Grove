# Grove

Grove is a branching AI chat workspace for exploring ideas without losing the path that got you there. Instead of one linear transcript, conversations become a tree: you can branch from an answer, highlight a specific passage to ask a follow-up, and compare different branches side by side.

![Grove preview](grove-app/public/og-image.png)

## What It Does

- Branch from any assistant reply while keeping the original thread intact.
- Highlight text inside an answer and start a focused follow-up from that exact passage.
- View the conversation tree and jump between paths.
- Compare branches in a split chat panel.
- Use hosted Grove credits for signed-in users, with OpenAI and Anthropic keys kept on the server.
- Bring your own provider keys locally in the browser when you do not want to use Grove credits.
- Sign in with Firebase Auth and store user conversations in Firestore.
- Manage Premium access through Stripe Checkout and the Stripe customer portal.

## Tech Stack

- React 19 and Vite
- Firebase Auth, Firestore, Analytics, and Cloud Functions
- OpenAI and Anthropic model APIs
- Stripe Billing
- Vercel for the Vite frontend

## Repository Layout

```text
.
+-- grove-app/                 # React app, Firebase config, functions, and deploy config
|   +-- functions/             # Firebase Cloud Functions for AI proxying and Stripe billing
|   +-- public/                # Static assets
|   +-- scripts/               # Local safety checks
|   +-- src/                   # React application source
+-- .github/workflows/         # CI checks
+-- SECURITY.md                # Secret-handling guidance
+-- README.md
```

## Local Setup

Requirements:

- Node.js 22.12 or newer
- npm
- Firebase CLI, if you plan to deploy functions or rules
- A Firebase project
- OpenAI, Anthropic, and Stripe accounts for production hosted credits and billing

Install dependencies:

```sh
cd grove-app
npm install
npm install --prefix functions
```

Create local environment config:

```sh
cp .env.example .env
```

Fill in the Firebase web app values in `.env`:

```sh
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

Run the app:

```sh
npm run dev
```

## Firebase Setup

1. Create a Firebase project.
2. Add a web app and copy the public client config into `grove-app/.env`.
3. Enable Firebase Auth providers used by the app, at minimum email/password. Enable Google sign-in if you want the Google button to work.
4. Create a Firestore database.
5. Deploy rules and indexes from `grove-app`:

```sh
firebase deploy --only firestore
```

For hosted Grove credits and billing, set Firebase Functions secrets:

```sh
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Deploy functions:

```sh
firebase deploy --only functions
```

## Stripe Setup

The functions expect Stripe secrets in Firebase Secret Manager and use hosted Stripe flows:

- `createCheckoutSession` starts a subscription checkout.
- `createPortalSession` opens the Stripe customer portal.
- `stripeWebhook` processes subscription lifecycle events.

After deploying functions, register the deployed `stripeWebhook` URL in the Stripe dashboard and use the same webhook signing secret for `STRIPE_WEBHOOK_SECRET`.

The current Stripe price id is defined in `grove-app/functions/index.js` as `PRICE_ID`. Change it before deploying your own billing setup.

## Secret Safety

This repository is set up so local secrets are ignored by Git and excluded from deploy bundles:

- `.env`, `.env.*`, `.secret.local`
- service-account JSON files
- private key files such as `.pem`, `.key`, `.p8`, `.p12`

Run the scanner before publishing or pushing:

```sh
cd grove-app
npm run secrets:check
```

The scanner checks current files and git history without printing secret values. GitHub Actions runs the same check on pushes and pull requests.

Important: `VITE_*` values are compiled into the browser bundle. Only public Firebase client config belongs there. OpenAI, Anthropic, Stripe, webhook, and service-account secrets must stay in Firebase Secret Manager or another server-side secret store.

Firebase web API keys are public identifiers in browser apps. Restrict them to your domains in Google Cloud and keep Firestore/Auth rules locked down.

## Scripts

From `grove-app`:

```sh
npm run dev             # Start the Vite dev server
npm run build           # Build the frontend
npm run preview         # Preview the production build
npm run lint            # Run ESLint
npm run secrets:check   # Scan tracked files and git history for secret-shaped values
```

Firebase Functions scripts live in `grove-app/functions/package.json`.

## Deployment

Frontend deployment is configured for Vercel:

```sh
cd grove-app
npm run deploy:preview
npm run deploy
```

Cloud Functions, Firestore rules, and Firestore indexes deploy through Firebase:

```sh
cd grove-app
firebase deploy --only functions,firestore
```

## Public Release Checklist

Before making the repository public:

1. Run `npm run secrets:check` from `grove-app`.
2. Confirm `.env` is not tracked with `git status --short`.
3. Restrict Firebase web API keys to approved domains in Google Cloud.
4. Rotate any provider, Stripe, Firebase, or service-account key that was ever committed or shared.
5. Add a license if you want others to use, modify, or redistribute the code.

## License

No open-source license has been selected yet. Until a license is added, all rights are reserved by default.
