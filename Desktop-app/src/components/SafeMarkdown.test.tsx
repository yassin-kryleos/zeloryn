// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SafeMarkdown } from './SafeMarkdown';

describe('SafeMarkdown', () => {
  it('renders inline markdown and neutralizes injected HTML handlers', () => {
    const { container } = render(<SafeMarkdown text={'**Done** <img src=x onerror="window.pwned=1"> `npm test`'} />);
    expect(container.querySelector('strong')?.textContent).toBe('Done');
    expect(container.querySelector('code')?.textContent).toBe('npm test');
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
  });
});
