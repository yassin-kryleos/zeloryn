// Agent specialization capability map and routing resolver.
//
// Implements the "Agent Specialization per Plan Item" requirement: when a plan
// item is sent to FORGE, routing follows a capability-map hierarchy —
//   1. Exact match:      item category === an installed agent's primary category.
//   2. Capability overlap: an installed agent lists the item category in capabilities[].
//   3. General fallback:  no match — route to the default orchestrator with the
//                         category passed as a system-prompt context hint, and the
//                         FLOW card shows "No <category> specialist — using general agent."
//
// The capability map below is the canonical coverage for the bundled starter-pack
// agents. Installed agent records that carry explicit `primaryCategory`/`capabilities`
// fields override the bundled lookup (so user-authored agents route correctly too).

export type ItemCategory = 'frontend' | 'backend' | 'testing' | 'security' | 'docs' | 'infra';

export interface AgentCapabilityProfile {
  primaryCategory?: ItemCategory;
  capabilities: ItemCategory[];
}

export interface InstalledAgent {
  name: string;
  role?: string;
  primaryCategory?: ItemCategory;
  capabilities?: ItemCategory[];
}

export type AgentMatchType = 'exact' | 'capability' | 'fallback';

export interface AgentRouting {
  agentName: string | null;
  matchType: AgentMatchType;
  category: ItemCategory;
}

// Canonical capability map for bundled starter-pack agents (keyed by agent name,
// matched case-insensitively). Mirrors the spec's capability map exactly.
export const BUNDLED_AGENT_CAPABILITIES: Record<string, AgentCapabilityProfile> = {
  'react expert': { primaryCategory: 'frontend', capabilities: ['frontend'] },
  'security auditor': { primaryCategory: 'security', capabilities: ['security', 'backend'] },
  'test writer': { primaryCategory: 'testing', capabilities: ['testing', 'frontend', 'backend'] },
  'documentation writer': { primaryCategory: 'docs', capabilities: ['docs'] },
  // Performance Reviewer has no single "performance" item category; it covers three.
  'performance reviewer': { capabilities: ['frontend', 'backend', 'infra'] },
  'python backend specialist': { primaryCategory: 'backend', capabilities: ['backend'] },
  'devops specialist': { primaryCategory: 'infra', capabilities: ['infra'] },
};

// Resolve the effective capability profile for an installed agent: explicit fields
// on the record win; otherwise fall back to the bundled map by name.
export function profileForAgent(agent: InstalledAgent): AgentCapabilityProfile {
  const bundled = BUNDLED_AGENT_CAPABILITIES[agent.name?.trim().toLowerCase()];
  const capabilities = (agent.capabilities && agent.capabilities.length > 0)
    ? agent.capabilities
    : (bundled?.capabilities || []);
  const primaryCategory = agent.primaryCategory || bundled?.primaryCategory;
  return { primaryCategory, capabilities };
}

// Resolve which installed agent should execute an item of the given category.
export function resolveAgentForCategory(
  category: ItemCategory,
  installedAgents: InstalledAgent[]
): AgentRouting {
  const agents = installedAgents || [];

  // 1. Exact match: item category === agent's declared primary category.
  for (const agent of agents) {
    if (profileForAgent(agent).primaryCategory === category) {
      return { agentName: agent.name, matchType: 'exact', category };
    }
  }

  // 2. Capability overlap: any installed agent listing the category in capabilities[].
  for (const agent of agents) {
    if (profileForAgent(agent).capabilities.includes(category)) {
      return { agentName: agent.name, matchType: 'capability', category };
    }
  }

  // 3. General orchestrator fallback.
  return { agentName: null, matchType: 'fallback', category };
}
