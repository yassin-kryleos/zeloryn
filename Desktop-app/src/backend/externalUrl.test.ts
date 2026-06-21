import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validatedExternalUrl } = require('./externalUrl.cjs') as { validatedExternalUrl: (url: string) => string };

describe('validatedExternalUrl', () => {
  it('allows HTTPS and explicit loopback HTTP URLs', () => {
    expect(validatedExternalUrl('https://kryleos.com/path')).toBe('https://kryleos.com/path');
    expect(validatedExternalUrl('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173/');
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,pwned', 'http://example.com', 'https://user:pass@example.com'])(
    'rejects unsafe external URL %s',
    (url) => expect(() => validatedExternalUrl(url)).toThrow(),
  );
});
