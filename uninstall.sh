#!/usr/bin/env bash
#
# Zeloryn — Universal Uninstaller (Linux & macOS)
# Usage: curl -fsSL https://raw.githubusercontent.com/yassin-kryleos/zeloryn/main/uninstall.sh | bash
#   or:  zeloryn uninstall [--purge]
#

set -e

# Repository & Binary configuration
BINARY_NAME="zeloryn"
APP_NAME="Zeloryn"
INSTALL_BIN_DIR="${FORGE_INSTALL_DIR:-$HOME/.local/bin}"
APP_DIR="${FORGE_APP_DIR:-$HOME/.local/share/zeloryn}"
DESKTOP_DIR="$HOME/.local/share/applications"
PURGE_DATA=false

for arg in "$@"; do
  case "$arg" in
    --purge|-p)
      PURGE_DATA=true
      ;;
  esac
done

# Formatting helpers
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
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

log_info "Uninstalling ${APP_NAME}..."

# 1. Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="mac" ;;
  *)       PLATFORM="unknown" ;;
esac

# 2. Stop running instances
if command -v pkill >/dev/null 2>&1; then
  pkill -f "zeloryn" 2>/dev/null || true
fi

# 3. Remove application files
if [ "$PLATFORM" = "linux" ]; then
  # Remove AppImage directory
  if [ -d "$APP_DIR" ]; then
    log_info "Removing ${APP_DIR}..."
    rm -rf "$APP_DIR"
  fi

  # Remove launcher script
  if [ -f "${INSTALL_BIN_DIR}/${BINARY_NAME}" ]; then
    log_info "Removing executable ${INSTALL_BIN_DIR}/${BINARY_NAME}..."
    rm -f "${INSTALL_BIN_DIR}/${BINARY_NAME}"
  fi

  # Remove .desktop entry
  if [ -f "${DESKTOP_DIR}/zeloryn.desktop" ]; then
    log_info "Removing desktop entry ${DESKTOP_DIR}/zeloryn.desktop..."
    rm -f "${DESKTOP_DIR}/zeloryn.desktop"
  fi

  # Remove icons
  rm -f "$HOME/.local/share/icons/hicolor"/*/apps/zeloryn.png 2>/dev/null || true

  # Purge configuration / local state if requested
  if [ "$PURGE_DATA" = true ]; then
    log_info "Purging user data and preferences (--purge)..."
    rm -rf "$HOME/.config/zeloryn"
    rm -rf "$HOME/.config/Kryleos Forge"
  else
    printf "\n${YELLOW}!${RESET} Note: Configuration & keys preserved at: ${BOLD}%s${RESET}\n" "$HOME/.config/zeloryn"
    printf "  To remove configuration data as well, run: ${BOLD}rm -rf ~/.config/zeloryn${RESET}\n\n"
  fi

elif [ "$PLATFORM" = "mac" ]; then
  # Remove macOS .app bundle
  if [ -d "/Applications/${APP_NAME}.app" ]; then
    log_info "Removing /Applications/${APP_NAME}.app..."
    rm -rf "/Applications/${APP_NAME}.app"
  elif [ -d "$HOME/Applications/${APP_NAME}.app" ]; then
    log_info "Removing $HOME/Applications/${APP_NAME}.app..."
    rm -rf "$HOME/Applications/${APP_NAME}.app"
  fi

  # Remove CLI wrapper
  if [ -f "${INSTALL_BIN_DIR}/${BINARY_NAME}" ]; then
    log_info "Removing CLI executable ${INSTALL_BIN_DIR}/${BINARY_NAME}..."
    rm -f "${INSTALL_BIN_DIR}/${BINARY_NAME}"
  fi

  # Purge macOS application support if requested
  if [ "$PURGE_DATA" = true ]; then
    log_info "Purging application data (--purge)..."
    rm -rf "$HOME/Library/Application Support/zeloryn"
    rm -rf "$HOME/Library/Application Support/Kryleos Forge"
  else
    printf "\n${YELLOW}!${RESET} Note: Configuration & keys preserved at: ${BOLD}%s${RESET}\n" "$HOME/Library/Application Support/zeloryn"
    printf "  To remove configuration data as well, run: ${BOLD}rm -rf ~/Library/Application\\ Support/zeloryn${RESET}\n\n"
  fi
fi

log_success "${APP_NAME} has been completely removed from your system."
