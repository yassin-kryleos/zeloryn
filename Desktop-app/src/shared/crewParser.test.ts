import { describe, expect, it } from 'vitest';
import { parseCrewItems } from './crewParser';

describe('parseCrewItems', () => {
  it('parses multiple ITEM blocks correctly', () => {
    const text = `
Some intro text from the agent.

### [ITEM] Authentication System
- Status: Revised
- Category: backend
- Changes: OAuth deferred to V2; email/password only for V1.
- Criteria hint: loginEndpoint exists, auth middleware applied to protected routes.

### [ITEM] User Dashboard
- Status: Accepted
- Category: frontend
- Changes: none.
- Criteria hint: DashboardPage component renders without error.

Some outro text.
`;

    const result = parseCrewItems(text);
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      title: 'Authentication System',
      status: 'Revised',
      category: 'backend',
      changes: 'OAuth deferred to V2; email/password only for V1.',
      criteriaHint: 'loginEndpoint exists, auth middleware applied to protected routes.'
    });

    expect(result[1]).toEqual({
      title: 'User Dashboard',
      status: 'Accepted',
      category: 'frontend',
      changes: 'none.',
      criteriaHint: 'DashboardPage component renders without error.'
    });
  });

  it('handles empty or missing fields gracefully', () => {
    const text = `
### [ITEM] Minimal Item
- Category: docs
`;
    const result = parseCrewItems(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Minimal Item',
      status: 'Accepted', // default
      category: 'docs',
      changes: '',
      criteriaHint: ''
    });
  });
});
