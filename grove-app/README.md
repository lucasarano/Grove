# Grove App

This folder contains the React/Vite frontend, Firebase configuration, Firestore rules, and Firebase Cloud Functions for Grove.

For the full project overview and setup instructions, see the repository README:

- [../README.md](../README.md)

## Common Commands

```sh
npm install
npm run dev
npm run build
npm run lint
npm run secrets:check
```

## Secrets

Never commit `.env`, provider API keys, service-account files, or private keys. Use `.env.example` for public Firebase client config shape only, and store provider secrets in Firebase Secret Manager.
