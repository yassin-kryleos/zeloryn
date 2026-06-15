// Client-side PII/secret redaction applied to outgoing chat/plan queries when
// the PII filter is enabled. Mirrors Mobile-app's canonical redactSensitiveData
// (src/utils/redact.ts), including the AWS access-key pattern.
export const redactSensitiveData = (text: string): string => {
  let result = text;
  // 1. Redact Emails
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  // 2. Redact Phone numbers
  result = result.replace(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 7) return '[REDACTED_PHONE]';
    return match;
  });
  // 3. Redact API Keys
  result = result.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');
  result = result.replace(/sk-proj-[a-zA-Z0-9-]{20,}/g, '[REDACTED_API_KEY]');
  result = result.replace(/sk-ant-[a-zA-Z0-9-]{20,}/g, '[REDACTED_API_KEY]');
  result = result.replace(/AIzaSy[a-zA-Z0-9-_]{20,}/g, '[REDACTED_API_KEY]');
  // AWS access key IDs (AKIA/ASIA/AGPA/AIDA/AROA/ANPA/ANVA + 16 base32 chars).
  result = result.replace(/\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/g, '[REDACTED_API_KEY]');
  return result;
};
