# Grove

Grove is a branching AI chat workspace for exploring ideas without losing the path that got you there. Instead of one linear transcript, conversations become a tree: branch from an answer, ask a follow-up about a highlighted passage, and compare different paths side by side.

![Grove preview](grove-app/public/og-image.png)

## Features

- Branch from any assistant reply while keeping the original thread intact.
- Highlight text inside an answer and start a focused follow-up from that passage.
- View the conversation tree and jump between paths.
- Compare branches in a split chat panel.
- Use hosted Grove credits for signed-in users, with OpenAI and Anthropic keys kept server-side.
- Bring your own provider keys in the browser when you do not want to use hosted credits.
- Sign in with Firebase Auth and store conversations in Firestore.

## Stack

- React 19
- Vite
- Firebase Auth, Firestore, Analytics, and Cloud Functions
- OpenAI and Anthropic APIs
- Vercel frontend deployment

## Project Structure

```text
.
+-- grove-app/
|   +-- functions/     # Firebase Cloud Functions
|   +-- public/        # Static assets
|   +-- scripts/       # Local safety checks
|   +-- src/           # React app
+-- .github/workflows/ # CI checks
+-- SECURITY.md
+-- LICENSE
+-- README.md
```

## Setup

Requirements:

- Node.js 22.12 or newer
- npm
- Firebase CLI, if you plan to deploy functions or Firestore rules
- A Firebase project
- OpenAI and Anthropic API keys for hosted model access

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

## Firebase

1. Create a Firebase project.
2. Add a web app and copy the public client config into `grove-app/.env`.
3. Enable the Auth providers you want to use. Email/password is the baseline; Google sign-in is optional.
4. Create a Firestore database.
5. Deploy rules and indexes from `grove-app`:

```sh
firebase deploy --only firestore
```

Set server-side provider secrets for hosted Grove credits:

```sh
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
```

Deploy functions:

```sh
firebase deploy --only functions
```

## Secret Safety

Local secrets are ignored by Git and excluded from deploy bundles:

- `.env`, `.env.*`, `.secret.local`
- service-account JSON files
- private key files such as `.pem`, `.key`, `.p8`, `.p12`

Run the scanner before publishing or pushing:

```sh
cd grove-app
npm run secrets:check
```

The scanner checks current files and git history without printing secret values. GitHub Actions runs the same check on pushes and pull requests.

Only public Firebase client config belongs in `VITE_*` variables. OpenAI, Anthropic, service-account, and other server credentials must stay in Firebase Secret Manager or another server-side secret store.

Firebase web API keys are public identifiers in browser apps. Restrict them to your domains in Google Cloud and keep Firestore/Auth rules locked down.

## Scripts

From `grove-app`:

```sh
npm run dev             # Start the Vite dev server
npm run build           # Build the frontend
npm run preview         # Preview the production build
npm run lint            # Run ESLint
npm run secrets:check   # Scan files and git history for secret-shaped values
```

## Deployment

Frontend deployment is configured for Vercel:

```sh
cd grove-app
npm run deploy:preview
npm run deploy
```

Firebase resources deploy through the Firebase CLI:

```sh
cd grove-app
firebase deploy --only functions,firestore
```

## License

MIT
