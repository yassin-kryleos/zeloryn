# Kryleos Forge Invited-Beta Install Guide

Updated June 15, 2026.

## Windows

1. Download the Windows installer from the project's release page.
2. SmartScreen may show "Windows protected your PC" because this beta is unsigned. Verify the release source, select **More info**, then **Run anyway**.
3. Choose an install directory and launch Kryleos Forge.
4. Accept the Terms and Privacy notice before allowing shell commands.
5. Select **Run no-key demo**. A green trace should appear in Build Loop without an API key.

## macOS

1. Download and open the DMG, then drag Kryleos Forge to Applications.
2. Gatekeeper may block the unsigned beta. In System Settings > Privacy & Security, confirm the app came from the expected release, then choose **Open Anyway**.
3. Launch the app and run the no-key demo.

## Linux

Install the provided package for your distribution, then launch Kryleos Forge. Some distributions require making an AppImage executable with `chmod +x`.

## Models

- No model is required for the deterministic demo.
- For private local use, install Ollama and pull a model, for example `ollama pull qwen2.5-coder:7b`.
- Local 7B models can miss complex tool or acceptance-criteria behavior. Use a stronger local or hosted model for high-reasoning drift/review work.

## Companion

Use the desktop's LAN or Tailscale address from another device. `localhost` on a phone means the phone, not the desktop. Internet-wide zero-setup pairing is not shipped.

## Uninstall and data

The Config screen can clear credentials and local app data. Repository files and each workspace's `.kryleos/` evidence directory are deliberately preserved. Delete those workspace folders manually if full removal is required.
