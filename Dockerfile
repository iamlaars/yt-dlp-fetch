FROM node:22-slim

# Install yt-dlp, ffmpeg, python3
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    --no-install-recommends \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp with default deps (includes EJS scripts) and symlink node for n-challenge solving
RUN pip3 install "yt-dlp[default]" --break-system-packages \
  && ln -sf /usr/local/bin/node /usr/bin/node

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js .
COPY auth.js .
COPY ytdlp.js .
COPY public/ ./public/

EXPOSE 4242

CMD ["node", "server.js"]
