function validatedExternalUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error('Invalid external URL.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('External URLs containing credentials are not allowed.');
  }

  if (parsed.protocol === 'https:') return parsed.toString();

  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  if (parsed.protocol === 'http:' && isLoopback) return parsed.toString();

  throw new Error('Only HTTPS and explicit loopback HTTP URLs may be opened externally.');
}

module.exports = { validatedExternalUrl };
