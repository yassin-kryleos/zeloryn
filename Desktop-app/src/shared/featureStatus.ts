export type FeatureStatus = 'production' | 'preview' | 'simulator' | 'mock' | 'planned';

export interface FeatureStatusDefinition {
  id: string;
  label: string;
  status: FeatureStatus;
  description: string;
}

export const featureStatuses = {
  localWorkspace: {
    id: 'localWorkspace',
    label: 'Local Workspace',
    status: 'production',
    description: 'Core local file, Git, agent, and command approval workflow.'
  },
  gitReview: {
    id: 'gitReview',
    label: 'Git Review',
    status: 'production',
    description: 'Git-backed local review state for working and staged changes.'
  },
  cloudSync: {
    id: 'cloudSync',
    label: 'Cloud Sync',
    status: 'planned',
    description: 'Local-only and peer-to-peer syncing (centralized cloud sync deprecated).'
  },
  remoteContainer: {
    id: 'remoteContainer',
    label: 'Remote Container',
    status: 'planned',
    description: 'Local workspace sandbox execution active.'
  },
  cloudIde: {
    id: 'cloudIde',
    label: 'Cloud IDE',
    status: 'preview',
    description: 'Cloud IDE connection indicators are preview-level and depend on the desktop backend.'
  },
  collaboration: {
    id: 'collaboration',
    label: 'Collaboration',
    status: 'preview',
    description: 'Team presence and pair-session indicators are preview-level.'
  },
  rbac: {
    id: 'rbac',
    label: 'RBAC',
    status: 'production',
    description: 'Local configuration-based role and command policy enforcement.'
  },
  billing: {
    id: 'billing',
    label: 'Billing',
    status: 'production',
    description: 'Free and open source BYOK model (no payment required).'
  },
  marketplace: {
    id: 'marketplace',
    label: 'Marketplace',
    status: 'preview',
    description: 'Local agents/skills are usable; broader marketplace workflows are preview-level.'
  },
  docsAutopilot: {
    id: 'docsAutopilot',
    label: 'Docs Autopilot',
    status: 'planned',
    description: 'Full docs automation workflows are planned for a later release phase.'
  },
  costGuard: {
    id: 'costGuard',
    label: 'Cost Guard',
    status: 'planned',
    description: 'Prompt/cost estimation workflows are planned for a later release phase.'
  }
} satisfies Record<string, FeatureStatusDefinition>;

export type FeatureStatusId = keyof typeof featureStatuses;

export const getFeatureStatus = (id: FeatureStatusId): FeatureStatusDefinition => featureStatuses[id];
