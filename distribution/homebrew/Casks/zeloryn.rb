cask "zeloryn" do
  arch arm: "arm64", intel: "x64"

  version "0.1.0"
  sha256 arm: "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/yassin-kryleos/zeloryn/releases/download/v#{version}/Zeloryn-#{version}-#{arch}.dmg"
  name "Zeloryn"
  desc "Free, open-source, local-first AI software engineering cockpit"
  homepage "https://github.com/yassin-kryleos/zeloryn"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates false

  app "Zeloryn.app"
  binary "#{appdir}/Zeloryn.app/Contents/MacOS/Zeloryn", target: "zeloryn"

  zap trash: [
    "~/.kryleos",
    "~/Library/Application Support/zeloryn",
    "~/Library/Preferences/com.zeloryn.app.plist",
    "~/Library/Saved Application State/com.zeloryn.app.savedState",
  ]
end
