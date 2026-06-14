// Data-disclosure support: resolve which hosted provider a model call goes to,
// or null when the call stays local (Ollama). Mirrors the provider detection in
// backend/costGuard.ts, which cannot be imported in the renderer (it uses fs).
export function hostedProviderForModel(model: string): string | null {
  const m = (model || '').toLowerCase();
  if (!m || m.startsWith('ollama:') || m === 'llama3' || m === 'qwen2.5-coder') return null;
  if (m.startsWith('gemini')) return 'Google Gemini';
  if (m.startsWith('gpt')) return 'OpenAI';
  if (m.startsWith('claude')) return 'Anthropic';
  if (m.includes('/') || m.startsWith('meta-')) return 'OpenRouter';
  if (m.startsWith('deepseek')) return 'DeepSeek';
  return 'Hosted provider';
}
