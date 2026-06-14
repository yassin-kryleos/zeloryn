export interface SecretScanResult {
  secretType: string;
  foundText: string;
  line?: number;
}

export function scanSecrets(text: string): SecretScanResult[] {
  const results: SecretScanResult[] = [];
  if (!text) return results;

  const lines = text.split(/\r?\n/);
  const regexes = [
    { type: 'OpenAI API Key', regex: /sk-(?!(?:ant|or)-)[a-zA-Z0-9_-]{24,}/g },
    { type: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9]{24,}/g },
    { type: 'Google API Key', regex: /AIzaSy[a-zA-Z0-9_-]{33}/g },
    // SEC-M3: expanded coverage.
    { type: 'AWS Access Key ID', regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/g },
    { type: 'GitHub Token', regex: /\bgh[posru]_[A-Za-z0-9]{36,}\b/g },
    { type: 'Stripe Live Key', regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
    { type: 'Slack Token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    { type: 'JWT', regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
    { type: 'Private Key', regex: /-----BEGIN (?:RSA |EC |PGP )?PRIVATE KEY-----/g },
    { type: 'Generic Password/Token Assignment', regex: /(?:password|secret|token|api_key|apikey)\s*[:=]\s*["']([a-zA-Z0-9_.-]{8,})["']/gi }
  ];

  lines.forEach((line, idx) => {
    regexes.forEach(({ type, regex }) => {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(line)) !== null) {
        const foundText = match[1] || match[0];
        results.push({
          secretType: type,
          foundText: foundText.substring(0, 8) + '...',
          line: idx + 1
        });
      }
    });
  });

  return results;
}
