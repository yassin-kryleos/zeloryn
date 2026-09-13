class Forge < Formula
  desc "Free, open-source, local-first AI software engineering cockpit CLI launcher"
  homepage "https://github.com/thetimelord69/Kryleos-forge"
  version "0.1.0"

  if OS.mac?
    if Hardware::CPU.arm?
      url "https://github.com/thetimelord69/Kryleos-forge/releases/download/v#{version}/Kryleos-Forge-#{version}-mac-arm64.zip"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/thetimelord69/Kryleos-forge/releases/download/v#{version}/Kryleos-Forge-#{version}-mac-x64.zip"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  elsif OS.linux?
    if Hardware::CPU.arm?
      url "https://github.com/thetimelord69/Kryleos-forge/releases/download/v#{version}/Kryleos-Forge-#{version}-linux-arm64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/thetimelord69/Kryleos-forge/releases/download/v#{version}/Kryleos-Forge-#{version}-linux-x64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  def install
    if OS.mac?
      prefix.install Dir["*"]
      bin.write_exec_script "#{prefix}/Kryleos Forge.app/Contents/MacOS/Kryleos Forge" => "kryleos-forge"
    else
      bin.install "kryleos-forge"
    end
  end

  test do
    assert_predicate bin/"kryleos-forge", :exist?
  end
end
