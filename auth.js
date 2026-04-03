// auth.js
import GitHub from '@auth/express/providers/github'
import Google from '@auth/express/providers/google'

function buildProviders() {
  const providers = []

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }))
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }))
  }

  if (
    process.env.AUTHENTIK_CLIENT_ID &&
    process.env.AUTHENTIK_CLIENT_SECRET &&
    process.env.AUTHENTIK_ISSUER
  ) {
    providers.push({
      id: 'authentik',
      name: 'Authentik',
      type: 'oidc',
      issuer: process.env.AUTHENTIK_ISSUER,
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
    })
  }

  return providers
}

const activeProviders = buildProviders()

export function getActiveProviderNames() {
  return activeProviders.map(p => ({ id: p.id, name: p.name }))
}

export const authConfig = {
  providers: activeProviders,
  trustHost: true,
}
