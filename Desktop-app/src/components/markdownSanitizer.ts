import DOMPurify from 'dompurify';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizedInlineMarkdown(value: string): string {
  const escaped = escapeHtml(value.replace(/<[^>]*>/g, ''));
  const formatted = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  return DOMPurify.sanitize(formatted, { ALLOWED_TAGS: ['strong', 'code'], ALLOWED_ATTR: [] });
}
