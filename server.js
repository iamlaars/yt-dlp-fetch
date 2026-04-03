import express from 'express'
import cors from 'cors'
import { spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { ExpressAuth, getSession } from '@auth/express'
import { authConfig, getActiveProviderNames } from './auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.AUTH_SECRET) {
  console.error('ERROR: AUTH_SECRET environment variable is required')
  process.exit(1)
}

if (getActiveProviderNames().length === 0) {
  console.error('ERROR: At least one OAuth provider must be configured (GITHUB_, GOOGLE_, or AUTHENTIK_ env vars)')
  process.exit(1)
}

const app = express();
const PORT = 4242;

app.set('trust proxy', true)

app.use(cors())
app.use(express.json())

// Auth.js — handles /auth/signin, /auth/callback/:provider, /auth/signout
app.use('/auth', (req, res, next) => {
  console.log('[auth]', req.method, req.path, 'host:', req.headers.host, 'proto:', req.headers['x-forwarded-proto'])
  const handler = ExpressAuth(authConfig)
  handler(req, res, (err) => {
    if (err) console.error('[auth handler error]', err)
    next(err)
  })
})

// requireAuth — guards API routes and the main page
async function requireAuth(req, res, next) {
  const session = await getSession(req, authConfig)
  if (!session?.user) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    return res.redirect('/login')
  }
  res.locals.session = session
  next()
}

// Public: login page and its assets
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'))
})

// Public: list of configured providers (used by login.html)
app.get('/api/providers', (_req, res) => {
  res.json(getActiveProviderNames())
})

// Protected: session info
app.get('/api/session', requireAuth, (_req, res) => {
  const { name, email, image } = res.locals.session.user
  res.json({ name, email, image })
})

// Static assets (CSS, images, JS — not index.html)
app.use(express.static(path.join(__dirname, 'public'), { index: false }))

// Protected: main app page
app.get('/', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// In-memory store: token -> { filePath, name, tmpDir }
const fileStore = {};

function getYtDlpPath() {
  for (const c of ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp']) {
    try { execSync(`${c} --version`, { stdio: 'pipe' }); return c; } catch {}
  }
  return null;
}

// GET /api/test - verify yt-dlp spawning works from Express
app.get('/api/test', requireAuth, (req, res) => {
  const ytdlp = getYtDlpPath();
  const url = req.query.url || 'https://www.youtube.com/watch?v=IHItbgHutVo';
  const args = ['--no-playlist', '--newline', '--progress', '--no-quiet', '--socket-timeout', '30',
    '-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4',
    '-o', '/app/downloads/test.mp4', url];

  res.setHeader('Content-Type', 'text/plain');
  res.write(`Spawning: ${ytdlp} ${args.join(' ')}\n\n`);

  const proc = spawn(ytdlp, args, {
    env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/root' }
  });

  proc.stdout.on('data', d => { res.write('STDOUT: ' + d); });
  proc.stderr.on('data', d => { res.write('STDERR: ' + d); });
  proc.on('close', code => { res.write(`\nEXIT: ${code}`); res.end(); });
  setTimeout(() => { res.write('\nTIMEOUT after 30s'); res.end(); proc.kill(); }, 30000);
});


app.get('/api/info', requireAuth, (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const ytdlp = getYtDlpPath();
  if (!ytdlp) return res.status(500).json({ error: 'yt-dlp not found in container' });

  const cookiesPath = '/app/cookies.txt';
  const infoArgs = ['--dump-json', '--no-playlist', '--no-warnings', '--socket-timeout', '30'];
  if (fs.existsSync(cookiesPath)) infoArgs.push('--cookies', cookiesPath);
  infoArgs.push(url);

  const proc = spawn(ytdlp, infoArgs, {
    env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/root' }
  });
  let out = '', err = '';
  let responded = false;
  proc.stdout.on('data', d => out += d);
  proc.stderr.on('data', d => err += d);

  proc.on('error', spawnErr => {
    if (responded) return;
    responded = true;
    res.status(500).json({ error: `Failed to start yt-dlp: ${spawnErr.message}` });
  });

  proc.on('close', code => {
    if (responded) return;
    responded = true;
    if (code !== 0) return res.status(400).json({ error: err.trim() || 'Failed to fetch info' });
    try {
      const info = JSON.parse(out);
      const formats = (info.formats || [])
        .filter(f => f.ext && (f.vcodec !== 'none' || f.acodec !== 'none'))
        .map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution: f.resolution || (f.height ? `${f.width}x${f.height}` : null),
          vcodec: f.vcodec,
          acodec: f.acodec,
          filesize: f.filesize || f.filesize_approx,
          format_note: f.format_note,
          tbr: f.tbr,
          hasVideo: f.vcodec && f.vcodec !== 'none',
          hasAudio: f.acodec && f.acodec !== 'none',
        }));

      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration,
        uploader: info.uploader,
        view_count: info.view_count,
        formats,
      });
    } catch {
      res.status(500).json({ error: 'Failed to parse video info' });
    }
  });
});

// POST /api/download  — SSE stream of progress, ends with { type:'done', token }
app.post('/api/download', requireAuth, (req, res) => {
  const { url, format_id, audioOnly } = req.body;
  console.log('[download] request body:', JSON.stringify(req.body));
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const ytdlp = getYtDlpPath();
  if (!ytdlp) return res.status(500).json({ error: 'yt-dlp not found in container' });

  const dlDir = '/app/downloads';
  if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(dlDir, 'ytdlp-'));
  const outTemplate = path.join(tmpDir, '%(title)s.%(ext)s');

  const args = [
    '--no-playlist', '--newline', '--progress', '--no-quiet',
    '--socket-timeout', '30',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-o', outTemplate,
  ];

  const cookiesPath = '/app/cookies.txt';
  if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath, '--no-write-subs');
    console.log('[download] Using cookies.txt');
  } else {
    console.log('[download] No cookies.txt found at', cookiesPath);
  }

  if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3');
  } else if (format_id) {
    args.push('-f', `${format_id}+bestaudio/bestvideo+bestaudio/best`, '--merge-output-format', 'mp4');
  } else {
    args.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
  }
  args.push(url);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = obj => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  // Send an immediate confirmation so the browser knows the connection is live
  send({ type: 'progress', message: 'Starting yt-dlp...' });

  // Heartbeat so the browser doesn't think the connection stalled
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
    if (typeof res.flush === 'function') res.flush();
  }, 2000);

  console.log('[download] args:', args.join(' '));
  console.log('[download] running:', ytdlp, args.join(' '));
  const proc = spawn(ytdlp, args, {
    shell: false,
    env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/root' }
  });
  let stderrBuf = '';
  let downloadDone = false;

  proc.stderr.on('data', d => {
    stderrBuf += d.toString();
    for (const line of d.toString().split('\n')) {
      if (line.trim()) { console.log('[yt-dlp]', line); send({ type: 'progress', message: line }); }
    }
  });
  proc.stdout.on('data', d => {
    for (const line of d.toString().split('\n')) {
      if (line.trim()) { console.log('[yt-dlp stdout]', line); send({ type: 'progress', message: line }); }
    }
  });

  proc.on('close', code => {
    clearInterval(heartbeat);
    downloadDone = true;
    console.log('[download] exit code', code);
    if (stderrBuf.trim()) console.log('[yt-dlp full stderr]\n' + stderrBuf);

    if (code !== 0) {
      const errMsg = stderrBuf.trim().split('\n').slice(-3).join(' | ') || `yt-dlp failed (exit ${code})`;
      try { send({ type: 'error', message: errMsg }); res.end(); } catch {}
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
      return;
    }

    const files = fs.readdirSync(tmpDir).filter(f => !f.endsWith('.part'));
    if (!files.length) {
      try { send({ type: 'error', message: 'No output file found after download' }); res.end(); } catch {}
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
      return;
    }

    const fileName = files[0];
    const filePath = path.join(tmpDir, fileName);
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
    fileStore[token] = { filePath, name: fileName, tmpDir };

    setTimeout(() => {
      delete fileStore[token];
      try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    }, 10 * 60 * 1000);

    console.log('[download] done, token:', token, 'file:', fileName);
    try { send({ type: 'done', token, filename: fileName }); res.end(); } catch {}
  });

  proc.on('error', err => {
    clearInterval(heartbeat);
    try { send({ type: 'error', message: `Failed to start yt-dlp: ${err.message}` }); res.end(); } catch {}
  });

  req.on('close', () => {
    // Only kill if download hasn't started yet
    if (!downloadDone) {
      console.log('[download] client disconnected, keeping yt-dlp running');
    }
  });
});

// GET /api/file/:token  — serve the downloaded file
app.get('/api/file/:token', requireAuth, (req, res) => {
  const entry = fileStore[req.params.token];
  if (!entry) return res.status(404).json({ error: 'File not found or expired' });

  const { filePath, name } = entry;
  if (!fs.existsSync(filePath)) {
    delete fileStore[req.params.token];
    return res.status(404).json({ error: 'File no longer on disk' });
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(name).toLowerCase();
  const mime = { '.mp4':'video/mp4', '.webm':'video/webm', '.mkv':'video/x-matroska',
                 '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.opus':'audio/opus' }[ext] || 'application/octet-stream';

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
});

// Log all unhandled errors so they appear in docker logs
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, err?.message ?? err)
  if (!res.headersSent) res.status(500).json({ error: err?.message ?? 'Internal server error' })
})

export { app }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`\nFETCH running at http://localhost:${PORT}\n`)
    const ytdlp = getYtDlpPath()
    if (!ytdlp) { console.warn('WARNING: yt-dlp not found!'); return }
    try { console.log('yt-dlp', execSync(`${ytdlp} --version`, { encoding: 'utf8' }).trim()) } catch {}
  })
}
