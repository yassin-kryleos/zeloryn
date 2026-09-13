# Zeloryn — Web Companion Dashboard

The Web Companion is a lightweight, browser-based dashboard for Zeloryn. It allows you to monitor build tasks, review specifications, and interact with the Forge lifecycle from any web browser without needing to run the full Electron desktop shell.

---

## Capabilities

- **Lightweight Access**: Connect to your running Desktop Forge instance from another machine on your local network or over a private encrypted mesh (Tailscale / Cloudflare Tunnel).
- **Workspace Navigation**: Review active tasks on the Kanban board, inspect feature specifications, and view agent progress.
- **BYOK & Offline First**: Zero cloud tracking or metered relays. Directly communicates with your desktop's local Express server via secure pairing.

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher

### Installation & Development

```bash
# Install dependencies
npm install

# Start Vite development server (default: http://localhost:5173)
npm run dev
```

### Production Build

```bash
# Typecheck and compile static assets to dist/
npm run build

# Preview production build locally
npm run preview
```

---

## Connecting to Desktop Forge

1. Ensure the Desktop Forge backend is running (`cd ../Desktop-app && npm run dev`).
2. If connecting from another device on your network:
   - Ensure `KRYLEOS_BIND_HOST=0.0.0.0` is set in `Desktop-app/.env`.
   - Retrieve your desktop's pairing code from the Desktop app UI.
3. Open the Web Companion in your browser and enter:
   - **Backend URL**: `http://localhost:3001` (or your desktop's LAN / Tailscale IP: `http://100.x.y.z:3001`).
   - **Pairing Token**: The one-time authentication token displayed on your desktop.
4. Once paired, the web companion communicates directly with your desktop backend over WebSocket and HTTP.

---

## Testing

```bash
# Run unit and functional tests via Vitest
npm test
```

---

## License

Part of Zeloryn. Licensed under the Apache License 2.0. See [LICENSE](../LICENSE).
