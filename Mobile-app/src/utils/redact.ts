export const redactSensitiveData = (text: string): string => {
  let result = text;
  result = result.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');
  result = result.replace(/sk-proj-[a-zA-Z0-9-]{20,}/g, '[REDACTED_API_KEY]');
  result = result.replace(/sk-ant-[a-zA-Z0-9-]{20,}/g, '[REDACTED_API_KEY]');
  result = result.replace(/AIzaSy[a-zA-Z0-9-_]{20,}/g, '[REDACTED_API_KEY]');
  // AWS access key IDs (AKIA/ASIA/AGPA/AIDA/AROA/ANPA/ANVA + 16 base32 chars).
  // Mirrors the AWS prefix coverage in the Desktop secret scanner.
  result = result.replace(/\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/g, '[REDACTED_API_KEY]');
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  result = result.replace(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 7) return '[REDACTED_PHONE]';
    return match;
  });
  return result;
};
