// tests/routes.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@auth/express', () => ({
  ExpressAuth: vi.fn(() => (_req, _res, next) => next()),
  getSession: vi.fn(),
}))

import { getSession } from '@auth/express'
import request from 'supertest'

async function getApp() {
  // Module is cached by ESM; mock is hoisted and applies to all imports
  const { app } = await import('../server.js')
  return app
}

describe('requireAuth — unauthenticated', () => {
  beforeEach(() => {
    getSession.mockResolvedValue(null)
  })

  it('GET /api/info returns 401 when not logged in', async () => {
    const app = await getApp()
    const res = await request(app).get('/api/info?url=https://example.com')
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error', 'Unauthorized')
  })

  it('GET / redirects to /login when not logged in', async () => {
    const app = await getApp()
    const res = await request(app).get('/')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/login')
  })
})

describe('requireAuth — authenticated', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({
      user: { name: 'Test User', email: 'test@example.com', image: 'https://example.com/avatar.jpg' }
    })
  })

  it('GET /api/info proceeds (does not return 401) when logged in', async () => {
    const app = await getApp()
    const res = await request(app).get('/api/info?url=https://example.com')
    expect(res.status).not.toBe(401)
  })
})

describe('public routes — no auth required', () => {
  beforeEach(() => {
    getSession.mockResolvedValue(null)
  })

  it('GET /login returns 200', async () => {
    const app = await getApp()
    const res = await request(app).get('/login')
    expect(res.status).toBe(200)
  })

  it('GET /api/providers returns 200 with provider list', async () => {
    const app = await getApp()
    const res = await request(app).get('/api/providers')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('/api/session', () => {
  it('returns user info when logged in', async () => {
    getSession.mockResolvedValue({
      user: { name: 'Test User', email: 'test@example.com', image: 'https://example.com/avatar.jpg' }
    })
    const app = await getApp()
    const res = await request(app).get('/api/session')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      image: 'https://example.com/avatar.jpg',
    })
  })

  it('returns 401 when not logged in', async () => {
    getSession.mockResolvedValue(null)
    const app = await getApp()
    const res = await request(app).get('/api/session')
    expect(res.status).toBe(401)
  })
})
