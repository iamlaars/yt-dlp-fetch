import { spawn } from 'child_process'

// Guard against doubled URLs (e.g. "https://...https://...").
export function sanitizeUrl(raw) {
  const s = (raw ?? '').trim()
  const second = s.indexOf('http', 4)
  return second !== -1 ? s.slice(0, second).trim() : s
}

export function isPlaylistUrl(raw) {
  try {
    const u = new URL(raw)
    return (
      ['youtube.com', 'www.youtube.com'].includes(u.hostname) &&
      u.searchParams.has('list')
    )
  } catch {
    return false
  }
}

// yt-dlp sometimes prints warnings before JSON — find the first { ... }
export function parseYtDlpJson(raw) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON in yt-dlp output')
  return JSON.parse(raw.slice(start, end + 1))
}

export function updateYtDlp(ytdlpBin = 'yt-dlp') {
  return new Promise((resolve) => {
    console.log('[yt-dlp] Checking for updates...')
    const proc = spawn(ytdlpBin, ['-U'])
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      if (code === 0) {
        const match = stdout.match(/yt-dlp is already up.*|Updated yt-dlp.*/i)
        console.log('[yt-dlp]', match ? match[0] : 'update check completed')
        resolve(true)
      } else {
        const msg = (stderr || stdout).trim().slice(0, 200) || `exit code ${code}`
        console.warn('[yt-dlp] update failed:', msg)
        resolve(false)
      }
    })
    proc.on('error', err => {
      console.error('[yt-dlp] failed to run update:', String(err))
      resolve(false)
    })
    // Don't block startup — kill after 30 s
    setTimeout(() => {
      if (proc.exitCode === null) {
        console.warn('[yt-dlp] update check timed out (30s)')
        proc.kill()
        resolve(false)
      }
    }, 30_000)
  })
}

// Returns the interval ID so the caller can stop it with stopScheduledYtDlpUpdate().
export function startScheduledYtDlpUpdate(ytdlpBin = 'yt-dlp', intervalHours = 24, delayMinutes = 5) {
  console.log(`[yt-dlp] Scheduling update checks every ${intervalHours}h (first in ${delayMinutes}m)`)
  const initialTimeout = setTimeout(() => updateYtDlp(ytdlpBin), delayMinutes * 60 * 1000)
  const intervalId = setInterval(() => updateYtDlp(ytdlpBin), intervalHours * 60 * 60 * 1000)
  intervalId._initialTimeout = initialTimeout
  return intervalId
}

export function stopScheduledYtDlpUpdate(intervalId) {
  clearInterval(intervalId)
  if (intervalId._initialTimeout) clearTimeout(intervalId._initialTimeout)
  console.log('[yt-dlp] Stopped scheduled update checks')
}
