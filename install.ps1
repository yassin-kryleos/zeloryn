# Zeloryn — Windows PowerShell Installer
# Usage: irm https://raw.githubusercontent.com/yassin-kryleos/zeloryn/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'

$RepoOwner = "yassin-kryleos"
$RepoName  = "zeloryn"
$GithubRepo = "$RepoOwner/$RepoName"

Write-Host ""
Write-Host "==> Installing Zeloryn for Windows..." -ForegroundColor Cyan

try {
    Write-Host "==> Resolving latest release..." -ForegroundColor Gray
    $ReleaseUrl = "https://api.github.com/repos/$GithubRepo/releases/latest"
    $Release = Invoke-RestMethod -Uri $ReleaseUrl -Headers @{ "User-Agent" = "PowerShell" }
    $Tag = $Release.tag_name
    Write-Host "==> Found version: $Tag" -ForegroundColor Green

    # Find installer asset (.exe)
    $Asset = $Release.assets | Where-Object { $_.name -like "*Setup*.exe" -or $_.name -like "*.exe" } | Select-Object -First 1

    if (-not $Asset) {
        throw "Could not locate a Windows .exe installer asset in release $Tag."
    }

    $InstallerUrl = $Asset.browser_download_url
    $TempInstaller = Join-Path $env:TEMP $Asset.name

    Write-Host "==> Downloading $($Asset.name)..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $InstallerUrl -OutFile $TempInstaller

    Write-Host "==> Launching installer..." -ForegroundColor Green
    Start-Process -FilePath $TempInstaller -Wait

    Write-Host "==> Zeloryn installation complete!" -ForegroundColor Green
    Write-Host "    Launch Zeloryn from your Start Menu or Desktop shortcut." -ForegroundColor Cyan
}
catch {
    Write-Host "ERROR: Installation failed: $_" -ForegroundColor Red
    Write-Host "Please download the installer directly from https://github.com/$GithubRepo/releases" -ForegroundColor Yellow
}
