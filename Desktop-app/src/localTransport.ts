// Injects local-session auth into fetch and WebSocket calls targeting the
// admin backend (port 3001). Two paths:
//   1) Electron (preload.cjs) → getSessionSecret() keeps the secret in sync
//      with the child backend process spawned by the main process.
//   2) Vite dev (build-time)  → import.meta.env.VITE_KRYLEOS_LOCAL_SESSION_SECRET
//      is injected at dev launch time.

declare global {
  interface Window {
    electronAPI?: {
      selectDirectory?: () => Promise<string | null>
      encryptString?: (plainText: string) => Promise<string>
      decryptString?: (cipherTextBase64: string) => Promise<string>
      isEncryptionAvailable?: () => Promise<boolean>
      openExternal?: (url: string) => Promise<void>
      checkForUpdates?: () => Promise<{ success: boolean; version?: string; hasUpdate?: boolean; releaseUrl?: string; error?: string }>
      onUpdateAvailable?: (callback: (info: { version: string; releaseUrl: string }) => void) => () => void
      getSessionSecret?: () => string
      authenticatedFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      authenticatedWebSocketUrl?: (url: string) => string
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

const sessionSecret =
  (typeof window !== 'undefined' && window.electronAPI?.getSessionSecret ? window.electronAPI.getSessionSecret() : '') ||
  (import.meta.env.VITE_KRYLEOS_LOCAL_SESSION_SECRET as string | undefined) ||
  ''

if (typeof window !== 'undefined' && sessionSecret) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!isAdminHttpUrl(input)) return originalFetch(input, init)
    if (window.electronAPI?.authenticatedFetch) {
      return window.electronAPI.authenticatedFetch(input, init)
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    headers.set('X-Kryleos-Session', sessionSecret)
    return originalFetch(input, { ...init, headers })
  }

  const NativeWebSocket = window.WebSocket
  class AuthenticatedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const targetUrl = typeof url === 'string' ? url : url.toString()
      if (isAdminWsUrl(targetUrl)) {
        if (window.electronAPI?.authenticatedWebSocketUrl) {
          super(window.electronAPI.authenticatedWebSocketUrl(targetUrl), protocols)
          return
        }
        try {
          const target = new URL(targetUrl, window.location.href)
          target.searchParams.set('session', sessionSecret)
          super(target.toString(), protocols)
          return
        } catch {
          // fallback
        }
      }
      super(targetUrl, protocols)
    }
  }
  Object.defineProperty(window, 'WebSocket', { value: AuthenticatedWebSocket, configurable: false, writable: false })
}

export {}
