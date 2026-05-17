# EmailFlow

Open-source AI-powered cold email campaign platform with Gmail warmup, inbox management, and automated follow-ups.

Built for agencies and small businesses who want full control over their email infrastructure — no SaaS fees, no vendor lock-in, self-hosted on your own server.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

---

## Features

- 📧 **Cold Email Campaigns** — Build, schedule, and send highly personalized email sequences.
- 🔥 **Gmail Warmup** — Automated inbox warming to improve deliverability with incremental sending schedules.
- 🛟 **Spam Rescue Service** — Automatically detects when warm-up or campaign emails land in the spam folder, moves them to the primary inbox, and marks them as important to boost sender reputation.
- 📥 **Inbox Management** — View, manage, and reply to leads directly from a unified dashboard.
- 🤖 **AI Reply Detection** — Automatically detect, classify, and tag incoming replies using Ollama (local LLM).
- 🔄 **OAuth Token Auto-Refresh** — Dynamic background service that automatically manages and refreshes Google OAuth tokens to prevent campaign disruptions.
- ✅ **Email Validation** — Built-in email validation and list sanitization to prevent bounces and preserve domain health.
- 📊 **Campaign Analytics** — Comprehensive dashboard tracking open rates, replies, bounces, and deliverability stats.
- 🔐 **Google OAuth Integration** — Connect unlimited Gmail accounts securely per instance.
- 🐳 **Docker Ready** — Standardized environment for quick, one-command self-hosted deployment.

---

## Tech Stack

- **Frontend** — Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Backend** — Node.js, Express
- **Database** — PostgreSQL
- **Auth** — NextAuth.js (Google OAuth + Email/Password)
- **AI** — Ollama (local LLM, fully optional)

---

## Quick Start (Docker)

### Prerequisites
- Docker and Docker Compose installed
- A Google Cloud project with OAuth 2.0 credentials

### 1. Download the compose file
```bash
curl -O https://raw.githubusercontent.com/shayan-human/EMAIL-FLOW/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/shayan-human/EMAIL-FLOW/main/.env.example
```

### 2. Configure your environment
```bash
cp .env.example .env
```

Open `.env` and fill in:
- `POSTGRES_PASSWORD` — any strong password
- `NEXTAUTH_SECRET` — run `openssl rand -base64 32` to generate
- `NEXTAUTH_URL` — your domain (e.g. `https://emailflow.yourdomain.com`)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `NEXT_PUBLIC_BACKEND_URL` — your backend URL

### 3. Set up Google OAuth

In your [Google Cloud Console](https://console.cloud.google.com):

1. Create a new project
2. Enable the **Gmail API**
3. Go to **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
4. Add these to **Authorized Redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://yourdomain.com/api/auth/callback/google` (production)
   - `http://localhost:3000/api/gmail-connect/callback/google` (local)
   - `https://yourdomain.com/api/gmail-connect/callback/google` (production)
5. Copy the **Client ID** and **Client Secret** into your `.env`

### 4. Start EmailFlow
```bash
docker compose up -d
```

App will be available at `http://localhost:3000`

### 5. Initialize the database

On first run, connect to your PostgreSQL instance and run the schema file:

```bash
docker exec -i emailflow-db psql -U emailflow -d emailflow < campaign-backend/db/schema.sql
```

This creates all required tables. Only needs to be done once.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL database password |
| `POSTGRES_USER` | ✅ | PostgreSQL username (default: `emailflow`) |
| `POSTGRES_DB` | ✅ | PostgreSQL database name (default: `emailflow`) |
| `NEXTAUTH_SECRET` | ✅ | Random secret for session encryption |
| `NEXTAUTH_URL` | ✅ | Your app's public URL |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth Client Secret |
| `NEXT_PUBLIC_BACKEND_URL` | ✅ | URL of the backend service |
| `OLLAMA_HOST` | ❌ | Ollama API host (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | ❌ | Ollama model name (default: `llama3`) |
| `CRON_SCHEDULE` | ❌ | Campaign check frequency (default: `*/5 * * * *`) |

---

## Self-Hosting on a VPS

For production deployment on a VPS (Ubuntu/Debian):

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone and configure
git clone https://github.com/shayan-human/EMAIL-FLOW.git
cd EMAIL-FLOW
cp .env.example .env
nano .env  # fill in your values

# Start
docker compose up -d
```

Set up Nginx as a reverse proxy pointing port 80/443 to port 3000 for the frontend and port 3001 for the backend.

---

## Development (Without Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 16+

### Frontend
```bash
cd campaign-scheduler
cp .env.example .env.local  # fill in values
npm install
npm run dev
```

### Backend
```bash
cd campaign-backend
cp .env.example .env  # fill in values
npm install
node server.js
```

---

## Google Developer App Limits

EmailFlow uses your own Google Cloud project, which means:
- ✅ Free to use
- ✅ No CASA security audit required
- ✅ Up to 100 connected Gmail accounts per instance
- ✅ No Supabase or third-party database required

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
