# Zeloryn — Mobile Companion

The Mobile Companion is an Expo / React Native application for iOS and Android. It enables developers to draft feature specifications offline while traveling and securely monitor autonomous agent builds on their desktop from anywhere.

---

## Key Features

- **Offline-First Ideation (PLAN)**:
  - Capture feature ideas, user stories, and acceptance criteria while offline.
  - Plans are stored in local device storage and automatically queued for syncing once reconnected.
- **Secure Peer-to-Peer Pairing**:
  - Pair instantly with Desktop Forge by scanning the on-screen QR code or entering the pairing token (`COMPANION_AUTH_TOKEN`).
  - No middleman cloud servers or telemetry.
- **Zero-Cost Remote Monitoring**:
  - Connect across the internet with no hosted relay by using **Tailscale** (private encrypted WireGuard mesh) or a **Cloudflare Tunnel**.
  - Monitor card transitions, view build output, and review test status in real time.
- **Sensitive Data Protection**:
  - Built-in regex redaction sanitizes API keys, secrets, and environment tokens on the client before displaying logs on mobile screens.

---

## Development Setup

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Expo Go App**: Install on your physical phone ([iOS App Store](https://apps.apple.com/app/expo-go/id982107779) / [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)), or configure an iOS Simulator / Android Emulator.

### Installation

```bash
# Navigate to mobile app directory
cd Mobile-app

# Install dependencies
npm install

# Start Expo development server
npx expo start
```

Scan the terminal QR code with the camera app (iOS) or Expo Go app (Android) to launch the development build on your device.

---

## Pairing with Desktop Forge

### On the Local Network (LAN)
1. In Desktop Forge, ensure `KRYLEOS_BIND_HOST=0.0.0.0` is configured in `Desktop-app/.env`.
2. Open the pairing modal on your desktop to view your local IP and pairing code.
3. In the mobile app, tap **Pair Device**, point the camera at the QR code, or manually input:
   - **Backend URL**: `http://<desktop-ip>:3001`
   - **Token**: The one-time pairing token.

### Over the Internet (Tailscale / Cloudflare Tunnel)
To connect securely from outside your home Wi-Fi with zero hosting costs:
1. **Tailscale**: Install the Tailscale app on both your desktop machine and mobile device. Both will join your private encrypted tailnet.
2. In the mobile app, set the backend URL to your desktop's Tailscale IP (e.g. `http://100.x.y.z:3001`).
3. Enter your desktop pairing token to establish the secure session.

---

## Testing & Quality

```bash
# Run unit and functional tests
npm test

# Run TypeScript typecheck
npx tsc --noEmit
```

---

## License

Part of Zeloryn. Licensed under the Apache License 2.0. See [LICENSE](../LICENSE).
