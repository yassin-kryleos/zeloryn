#!/usr/bin/env bash
#
# Zeloryn — Universal Terminal Installer (Linux & macOS)
# Usage: curl -fsSL https://raw.githubusercontent.com/yassin-kryleos/zeloryn/main/install.sh | bash
#

set -e

# Repository configuration
REPO_OWNER="yassin-kryleos"
REPO_NAME="zeloryn"
GITHUB_REPO="${REPO_OWNER}/${REPO_NAME}"
BINARY_NAME="zeloryn"
APP_NAME="Zeloryn"

# Formatting helpers
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
DIM="\033[2m"
RESET="\033[0m"

log_info() {
  printf "${BLUE}==>${RESET} ${BOLD}%s${RESET}\n" "$1"
}

log_success() {
  printf "${GREEN}==>${RESET} ${BOLD}%s${RESET}\n" "$1"
}

log_warn() {
  printf "${YELLOW}WARNING:${RESET} %s\n" "$1"
}

log_error() {
  printf "${RED}ERROR:${RESET} %s\n" "$1" >&2
}

# Banner
printf "\n"
printf "${BLUE}  _  __          _                     ______                    ${RESET}\n"
printf "${BLUE} | |/ /         | |                   |  ____|                   ${RESET}\n"
printf "${BLUE} | ' / _ __ _   _| | ___  ___  ___    | |__ ___  _ __ __ _  ___  ${RESET}\n"
printf "${BLUE} |  < | '__| | | | |/ _ \/ _ \/ __|   |  __/ _ \| '__/ _\` |/ _ \ ${RESET}\n"
printf "${BLUE} | . \| |  | |_| | |  __/ (_) \__ \   | | | (_) | | | (_| |  __/ ${RESET}\n"
printf "${BLUE} |_|\_\_|   \__, |_|\___|\___/|___/   |_|  \___/|_|  \__, |\___| ${RESET}\n"
printf "${BLUE}             __/ |                                    __/ |      ${RESET}\n"
printf "${BLUE}            |___/                                    |___/       ${RESET}\n"
printf "${DIM}  Free, Open-Source, Local-First AI Software Engineering Cockpit${RESET}\n\n"

# 1. Detect operating system
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="mac" ;;
  *)
    log_error "Unsupported operating system: $OS. Zeloryn supports Linux and macOS via this script (use winget on Windows)."
    exit 1
    ;;
esac

# 2. Detect machine architecture
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64)
    ARCH="x64"
    DEB_ARCH="amd64"
    ;;
  aarch64|arm64)
    ARCH="arm64"
    DEB_ARCH="arm64"
    ;;
  *)
    log_error "Unsupported architecture: $ARCH_RAW. Supported architectures: x86_64 (x64) and arm64."
    exit 1
    ;;
esac

log_info "Detected environment: ${PLATFORM} (${ARCH})"

# 3. Determine installation version
if [ -n "$FORGE_VERSION" ]; then
  VERSION="$FORGE_VERSION"
  log_info "Using specified version: ${VERSION}"
else
  log_info "Resolving latest release from GitHub..."
  LATEST_RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null || echo "")
  VERSION=$(echo "$LATEST_RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d '"' -f 4 || echo "")
  if [ -z "$VERSION" ]; then
    VERSION="v0.1.0"
    log_warn "Could not query GitHub Releases API (rate limit or offline). Falling back to release: ${VERSION}"
  else
    log_info "Latest release: ${VERSION}"
  fi
fi

# Clean version string (remove leading 'v' if needed for file names)
CLEAN_VERSION="${VERSION#v}"

# 4. Resolve installation paths
INSTALL_BIN_DIR="${FORGE_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$INSTALL_BIN_DIR"

# 5. Download and install
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ "$PLATFORM" = "linux" ]; then
  ASSET_NAME="Zeloryn-${CLEAN_VERSION}-linux-${ARCH}.AppImage"
  FALLBACK_ASSET="Zeloryn-${CLEAN_VERSION}-${ARCH}.AppImage"
  DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${ASSET_NAME}"

  APP_DIR="${FORGE_APP_DIR:-$HOME/.local/share/zeloryn}"
  mkdir -p "$APP_DIR"
  TARGET_APPIMAGE="${APP_DIR}/Zeloryn.AppImage"

  log_info "Downloading ${ASSET_NAME}..."
  if ! curl -fSL --progress-bar "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET_NAME}"; then
    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${FALLBACK_ASSET}"
    log_info "Attempting fallback asset: ${FALLBACK_ASSET}..."
    curl -fSL --progress-bar "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET_NAME}" || {
      log_error "Failed to download release asset from GitHub. Please check https://github.com/${GITHUB_REPO}/releases."
      exit 1
    }
  fi

  mv "${TMP_DIR}/${ASSET_NAME}" "$TARGET_APPIMAGE"
  chmod +x "$TARGET_APPIMAGE"

  # Create executable symlink/wrapper in ~/.local/bin
  WRAPPER_SCRIPT="${INSTALL_BIN_DIR}/${BINARY_NAME}"
  cat << EOF > "$WRAPPER_SCRIPT"
#!/bin/sh
exec "$TARGET_APPIMAGE" "\$@"
EOF
  chmod +x "$WRAPPER_SCRIPT"

  # Desktop launcher entry
  DESKTOP_DIR="$HOME/.local/share/applications"
  if [ -d "$DESKTOP_DIR" ] || mkdir -p "$DESKTOP_DIR" 2>/dev/null; then
    DESKTOP_FILE="${DESKTOP_DIR}/zeloryn.desktop"
    cat << EOF > "$DESKTOP_FILE"
[Desktop Entry]
Name=Zeloryn
Comment=Free, Open-Source AI Software Engineering Cockpit
Exec=${WRAPPER_SCRIPT} %U
Terminal=false
Type=Application
Categories=Development;IDE;
StartupWMClass=zeloryn
EOF
    chmod +x "$DESKTOP_FILE" 2>/dev/null || true
  fi

elif [ "$PLATFORM" = "mac" ]; then
  ASSET_NAME="Zeloryn-${CLEAN_VERSION}-mac-${ARCH}.dmg"
  FALLBACK_ASSET="Zeloryn-${CLEAN_VERSION}.dmg"
  DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${ASSET_NAME}"

  log_info "Downloading ${ASSET_NAME}..."
  if ! curl -fSL --progress-bar "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET_NAME}"; then
    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${FALLBACK_ASSET}"
    log_info "Attempting fallback asset: ${FALLBACK_ASSET}..."
    curl -fSL --progress-bar "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET_NAME}" || {
      log_error "Failed to download release asset from GitHub. Please check https://github.com/${GITHUB_REPO}/releases."
      exit 1
    }
  fi

  log_info "Mounting disk image..."
  MOUNT_DIR="${TMP_DIR}/mount"
  mkdir -p "$MOUNT_DIR"
  hdiutil attach "${TMP_DIR}/${ASSET_NAME}" -mountpoint "$MOUNT_DIR" -nobrowse -quiet

  APP_SOURCE="${MOUNT_DIR}/${APP_NAME}.app"
  if [ ! -d "$APP_SOURCE" ]; then
    APP_SOURCE=$(find "$MOUNT_DIR" -maxdepth 2 -name "*.app" | head -n 1)
  fi

  if [ -n "$APP_SOURCE" ] && [ -d "$APP_SOURCE" ]; then
    TARGET_APP_DIR="/Applications"
    if [ ! -w "$TARGET_APP_DIR" ]; then
      TARGET_APP_DIR="$HOME/Applications"
      mkdir -p "$TARGET_APP_DIR"
    fi
    log_info "Installing to ${TARGET_APP_DIR}/${APP_NAME}.app..."
    rm -rf "${TARGET_APP_DIR}/${APP_NAME}.app"
    cp -R "$APP_SOURCE" "${TARGET_APP_DIR}/"
  fi

  hdiutil detach "$MOUNT_DIR" -quiet || true

  # CLI launcher for macOS
  WRAPPER_SCRIPT="${INSTALL_BIN_DIR}/${BINARY_NAME}"
  cat << EOF > "$WRAPPER_SCRIPT"
#!/bin/sh
open -a "${TARGET_APP_DIR}/${APP_NAME}.app" --args "\$@"
EOF
  chmod +x "$WRAPPER_SCRIPT"
fi

# 6. Check PATH
case ":$PATH:" in
  *":$INSTALL_BIN_DIR:"*) PATH_CONFIGURED=true ;;
  *) PATH_CONFIGURED=false ;;
esac

log_success "Zeloryn (${VERSION}) installed successfully!"

if [ "$PATH_CONFIGURED" = false ]; then
  printf "\n${YELLOW}!${RESET} Notice: ${BOLD}%s${RESET} is not in your current PATH.\n" "$INSTALL_BIN_DIR"
  printf "  Add it to your shell profile (~/.bashrc or ~/.zshrc):\n"
  printf "    ${BOLD}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}\n\n"
fi

printf "To launch the cockpit:\n"
printf "  ${BOLD}%s${RESET}\n\n" "$BINARY_NAME"
printf "Bring Your Own Key (BYOK):\n"
printf "  Open the app and configure your Anthropic, OpenAI, or Ollama keys in the CONFIG modal.\n"
printf "  Visit ${BOLD}https://github.com/%s${RESET} for documentation and guides.\n\n" "$GITHUB_REPO"
