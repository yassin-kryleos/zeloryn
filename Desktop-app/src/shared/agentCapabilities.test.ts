import { describe, it, expect } from 'vitest';
import { resolveAgentForCategory, profileForAgent, type InstalledAgent } from './agentCapabilities';

const bundled = (...names: string[]): InstalledAgent[] => names.map(name => ({ name }));

describe('agentCapabilities', () => {
  it('resolves bundled capabilities by name even without explicit fields', () => {
    expect(profileForAgent({ name: 'Security Auditor' })).toEqual({
      primaryCategory: 'security',
      capabilities: ['security', 'backend'],
    });
  });

  it('prefers an exact primary-category match', () => {
    const installed = bundled('Python Backend Specialist', 'Security Auditor');
    // backend is Python Backend Specialist's primary; Security Auditor only has it as a capability.
    const routing = resolveAgentForCategory('backend', installed);
    expect(routing).toEqual({ agentName: 'Python Backend Specialist', matchType: 'exact', category: 'backend' });
  });

  it('falls back to a capability-overlap match when no primary matches', () => {
    const installed = bundled('Security Auditor'); // covers security + backend, primary = security
    const routing = resolveAgentForCategory('backend', installed);
    expect(routing).toEqual({ agentName: 'Security Auditor', matchType: 'capability', category: 'backend' });
  });

  it('routes to general fallback when no installed agent covers the category', () => {
    const installed = bundled('Documentation Writer'); // docs only
    const routing = resolveAgentForCategory('infra', installed);
    expect(routing).toEqual({ agentName: null, matchType: 'fallback', category: 'infra' });
  });

  it('honors explicit capabilities on user-authored agents', () => {
    const installed: InstalledAgent[] = [{ name: 'My Infra Bot', primaryCategory: 'infra', capabilities: ['infra'] }];
    expect(resolveAgentForCategory('infra', installed)).toEqual({
      agentName: 'My Infra Bot',
      matchType: 'exact',
      category: 'infra',
    });
  });

  it('treats an empty install list as fallback', () => {
    expect(resolveAgentForCategory('frontend', [])).toEqual({
      agentName: null,
      matchType: 'fallback',
      category: 'frontend',
    });
  });
});
