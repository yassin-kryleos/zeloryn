// Injects local-session auth into fetch and WebSocket calls targeting the
// admin backend (port 3001). Two paths:
//   1) Electron (preload.cjs) → authenticatedFetch / authenticatedWebSocketUrl
//      wrappers keep the secret in the isolated preload closure.
//   2) Vite dev (build-time)  → import.meta.env.VITE_KRYLEOS_LOCAL_SESSION_SECRET
//      is a compile-time injection, not readable at runtime from the console.

declare global {
  interface Window {
    electronAPI?: {
      authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      authenticatedWebSocketUrl: (url: string) => string
    }
  }
}

const isAdminHttpUrl = (input: RequestInfo | URL): boolean => {
  const raw = input instanceof Request ? input.url : input.toString()
  const url = new URL(raw, window.location.href)
  return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '3001'
}

const isAdminWsUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.port === '3001'
  } catch {
    return false
  }
}

// ── Electron path ──────────────────────────────────────────────────────────
if (window.electronAPI?.authenticatedFetch) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!isAdminHttpUrl(input)) return originalFetch(input, init)
    return window.electronAPI!.authenticatedFetch(input, init)
  }

  const NativeWebSocket = window.WebSocket
  class AuthenticatedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const targetUrl = typeof url === 'string' ? url : url.toString()
      if (isAdminWsUrl(targetUrl)) {
        super(window.electronAPI!.authenticatedWebSocketUrl(targetUrl), protocols)
      } else {
        super(targetUrl, protocols)
      }
    }
  }
  Object.defineProperty(window, 'WebSocket', { value: AuthenticatedWebSocket, configurable: false, writable: false })
}

// ── Vite dev path ──────────────────────────────────────────────────────────
const devSessionSecret = import.meta.env.VITE_KRYLEOS_LOCAL_SESSION_SECRET
if (devSessionSecret && !window.electronAPI) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!isAdminHttpUrl(input)) return originalFetch(input, init)
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    headers.set('X-Kryleos-Session', devSessionSecret)
    return originalFetch(input, { ...init, headers })
  }

  const NativeWebSocket = window.WebSocket
  class AuthenticatedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const target = new URL(url.toString(), window.location.href)
      if (isAdminHttpUrl(url)) {
        target.searchParams.set('session', devSessionSecret)
      }
      super(target.toString(), protocols)
    }
  }
  Object.defineProperty(window, 'WebSocket', { value: AuthenticatedWebSocket, configurable: false, writable: false })
}

export {}
