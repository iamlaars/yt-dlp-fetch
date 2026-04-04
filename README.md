# FETCH — yt-dlp Web UI

A self-hosted video downloader with a clean web UI, powered by yt-dlp. Runs as a Docker container with OAuth authentication.

Supports YouTube, Vimeo, TikTok, Twitter/X, and 1000+ other sites.

> [!WARNING]
> This repo has been heavily generated with Claude.

## Requirements

- Docker + Docker Compose
- At least one OAuth provider configured (GitHub, Google, or Authentik)

Everything else (Node.js, yt-dlp, ffmpeg, Python) is inside the image.

## Quick start

```bash
cp .env.example .env
# Edit .env — add AUTH_SECRET and at least one OAuth provider

docker compose up -d
# App is at http://localhost:4242
```

## Authentication

All routes require login. `AUTH_SECRET` is always required.

```bash
# Generate AUTH_SECRET
openssl rand -base64 32
```

| Provider | Required env vars | Register at |
|---|---|---|
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | github.com/settings/developers |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com/apis/credentials |
| Authentik | `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_ISSUER` | Your Authentik instance |

Set the OAuth callback URL to: `https://your-domain/auth/callback/<provider>`

## YouTube cookies

YouTube requires authentication cookies to serve video formats (bot detection).

1. Install the **"Get cookies.txt LOCALLY"** browser extension
2. Go to youtube.com while logged in, export cookies in **Netscape format**
3. Save the file as `cookies.txt` next to `docker-compose.yml`

The file is mounted at `/app/cookies.txt` — yt-dlp picks it up automatically. Without it, YouTube downloads will fail. Cookies expire periodically and will need re-exporting.

## Reverse proxy

When running behind a reverse proxy (Traefik, nginx, etc.), set in `.env`:

```env
AUTH_URL=https://your-domain
AUTH_TRUST_HOST=true
```

`docker-compose-build.yml` includes pre-configured Traefik labels as a reference.

## Commands

```bash
docker compose up -d              # Start
docker compose down               # Stop
docker compose logs -f            # Follow logs
docker compose up --build -d      # Rebuild after code changes
```

yt-dlp auto-updates inside the container every 24 hours (first check 5 minutes after startup).

## Development

```bash
npm install
npm start        # Runs on http://localhost:4242

npm test         # Run tests once
npm run test:watch
```

Note: local dev won't have yt-dlp or ffmpeg unless installed on the host. Docker is the recommended way to run this.

## Notes

- Downloaded files land in `./downloads` on the host (mounted into the container)
- Files expire and are cleaned up 10 minutes after download
- To change the port, edit `"4242:4242"` in `docker-compose.yml`
