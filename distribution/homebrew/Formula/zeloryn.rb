class Zeloryn < Formula
  desc "Free, open-source, local-first AI software engineering cockpit CLI launcher"
  homepage "https://github.com/yassin-kryleos/zeloryn"
  version "0.1.0"

  if OS.mac?
    if Hardware::CPU.arm?
      url "https://github.com/yassin-kryleos/zeloryn/releases/download/v#{version}/Zeloryn-#{version}-mac-arm64.zip"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/yassin-kryleos/zeloryn/releases/download/v#{version}/Zeloryn-#{version}-mac-x64.zip"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  elsif OS.linux?
    if Hardware::CPU.arm?
      url "https://github.com/yassin-kryleos/zeloryn/releases/download/v#{version}/Zeloryn-#{version}-linux-arm64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/yassin-kryleos/zeloryn/releases/download/v#{version}/Zeloryn-#{version}-linux-x64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  def install
    if OS.mac?
      prefix.install Dir["*"]
      bin.write_exec_script "#{prefix}/Zeloryn.app/Contents/MacOS/Zeloryn" => "zeloryn"
    else
      bin.install "zeloryn"
    end
  end

  test do
    assert_predicate bin/"zeloryn", :exist?
  end
end
