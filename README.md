# Personal Hub

One personal workspace for **Tasks · Habits · Finance**, built with Vue 3, Vite, Tailwind CSS, Supabase, and Vercel. Switch systems from the hub picker: run **Personal Tasker** for spaces and daily work, **Habit Tracker** for routines and streaks, and **Personal Finance** for cashflow, budgets, and net worth.

Beyond the dashboards, Personal Hub is an **AI-assisted productivity product**: a multi-provider LLM failover chain, tool-calling agents with human-in-the-loop writes, usage metering, and module-specific assistants for tasks, habits, and finance — plus **Telegram reminders** scheduled via **Supabase pg_cron**.

## Features

### Personal Tasker
- Spaces, lists, subtasks, tags, due dates, reminders, and recurrence
- List and kanban board views; **today panel** on the home dashboard
- Home and per-space dashboards with charts
- **AI task assistant** (text or voice) with tool calling and confirm-before-write
- **AI scheduler** that suggests due dates for open work (preview → apply)
- Filters, search, quick add, keyboard shortcuts, undo delete, dark mode
- **4× daily Telegram reminders** (5 AM, 12 PM, 5 PM, **8 PM** Philippines)
- Optional **Web Push** device notifications (habits, tasks, 8 PM expense nudge)
- Optional **AI Telegram digest** with fixed-template fallback
- **Monthly cleanup** of done tasks from the previous calendar month

### Habit Tracker
- Daily check-ins, streaks, categories, and insights
- **Habit AI**: natural-language logging, recommendations, sentiment, and coaching

### Personal Finance
- Accounts, transactions, category limits, recurring items, and goals
- Net worth overview with investments (including MP2) and debts
- **Finance AI**: NL expense logging, insights flags, and coaching (₱ / PH context)

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Vite, Tailwind CSS 4 |
| Auth & DB | Supabase (Row Level Security) |
| Hosting | Vercel (static app + serverless API routes) |
| Schedulers | Supabase **pg_cron** + **pg_net** (0 Vercel crons on Hobby) |
| Notifications | Telegram Bot API |
| AI | Gemini → OpenRouter → Groq → Cerebras → NVIDIA → Mistral (template fallback for Telegram) |
| AI contracts | OpenAI-compatible tool calling, Zod schemas, signed pending writes |

---

## AI architecture (portfolio highlight)

This section is written for portfolio / hiring reviewers: what was built, why, and where it lives in the repo.

### Problem

Personal apps get noisy fast. Typing every task update, habit check-in, or expense is friction. A thin “chat with GPT” wrapper is not enough — writes must be **safe**, providers must be **cheap and resilient**, and usage must be **capped** on free tiers.

### What I built

| Capability | What it does |
|------------|--------------|
| **Provider failover chain** | Tries Gemini → OpenRouter → Groq → Cerebras → NVIDIA → Mistral until one succeeds; skips missing keys and rate limits |
| **Tool-calling task agent** | LLM selects typed tools (`list_tasks`, `create_task`, `suggest_schedule`, …) against live workspace context |
| **Human-in-the-loop writes** | Read tools run immediately; write/destructive tools return a **preview** and require **Execute** |
| **Signed pending actions** | Pending writes are HMAC-signed (`AI_PENDING_SECRET`) so the client cannot forge tool args |
| **Zod tool contracts** | Every tool argument set is validated before execution |
| **Usage metering** | Per-provider monthly counters in `ai_usage` + daily chat cap (`AI_DAILY_CHAT_LIMIT`) |
| **Cross-module AI** | Separate Vercel routes for Tasker, Habits, and Finance (not one generic chatbot) |
| **Graceful degradation** | Telegram digests fall back to a fixed template when AI keys/limits fail |

### Agent flow (Tasker assistant)

```text
User (text / voice)
    → POST /api/ai/chat
        → auth + daily usage gate
        → workspace context (spaces, lists, open tasks, timezone)
        → provider chain (tools: auto)
        → agent loop:
              read tool  → execute → compose reply
              write tool → preview + signed pending action
    → UI shows reply (+ Execute / Cancel)
    → POST /api/ai/apply  (verified signature → toolExecutor write)
```

### Module AI surface

| Module | Endpoints | Behaviors |
|--------|-----------|-----------|
| **Tasker** | `/api/ai/chat`, `/api/ai/apply`, `/api/ai/schedule` | Conversational CRUD via tools; schedule JSON suggestions; confirm-to-apply |
| **Habits** | `/api/ai/habits/log`, `recommend`, `coach`, `sentiment` | NL check-in parsing, suggestions, coaching copy, mood/sentiment signals |
| **Finance** | `/api/ai/finance/log`, `insights`, `coach` | NL expense → structured fields; JSON insight flags; PH ₱ coaching |
| **Reminders** | `/api/cron/task-reminder` | Optional AI digest over overdue/due-today; else fixed template |

### Reliability & cost controls

- **OpenAI-compatible** HTTP to every provider — one client path, many backends
- **Monthly per-provider limits** via env (`AI_GEMINI_MONTHLY_LIMIT`, …) so free-tier quotas do not silently burn
- **Daily assistant cap** so chat cannot runaway-loop on a bad prompt
- **No browser secrets** — only `VITE_*` public config in the client; LLM keys stay on Vercel serverless
- **RLS + `requireUser`** on AI routes — agents only see the authenticated user’s rows

### Key source files

```text
lib/server/ai/
  providerChain.js    # Failover + OpenAI-compatible chat/completions
  agentLoop.js        # Read / confirm / chat phases
  toolSchemas.js      # Zod + OpenAI tool definitions
  toolExecutor.js     # Safe execution against Supabase
  pendingAction.js    # Sign / verify write intents
  usage.js            # Monthly + daily metering
  assistantTools.js   # System prompt + workspace context

api/ai/
  chat.js, apply.js, schedule.js
  habits/{log,recommend,coach,sentiment}.js
  finance/{log,insights,coach}.js
  push.js                          # Web Push subscribe / unsubscribe
```

### Skills this demonstrates

- Production LLM integration beyond a single SDK demo
- Agent design with **tool contracts**, previews, and signed confirmations
- Multi-tenant-safe data access (Supabase RLS + server auth)
- Cost/ops engineering for free-tier model APIs
- Productizing AI across three domains (tasks, habits, finance) with shared infra

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A [Supabase](https://supabase.com/) account
- A [Vercel](https://vercel.com/) account
- A [Telegram](https://telegram.org/) account (for daily reminders)
- Git (optional, for deploy via GitHub)

---

## Step 1 — Clone and install locally

```bash
git clone <your-repo-url>
cd tasker
npm install
```

Copy the environment template:

```bash
cp .env.example .env.local
```

> **Windows (PowerShell):** `Copy-Item .env.example .env.local`

---

## Step 2 — Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
2. Choose an organization, name, database password, and region (pick one close to you, e.g. Singapore).
3. Wait until the project finishes provisioning.

### Get your API keys

1. Open **Project Settings → API**.
2. Copy these values (you will use them later):
   - **Project URL** → `VITE_SUPABASE_URL` and `SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server only — never put this in browser code)

---

## Step 3 — Run database migrations

Migrations live in `supabase/migrations/`. Run them **in order**:

| File | What it creates |
|------|-----------------|
| `0001_create_tasks.sql` | `tasks` table + RLS |
| `0002_add_spaces_and_lists.sql` | `spaces`, `task_lists`, task location columns |
| `0003_create_task_subtasks.sql` | `task_subtasks` table |
| `0004_cascade_delete_space_tasks.sql` | Cascade delete when a space is removed |
| `0005_task_reminders_recurrence.sql` | `reminder_at`, recurrence fields |
| `0006_list_space_consistency.sql` | Trigger to keep list/space in sync |
| `0007_monthly_cleanup_index.sql` | Index for monthly done-task cleanup |
| `0008_user_settings_and_ai_usage.sql` | `user_settings`, `ai_usage` tables + RLS |
| `0009_pg_cron_schedules.sql` | 4 reminder crons, monthly cleanup, log purge |
| `0010_invoke_task_reminder_timeout.sql` | Reminder invoke timeout tuning |
| `0011_create_goals.sql` | Tasker goals |
| `0012_create_personal_trackers.sql` | Shared tracker scaffolding |
| `0013_habit_tracker_full.sql` | Habit Tracker tables + RLS |
| `0014_personal_finance_full.sql` | Finance accounts, transactions, holdings, debts, goals + RLS |
| `0015_budget_category_icons.sql` | Category icon column |
| `0016_finance_holding_mp2.sql` | MP2 asset class for holdings |

### Option A — Supabase SQL Editor (simplest)

1. In the Supabase dashboard, open **SQL Editor**.
2. For each file above (0001 → 0016), open the file locally, copy the full SQL, paste into a new query, and click **Run**.
3. Confirm there are no errors before running the next file.

### Option B — Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Your project ref is in **Project Settings → General → Reference ID**.

### Enable Realtime (recommended)

The app listens for live task updates.

1. Go to **Database → Publications** (or **Realtime** in older dashboards).
2. Ensure the `supabase_realtime` publication includes:
   - `public.tasks`
   - `public.task_subtasks`

If those tables are not listed, add them via **Database → Replication** or run:

```sql
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_subtasks;
```

---

## Step 4 — Create your user account

1. In Supabase, open **Authentication → Users**.
2. Click **Add user → Create new user**.
3. Enter the **email** and **password** you want to use to sign in.
4. Use the same email for `VITE_ALLOWED_EMAIL` and `ALLOWED_USER_EMAIL` later.

> On first sign-in, the app seeds default Spaces (Personal, Work, Learning) if your account has no spaces yet.

---

## Step 5 — Configure local environment

Edit `.env.local`:

```env
# Browser — safe to expose in Vite bundle
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ALLOWED_EMAIL=you@example.com

# Server-only — used when testing API routes locally (optional for npm run dev)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ALLOWED_USER_EMAIL=you@example.com
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CRON_SECRET=generate-a-long-random-string
APP_URL=https://your-app.vercel.app

# AI (optional — scheduler, chat, AI Telegram digests)
# GEMINI_API_KEY: https://aistudio.google.com/apikey
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
CEREBRAS_API_KEY=
CEREBRAS_MODEL=llama3.1-8b
NVIDIA_API_KEY=
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest
AI_GEMINI_MONTHLY_LIMIT=1200
AI_OPENROUTER_MONTHLY_LIMIT=1200
AI_GROQ_MONTHLY_LIMIT=1500
AI_CEREBRAS_MONTHLY_LIMIT=1500
AI_NVIDIA_MONTHLY_LIMIT=1500
AI_MISTRAL_MONTHLY_LIMIT=1500
AI_DAILY_CHAT_LIMIT=40
AI_PENDING_SECRET=
```

| Variable | Required for `npm run dev` | Notes |
|----------|---------------------------|-------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Anon/public key |
| `VITE_ALLOWED_EMAIL` | Recommended | Restricts sign-in to one email |
| `SUPABASE_*` / `ALLOWED_USER_EMAIL` | No (local UI) | Needed for cron + AI API routes |
| `TELEGRAM_*` / `CRON_SECRET` | No (local UI) | Needed for Telegram reminders |
| `GEMINI_*` / `OPENROUTER_*` / `GROQ_*` / `CEREBRAS_*` / `NVIDIA_*` / `MISTRAL_*` | No | AI features; fixed template used when unset |
| `AI_*_MONTHLY_LIMIT` / `AI_DAILY_CHAT_LIMIT` | No | Per-provider monthly caps and daily assistant cap |
| `AI_PENDING_SECRET` | No (local UI) | Signs pending write actions for Execute; falls back to `CRON_SECRET` |

Generate `CRON_SECRET` (example):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`). Sign in with the user you created in Step 4.

**AI routes** (`/api/ai/chat`, `/api/ai/apply`, `/api/ai/schedule`) need Vercel’s dev server — `npm run dev` alone only serves the Vue app:

```bash
npx vercel dev
```

Or run both: `npm run dev` in one terminal and `npm run dev:api` (alias for `vercel dev`) in another.

Other scripts:

| Command | Description |
|---------|-------------|
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## Step 6 — Set up Telegram reminders (Supabase pg_cron)

Reminders are **not** scheduled on Vercel (Hobby allows only one fire per cron expression per day). All schedules run in **Supabase pg_cron**, which calls your Vercel API via `pg_net`.

### 6.1 Create a bot

1. In Telegram, open a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts.
3. Copy the **bot token** → `TELEGRAM_BOT_TOKEN`.

### 6.2 Get your chat ID

1. Open a chat with your new bot and send any message (e.g. `hi`).
2. Visit this URL in a browser (replace `TOKEN`):

   ```
   https://api.telegram.org/botTOKEN/getUpdates
   ```

3. Find `"chat":{"id":123456789` in the JSON response.
4. That number is your `TELEGRAM_CHAT_ID`.

Alternatively, message [@userinfobot](https://t.me/userinfobot) to get your personal chat ID.

### 6.3 Reminder slots (Asia/Manila)

| Slot | Local time | pg_cron (UTC) |
|------|------------|---------------|
| Morning | 5:00 AM | `0 21 * * *` |
| Noon | 12:00 PM | `0 4 * * *` |
| Afternoon | 5:00 PM | `0 9 * * *` |
| Night | 8:00 PM | `0 12 * * *` |

Each slot calls `GET /api/cron/task-reminder?slot=morning|noon|afternoon|night` with `Authorization: Bearer <CRON_SECRET>`.

Messages list **overdue** and **due today** tasks (Asia/Manila). By default a **fixed template** is used. Enable **AI Telegram digest** in Settings to use the AI provider chain (OpenRouter → NVIDIA → Groq → Cerebras → Mistral → template fallback).

Toggle **Telegram reminders** in Settings; preferences are stored in `user_settings` for server-side cron.

### 6.3b Web Push (device notifications)

1. Generate keys once: `npx web-push generate-vapid-keys`
2. Set on Vercel (and locally): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and the same public key as `VITE_VAPID_PUBLIC_KEY`
3. Ensure `APP_URL` is your production origin (used for notification icon URLs)
4. Apply migration `0021_web_push_subscriptions.sql` (table + RLS + night cron at 8 PM PH)
5. In the installed PWA (Brave/Android): **Settings → Device notifications** → allow permission

Web Push digests run on the same cron slots: habits/tasks by day, and every **8 PM** expense nudge (“Don't forget to list your expenses.”).

### 6.4 Configure Supabase Vault (required for pg_cron HTTP)

After migration `0009_pg_cron_schedules.sql`, store secrets in **Supabase Dashboard → Project Settings → Vault** (or SQL):

```sql
select vault.create_secret('https://YOUR_APP.vercel.app', 'cron_app_url');
select vault.create_secret('YOUR_CRON_SECRET', 'cron_secret');
```

Use the same `CRON_SECRET` value in Vercel environment variables.

### 6.5 Monthly cleanup and cron log purge

Migration `0009` also schedules:

| Job | Schedule (UTC) | Action |
|-----|----------------|--------|
| Monthly cleanup | `30 16 1 * *` | Deletes `done` tasks with `completed_at` in the **previous** calendar month (Manila), then optional Telegram `monthly-report` |
| Purge cron logs | `0 17 * * 0` | Deletes `cron.job_run_details` older than 7 days |

### 6.6 Monitor pg_cron health

```sql
-- Last successful run per job
select j.jobname, max(d.end_time) as last_success
from cron.job j
left join cron.job_run_details d on d.jobid = j.jobid and d.status = 'succeeded'
group by j.jobname;

-- Jobs with no success in the last 25 hours (possible missed run)
select j.jobname
from cron.job j
where j.jobname like 'tasker-%'
  and not exists (
    select 1 from cron.job_run_details d
    where d.jobid = j.jobid
      and d.status = 'succeeded'
      and d.end_time > now() - interval '25 hours'
  );
```

> **Supabase free tier:** projects pause after ~1 week of inactivity — pg_cron stops until you use the project again. Log in occasionally or use an external backup scheduler if needed.

---

## Step 7 — Deploy to Vercel

### 7.1 Connect the repository

1. Push this project to GitHub (or GitLab/Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import the repository.
4. Vercel should detect Vite automatically:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`

These are also set in `vercel.json`.

### 7.2 Add environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

| Variable | Environments | Sensitive |
|----------|--------------|-----------|
| `VITE_SUPABASE_URL` | Production, Preview | No |
| `VITE_SUPABASE_ANON_KEY` | Production, Preview | No |
| `VITE_ALLOWED_EMAIL` | Production, Preview | No |
| `SUPABASE_URL` | Production (and Preview if needed) | Yes |
| `SUPABASE_ANON_KEY` | Production | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | **Yes** |
| `ALLOWED_USER_EMAIL` | Production | No |
| `TELEGRAM_BOT_TOKEN` | Production | **Yes** |
| `TELEGRAM_CHAT_ID` | Production | Yes |
| `CRON_SECRET` | Production | **Yes** |
| `APP_URL` | Production | No |
| `GEMINI_API_KEY` | Production | Yes (optional) |
| `GEMINI_MODEL` | Production | No |
| `OPENROUTER_API_KEY` | Production | Yes (optional) |
| `OPENROUTER_MODEL` | Production | No |
| `NVIDIA_API_KEY` | Production | Yes (optional) |
| `NVIDIA_MODEL` | Production | No |
| `GROQ_API_KEY` | Production | Yes (optional) |
| `GROQ_MODEL` | Production | No |
| `CEREBRAS_API_KEY` | Production | Yes (optional) |
| `CEREBRAS_MODEL` | Production | No |
| `MISTRAL_API_KEY` | Production | Yes (optional) |
| `MISTRAL_MODEL` | Production | No |
| `AI_GEMINI_MONTHLY_LIMIT` | Production | No |
| `AI_OPENROUTER_MONTHLY_LIMIT` | Production | No |
| `AI_NVIDIA_MONTHLY_LIMIT` | Production | No |
| `AI_GROQ_MONTHLY_LIMIT` | Production | No |
| `AI_CEREBRAS_MONTHLY_LIMIT` | Production | No |
| `AI_MISTRAL_MONTHLY_LIMIT` | Production | No |
| `AI_DAILY_CHAT_LIMIT` | Production | No |
| `AI_PENDING_SECRET` | Production | **Yes** (optional; uses `CRON_SECRET` if unset) |

Rules:

- Variables starting with `VITE_` are embedded in the browser bundle — only use public Supabase keys there.
- **Never** expose `SUPABASE_SERVICE_ROLE_KEY` as a `VITE_` variable.
- `ALLOWED_USER_EMAIL` must match the Supabase Auth user from Step 4 (same as `VITE_ALLOWED_EMAIL`).

### 7.3 Deploy

1. Click **Deploy** (or push to `main` if auto-deploy is enabled).
2. When the build finishes, open your production URL and sign in.

### 7.4 Verify reminders (manual test)

`vercel.json` has **no cron entries** — reminders are driven by Supabase pg_cron after Step 6.4.

Test the API manually:

```bash
curl -X GET "https://YOUR_APP.vercel.app/api/cron/task-reminder?slot=morning" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

A successful response looks like:

```json
{ "ok": true, "sent": true, "slot": "morning", "source": "template", "dueToday": 0, "overdue": 0 }
```

You should receive a Telegram message. Repeat for `noon`, `afternoon`, and `night` if desired.

---

## Step 8 — Post-deploy checklist

- [ ] Sign in on production with your allowed email
- [ ] Create a task with a due date and confirm it appears in List, Board, and the home **Today** panel
- [ ] Archive a task and filter by **Archived**
- [ ] Configure Vault secrets (`cron_app_url`, `cron_secret`) and confirm migrations 0007–0009 ran
- [ ] Receive a test Telegram message from `/api/cron/task-reminder?slot=morning`
- [ ] Confirm Realtime works (open two tabs; edit a task in one and see it update in the other)
- [ ] Optional: enable AI digest in Settings and test scheduler / task assistant

---

## Environment reference

See [`.env.example`](.env.example) for the full list.

```env
# Browser (Vite)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ALLOWED_EMAIL=

# Server (Vercel functions only)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_USER_EMAIL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CRON_SECRET=
APP_URL=

# AI provider chain (optional)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
NVIDIA_API_KEY=
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
CEREBRAS_API_KEY=
CEREBRAS_MODEL=llama-3.3-70b
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest
AI_OPENROUTER_MONTHLY_LIMIT=1200
AI_NVIDIA_MONTHLY_LIMIT=2000
AI_GROQ_MONTHLY_LIMIT=1500
AI_CEREBRAS_MONTHLY_LIMIT=1500
AI_MISTRAL_MONTHLY_LIMIT=1500
AI_DAILY_CHAT_LIMIT=40
AI_PENDING_SECRET=
```

The assistant tries providers **in order** until one succeeds. Usage is tracked in `ai_usage` per provider per calendar month. Chat is capped at `AI_DAILY_CHAT_LIMIT` requests per day (default 40). Destructive assistant actions require **Execute** after confirmation — signed with `AI_PENDING_SECRET` (or `CRON_SECRET`).

### Free-tier notes

| Service | Limit | Tip |
|---------|-------|-----|
| Vercel Hobby | 0 multi-fire crons/day | Use Supabase pg_cron for 4× daily reminders |
| Supabase | 500 MB DB, pauses if inactive | Monthly done-task cleanup + weekly `job_run_details` purge |
| Gemini (AI Studio free) | 10 RPM, 1,500 RPD on Flash | Primary — `gemini-2.5-flash`; use `gemini-2.5-flash-lite` for lighter jobs |
| OpenRouter free | Varies by model | Fallback — default `llama-3.1-8b-instruct:free` (avoid `openrouter/free` router) |
| Groq | Free tier RPM/TPM | `llama-3.1-8b-instant` — ultra fast |
| Cerebras | Free tier limits | `llama3.1-8b` — speed-critical fallback |
| NVIDIA NIM | RPM limits | `llama-3.1-8b-instruct` fallback |
| Mistral | Experiment plan limits | `mistral-small-latest` — last resort |
| Assistant chat | `AI_DAILY_CHAT_LIMIT` (default 40/day) | One LLM call per message; writes need Execute |
| Voice (browser) | Client-side STT/TTS | Safari has limited support |

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Focus task search |
| `N` | New task (when a list is open) |
| `Esc` | Close editor, settings, or mobile sidebar |

---

## Security notes

- Row Level Security (RLS) on all user tables scopes data to `auth.uid()`.
- Only the Supabase **anon** key is used in frontend code.
- The **service role** key is used only in the serverless cron function.
- Security headers are set in `vercel.json`.
- Do not commit `.env.local` or real secrets to Git.

---

## Troubleshooting

### Cannot sign in

- Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` or Vercel.
- Confirm the user exists under **Authentication → Users**.
- If `VITE_ALLOWED_EMAIL` is set, the sign-in email must match exactly.

### Tasks do not load / permission errors

- Confirm all migrations (0001–0016) ran successfully.
- In Supabase **Logs → Postgres**, check for RLS or policy errors.

### Telegram reminder returns 401

- `CRON_SECRET` must match in Vercel and Supabase Vault (`cron_secret`).
- Manual tests must send `Authorization: Bearer <CRON_SECRET>`.

### Telegram reminder returns 500 or no message

- Verify `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_USER_EMAIL`.
- Ensure Vault secrets `cron_app_url` and `cron_secret` are set (pg_cron HTTP calls fail silently otherwise — check `cron.job_run_details`).
- Ensure you have messaged the bot at least once.
- Check **Vercel → Logs** for the function error message.

### pg_cron not firing

- Supabase project may be **paused** — open the dashboard or run a query to wake it.
- Confirm migration `0009` ran and jobs exist: `select * from cron.job where jobname like 'tasker-%';`
- Run the health queries in Step 6.6.

### AI features unavailable

- Set at least one provider key (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, etc.) on Vercel. Without keys, reminders use the fixed template; scheduler/chat return errors.
- For local testing, use `npx vercel dev` — `npm run dev` does not serve `/api/ai/*`.
- Check `ai_usage` for monthly limits (`AI_*_MONTHLY_LIMIT` env vars).
- If **Execute** fails, set `AI_PENDING_SECRET` (or reuse `CRON_SECRET`) on Vercel.

### Realtime updates not appearing

- Enable `tasks` and `task_subtasks` on the `supabase_realtime` publication (Step 3).

### Reminder time feels wrong

- pg_cron uses **UTC**; the app buckets due/overdue dates in **Asia/Manila**. Adjust cron expressions in `0009_pg_cron_schedules.sql` if you change slots.

---

## Project structure (quick reference)

```
tasker/
├── api/
│   ├── cron/task-reminder.js       # Telegram reminders (pg_cron → HTTP)
│   └── ai/
│       ├── chat.js, apply.js, schedule.js
│       ├── habits/                 # log, recommend, coach, sentiment
│       └── finance/                # log, insights, coach
│   └── push.js                     # Web Push subscribe/unsubscribe (Hobby-safe single function)
├── lib/server/ai/                  # Provider chain, agent loop, tools, usage caps
├── src/                            # Vue app (assistants + FAB UIs)
├── supabase/migrations/            # SQL schema incl. ai_usage (0008+)
├── vercel.json                     # Rewrites, headers (no Vercel crons)
└── .env.example                    # Env template (AI keys optional)
```

---

## License

Private / personal use.

---

## PWA & Android APK (PWA Builder)

The website stays the same in the browser. PWA files only add installability and offline caching for static assets. Supabase auth and task data still load over the network.

### What was added

- `manifest.webmanifest` (auto-generated on build)
- Service worker (`sw.js`) for caching static files
- PNG icons: `public/pwa-192.png`, `public/pwa-512.png`
- Regenerate icons anytime: `npm run icons`

### Build and deploy first

PWA Builder needs your **live HTTPS URL**, not localhost:

```bash
npm run build
```

Push to GitHub / deploy on Vercel as usual. The PWA files ship inside `dist/` automatically.

### Verify before packaging

1. Open your Vercel URL in Chrome (desktop or mobile).
2. Open DevTools → **Application** → **Manifest** — confirm name and icons load.
3. Check **Service workers** — should show a registered worker.
4. On Android Chrome: menu → **Install app** or **Add to Home screen**.

### Package APK with PWA Builder

1. Go to [pwabuilder.com](https://www.pwabuilder.com/) and enter your Vercel URL.
2. Fix any warnings (manifest and service worker should already score well).
3. Click **Package for stores** → **Android**.
4. Set package ID (e.g. `com.yourname.tasker`), version, and colors.
5. Create or upload a signing key, then download the **APK**.

No extra Supabase or Vercel env vars are needed for the APK — it wraps the same deployed site.

