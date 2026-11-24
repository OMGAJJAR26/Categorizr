# Categorizr

Receipt tracking web app: scan or add receipts, sort them into categories, merchants and payment
methods, and run summary / tax reports. This repository holds the web app and the small Node
service behind the chatbot and accounting integrations. The main account/receipt API is a separate
PHP backend (`https://categorizr.com/emailserver`) that this repo only calls.

## What is in the repo

| Folder | What it is |
| --- | --- |
| `Frontend/` | The web app: React 19 + Vite + Tailwind. This is what people use. |
| `api/` | Vercel serverless helpers (login forwarding, receipt write fixes). Deployed with the web app. |
| `server/` | Node/Express service for the chatbot and accounting integrations (QuickBooks, Xero ...). Optional locally. |
| `deploy/` | Gateway and Apache config for the production server (`app.categorizr.com`). |
| `vercel.json` | Vercel build settings and URL rewrites (at the repo root, on purpose). |

## 1. Set up the code on your computer

You need: **Git**, **Node.js 20.19 or newer** (22.12+ also works; check with `node -v`) and **npm** (comes with Node).

```bash
git clone https://github.com/OMGAJJAR26/Categorizr.git
cd Categorizr
npm install
```

Run `npm install` once, at the repo root. It installs `Frontend/` and `server/` together.

### Run the web app

```bash
npm run dev
```

Open http://localhost:5173. Sign-in, receipts and everything else work straight away: the dev
server forwards `/api/*` calls to the live backend, so **no `.env` file is needed** to get started.
You will be working with real backend data, so use a test account.

### Optional: the chatbot / integrations service

Only needed if you are working on the chatbot or the QuickBooks/Xero integrations.

```bash
cd server
cp env.example .env     # then fill in the keys you need (ask the team; never commit .env)
npm run dev             # runs on http://localhost:3000
```

### Useful commands

Run these from the repo root unless a `cd` is shown.

```bash
npm run build                                   # production build into Frontend/dist
npm run lint                                    # ESLint (it has pre-existing errors; just don't add new ones)
cd Frontend && node --test src/utils/*.test.js  # unit tests
cd Frontend && npm run preview                  # serve the built site locally to check it
```

### Settings (environment variables)

All of them are optional for local work. They are listed in `Frontend/.env.example`; copy it to
`Frontend/.env.local` to use them. `VITE_` values are baked into the build, so never put secrets in them.

| Variable | Purpose |
| --- | --- |
| `VITE_NODE_API_URL` | Where the chatbot/integrations service lives. Leave empty locally. |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics 4 ID (`G-XXXXXXXXXX`). Empty means analytics is off. |

## 2. Deploy to Vercel

The web app is deployed to the Vercel project **`categorizr-staging`**
(https://categorizr-staging.vercel.app). We deploy with the Vercel CLI from the **repo root**.

### One-time setup

1. Ask a team owner to invite you to the Vercel team that owns `categorizr-staging`
   (Vercel dashboard → team **Settings → Members → Invite**), and accept the email invite.
2. Install the CLI and sign in:
   ```bash
   npm install -g vercel
   vercel login
   ```
3. Link your local copy to the project. Run this at the **repo root** (not inside `Frontend/`):
   ```bash
   vercel link
   ```
   Choose the team that owns the project, answer **Yes** to "link to existing project", and pick
   `categorizr-staging`. This creates a local `.vercel/` folder; it is git-ignored, so it never gets committed.

### Every deploy

```bash
git checkout main && git pull          # start from the latest code
npm install                            # only needed if dependencies changed
npm run build                          # must succeed
node --test Frontend/src/utils/*.test.js

git add <files> && git commit -m "Describe the change"
git push origin main                   # keep GitHub in step with what you deploy

vercel --prod --yes                    # deploy to https://categorizr-staging.vercel.app
```

Notes:

- **Commit before you deploy.** The CLI uploads whatever is in your folder, committed or not.
- To try a change on a throwaway URL first, run `vercel` (no `--prod`); it prints a preview link
  and leaves the live site untouched.
- The build runs on Vercel (settings come from the root `vercel.json`), so the first deploy takes
  about a minute. If the CLI shows a network timeout while waiting, the deploy usually still went
  through. Check with `vercel ls`.
- Check a deploy: `vercel ls` (status), `vercel logs <deployment-url>` (logs), then open the site
  and hard-refresh (Cmd/Ctrl + Shift + R).
- Roll back a bad deploy: `vercel rollback` (or **Deployments → ⋯ → Promote to Production** on an
  older one in the dashboard).
- Environment variables for Vercel (for example `VITE_GA_MEASUREMENT_ID`) are set in the dashboard:
  project → **Settings → Environment Variables**. They only take effect on the next deploy.

### Production (`app.categorizr.com`)

Production is **not** on Vercel. It is a separate Apache server where a built copy of the site is
uploaded by hand. Build it with `npm run build` (leave `VITE_NODE_API_URL` empty) and hand the
contents of `Frontend/dist/` to whoever manages that server. The gateway and Apache pieces are in
`deploy/`. Deploying to Vercel does not update production.

## 3. Working in the code: things worth knowing

- Never commit secrets (`.env` files, tokens, API keys). This repository is public.
- Some files use Windows (CRLF) line endings, for example `App.jsx`, `Login.jsx` and
  `ReportModals.jsx`. Keep the endings as they are, or the whole file shows up as changed in git.
- `Frontend/src/styles.css` gives every `button` and `input` a default 10px padding and margin.
  Components that need exact sizes reset it (`m-0 p-0`).
- Loading states use skeleton screens (`Frontend/src/components/skeleton/`). When you change a
  page's layout, update its skeleton too.
- The app is light-theme only.
