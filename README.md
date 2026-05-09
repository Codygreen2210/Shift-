# SHIFT

A daily word ladder. Transform one word into another, one letter at a time.

**Stack:** Next.js 15 · TypeScript · Tailwind · Framer Motion · Tone.js · Anthropic API

## Phone-First Deploy (≈10 min)

Same workflow as Flagged. No local terminal needed.

### 1. Create the GitHub repo

1. Open **github.com** in mobile Safari/Chrome → tap **+** → **New repository**
2. Name it `shift`, set Private (or Public, your call), tap **Create repository**

### 2. Add files via mobile web

For each file in this project, in the GitHub repo tap **Add file → Create new file**.

Type the path (e.g. `app/page.tsx`) — the slashes auto-create folders. Paste the contents. Commit.

Files to create (12 total):

```
package.json
tsconfig.json
next.config.js
tailwind.config.ts
postcss.config.js
.gitignore
.env.example
app/layout.tsx
app/page.tsx
app/globals.css
app/api/generate/route.ts
lib/dictionary.ts
lib/puzzles.ts
README.md   ← optional
```

Tip: `tailwind.config.ts` and `app/globals.css` are the largest. Paste in chunks if the mobile editor lags.

### 3. Get an Anthropic API key

1. Go to **console.anthropic.com** → API Keys → Create
2. Copy it (starts with `sk-ant-…`)

### 4. Deploy on Vercel

1. **vercel.com** → **Add New** → **Project** → **Import** the `shift` repo
2. **Environment Variables** → add `ANTHROPIC_API_KEY` with your key
3. **Deploy**

You'll get a `shift-xxx.vercel.app` URL in ~60 seconds.

## Architecture

- **Daily puzzle** rotates from a curated list (`lib/puzzles.ts`) seeded by date — same puzzle for everyone on the same day
- **Practice mode** picks any non-daily puzzle from the list
- **AI mode** calls `/api/generate` which prompts Claude Sonnet for a fresh puzzle, validates the path is mechanically correct, retries on failure
- **Streaks & stats** stored in `localStorage` — no auth, no DB needed for v1
- **Share cards** built client-side, copied to clipboard or fired through the Web Share Sheet on mobile
- All fonts loaded from Google Fonts; no asset pipeline

## v2 Backlog

When you're ready to add a backend:

- **Vercel Postgres** for puzzles + leaderboard (you already have the Neon stack from Flagged)
- **Auth.js** for accounts → cross-device streaks, friend battles, "can you beat my route" links
- **Cron** at `vercel.json` to pre-generate tomorrow's AI-curated puzzle and cache it
- **Resend** to email weekly streak summaries (you already use it for Flagged)
- Turn AI mode into ranked play (premium tier)

The current code is structured so swapping `lib/puzzles.ts` from a static list to a DB call is a one-function change.

## Local dev (optional, for desktop later)

```bash
npm install
cp .env.example .env.local
# add your ANTHROPIC_API_KEY
npm run dev
```

## Costs

- **Vercel** Hobby tier: free
- **Anthropic** API: ~$0.003 per AI puzzle generation. With heavy practice usage that's pennies per active user per day. Add a rate limit before opening publicly.
