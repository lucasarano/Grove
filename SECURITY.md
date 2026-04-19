# Security

## Secret handling

Never commit `.env`, `.env.*`, Firebase `.secret.local`, service-account JSON,
private keys, or provider credentials.

`VITE_*` variables are compiled into the browser bundle. Only public Firebase
client config and non-secret client settings belong in `VITE_*` values. Do not
store OpenAI, Anthropic, Stripe, webhook, or service-account secrets in Vite env
variables.

Firebase web API keys may appear in the production browser bundle. Treat them as
public identifiers: restrict them to the app's domains in Google Cloud, keep
Firestore/Auth rules locked down, and do not commit generated `dist` output.

Provider and billing credentials belong in Firebase Secret Manager:

```sh
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Before publishing or pushing changes, run:

```sh
cd grove-app
npm run secrets:check
```

This checks tracked files and git history without printing secret values. If it
flags a real key, rotate that key before making the repository public. Removing
the value from the latest commit is not enough if it was committed earlier.
