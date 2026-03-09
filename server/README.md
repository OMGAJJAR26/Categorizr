# Categorizr Backend

Express server for chat and integrations (QuickBooks, Xero, FreshBooks, Sage Intacct).

## Setup

```bash
npm install
cp env.example .env
# Edit .env with your keys and FRONTEND_URL
npm run dev
```

## Deploy

- **Railway / Render / Fly.io**: Connect this repo, set env vars, use `npm start`.
- **Vercel**: Use a serverless adapter or deploy the API routes separately; main app is usually frontend on Vercel + this backend elsewhere.

See project root `SPLIT_AND_DEPLOY.md` for full split-repo and deploy steps.
