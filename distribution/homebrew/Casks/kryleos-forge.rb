cask "kryleos-forge" do
  arch arm: "arm64", intel: "x64"

  version "0.1.0"
  sha256 arm: "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/thetimelord69/Kryleos-forge/releases/download/v#{version}/Kryleos-Forge-#{version}-mac-#{arch}.dmg"
  name "Kryleos Forge"
  desc "Free, open-source, local-first AI software engineering cockpit"
  homepage "https://github.com/thetimelord69/Kryleos-forge"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates false

  app "Kryleos Forge.app"
  binary "#{appdir}/Kryleos Forge.app/Contents/MacOS/Kryleos Forge", target: "kryleos-forge"

  zap trash: [
    "~/.kryleos",
    "~/Library/Application Support/kryleos-forge",
    "~/Library/Preferences/com.kryleos.forge.plist",
    "~/Library/Saved Application State/com.kryleos.forge.savedState",
  ]
end
