# Zeloryn — Universal Windows PowerShell Installer
# Usage: irm https://raw.githubusercontent.com/yassin-kryleos/zeloryn/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$RepoOwner = "yassin-kryleos"
$RepoName = "zeloryn"
$GitHubRepo = "$RepoOwner/$RepoName"
$AppName = "Zeloryn"

Write-Host ""
Write-Host "  ______    _                        " -ForegroundColor Green
Write-Host " |___  /   | |                       " -ForegroundColor Green
Write-Host "    / / ___| | ___  _ __ _   _ _ __  " -ForegroundColor Green
Write-Host "   / / / _ \ |/ _ \| '__| | | | '_ \ " -ForegroundColor Green
Write-Host "  / /_|  __/ | (_) | |  | |_| | | | |" -ForegroundColor Green
Write-Host " /_____\___|_|\___/|_|   \__, |_| |_|" -ForegroundColor Green
Write-Host "                          __/ |      " -ForegroundColor Green
Write-Host "                         |___/       " -ForegroundColor Green
Write-Host "  Free, Open-Source, Local-First AI Software Engineering Cockpit`n" -ForegroundColor DarkGray

# Architecture detection
$Arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
if ($Arch -ne "x64") {
    Write-Error "Zeloryn currently requires a 64-bit (x64) Windows operating system."
    exit 1
}

Write-Host "==> " -ForegroundColor Blue -NoNewline
Write-Host "Detected environment: Windows ($Arch)"

# Determine installation version
$Version = $env:FORGE_VERSION
if (-not $Version) {
    Write-Host "==> " -ForegroundColor Blue -NoNewline
    Write-Host "Resolving latest release from GitHub..."
    try {
        $ReleaseResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$GitHubRepo/releases/latest" -Headers @{ "User-Agent" = "PowerShell" }
        $Version = $ReleaseResponse.tag_name
    } catch {
        $Version = "v0.1.0"
        Write-Warning "Could not query GitHub Releases API (rate limit or offline). Falling back to $Version."
    }
}

$CleanVersion = $Version.TrimStart("v")
$InstallerName = "$AppName-Setup-$CleanVersion.exe"
$DownloadUrl = "https://github.com/$GitHubRepo/releases/download/$Version/$InstallerName"

$TempDir = [System.IO.Path]::GetTempPath()
$TempInstallerPath = Join-Path $TempDir $InstallerName

Write-Host "==> " -ForegroundColor Blue -NoNewline
Write-Host "Downloading $InstallerName ($Version)..."

try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempInstallerPath -UseBasicParsing
} catch {
    Write-Error "Failed to download $InstallerName from GitHub Releases ($DownloadUrl). Please check https://github.com/$GitHubRepo/releases."
    exit 1
}

Write-Host "==> " -ForegroundColor Green -NoNewline
Write-Host "Launching $AppName installer..."

# Launch the NSIS installer
Start-Process -FilePath $TempInstallerPath

Write-Host ""
Write-Host "==> " -ForegroundColor Green -NoNewline
Write-Host "$AppName ($Version) installer started!"
Write-Host ""
Write-Host "What gets created:"
Write-Host "  * Start Menu / App Drawer shortcut (Zeloryn)"
Write-Host "  * Desktop shortcut (Zeloryn)"
Write-Host "  * Windows Programs list (Control Panel / Settings)"
Write-Host "  * Pin to Taskbar: Right-click Zeloryn in Start Menu or Desktop and select 'Pin to taskbar'"
Write-Host ""
Write-Host "Bring Your Own Key (BYOK):"
Write-Host "  Configure your Anthropic, OpenAI, or Ollama keys in the CONFIG modal."
Write-Host "Get Involved with Zeloryn (Free & Open Source - GPLv3):"
Write-Host "  Star on GitHub:    https://github.com/$GitHubRepo"
Write-Host "  Contribute & Docs: https://github.com/$GitHubRepo/blob/main/CONTRIBUTING.md"
Write-Host "  Report an Issue:   https://github.com/$GitHubRepo/issues`n"
