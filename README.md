# FETCH — yt-dlp Web UI

A self-hosted video downloader powered by yt-dlp, packaged as a Docker container.
Supports YouTube, Vimeo, TikTok, Twitter/X, and 1000+ other sites.

> [!Warning]
> This repo has been heavily generated with Claude.

## Requirements

- **Docker** + **Docker Compose**
- At least one OAuth provider (GitHub, Google, or Authentik)
- That's it — yt-dlp, ffmpeg, Node.js, and Python are all inside the image.

## Quick start

1. Copy `.env.example` to `.env` and fill in your credentials (see [Authentication](#authentication))
2. Run:

```bash
docker compose up -d

# Open in browser
open http://localhost:4242
```

## Commands

```bash
# Start (background)
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f

# Rebuild after code changes
docker compose up --build -d

# Update yt-dlp inside the running container
docker compose exec fetch yt-dlp -U
```

## Authentication

All routes require login. Supported providers:

| Provider | Env vars | Register at |
|---|---|---|
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | github.com/settings/developers |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com/apis/credentials |
| Authentik | `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_ISSUER` | Your Authentik instance |

Set the callback URL for each provider to: `https://your-domain/auth/callback/<provider>`  
(e.g. `https://your-domain/auth/callback/github`)

Configure via `.env` (copy from `.env.example`):

```env
AUTH_SECRET=        # Required — generate with: openssl rand -base64 32
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
# ... see .env.example for all options
```

At least one provider must be configured. `AUTH_SECRET` is always required.

## Files

```
.
├── Dockerfile              # Image: node:22-slim + ffmpeg + yt-dlp
├── docker-compose.yml      # Port 4242, mounts ./downloads
├── docker-compose-build.yml # Same but builds from source
├── server.js               # Express backend
├── auth.js                 # Auth.js provider config
├── .env.example            # Environment variable reference
└── public/
    ├── index.html          # Single-page frontend (protected)
    └── login.html          # Login page
```

## Notes

- Downloaded files are stored in the container's `/app/downloads` and streamed to the browser.
- The `./downloads` volume mount keeps files on the host.
- To run on a different port, change `"4242:4242"` in `docker-compose.yml`.
