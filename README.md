# FETCH — yt-dlp Web UI

A self-hosted video downloader powered by yt-dlp, packaged as a Docker container.
Supports YouTube, Vimeo, TikTok, Twitter/X, and 1000+ other sites.

> [!Warning]
> This repo has been heavily generated with Claude.

## Requirements

- **Docker** + **Docker Compose**
- That's it — yt-dlp, ffmpeg, Node.js, and Python are all inside the image.

## Quick start

```bash
# Build and run
docker compose up --build -d

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

## Files

```
.
├── Dockerfile          # Image: node:22-slim + ffmpeg + yt-dlp
├── docker-compose.yml  # Port 4242, mounts ./downloads
├── server.js           # Express backend
└── public/
    └── index.html      # Single-page frontend
```

## Notes

- Downloaded files stored in the container's /app/downloads and streamed to the browser.
- The ./downloads volume mount is available if you want to keep files on the host.
- To run on a different port, change "4242:4242" in docker-compose.yml.
