import React from 'react';
import { sanitizedInlineMarkdown } from './markdownSanitizer';

export function SafeMarkdown({ text, className }: { text: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: sanitizedInlineMarkdown(text) }} />;
}
