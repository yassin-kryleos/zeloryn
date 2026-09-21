import { API_BASE_URL } from '../api/client';
// The three bundled CREW review personas. Spec: they must be auto-suggested
// whenever a user hands a plan off from PLAN to CREW (not only discoverable in
// the Factory tab). Shared between CoworkSpace (Factory install list) and the
// PlanningScreen handoff modal.

export interface CrewPersona {
  name: string;
  role: string;
  description: string;
  prompt: string;
}

export const crewPersonas: CrewPersona[] = [
  {
    name: 'Technical Reviewer',
    role: 'technical_reviewer',
    description: 'Feasibility, architecture consistency, and implementation risk.',
    prompt: 'You are the Technical Reviewer persona. Review plans for technical feasibility, architecture consistency, implementation order, and hidden engineering risk. Respect cross-card architectural decisions in .kryleos/decisions.md. When a card establishes or resolves a key technical decision, state "DECISION: <one-line summary>" in your review so it is captured in project memory.'
  },
  {
    name: 'Scope Guard',
    role: 'scope_guard',
    description: 'Scope creep, ambiguous requirements, over-specified items.',
    prompt: 'You are the Scope Guard persona. Identify scope creep, vague requirements, over-specified work, and items that should be split before execution.'
  },
  {
    name: 'Risk Identifier',
    role: 'risk_identifier',
    description: 'Security, dependency, and operational risks before execution.',
    prompt: 'You are the Risk Identifier persona. Flag security, dependency, operational, compliance, and delivery risks before execution begins.'
  },
  {
    name: 'Post-Execution Reviewer',
    role: 'post_execution_reviewer',
    description: 'Verifies actual diff against card acceptance criteria, regressions, and incomplete specs before marking Done.',
    prompt: 'You are the Post-Execution Reviewer persona. Review completed work against the card\'s acceptance criteria, check git diffs for regressions, undocumented changes, or missed edge cases, and report a clear PASS or FAIL judgment with detailed findings. If the completed work establishes a new architectural precedent or choice, include "DECISION: <one-line summary>" in your findings.'
  }
];

export const agentFileName = (role: string) => role.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');

export interface AssigneeOption {
  value: string;
  label: string;
  category: 'core' | 'specialist';
}

export const coreAssignees: AssigneeOption[] = [
  { value: 'Builder', label: 'Builder (Developer)', category: 'core' },
  { value: 'Planner', label: 'Planner (Architect)', category: 'core' },
  { value: 'Analyst', label: 'Analyst (Researcher)', category: 'core' },
  { value: 'Reviewer', label: 'Reviewer (QA/Review)', category: 'core' }
];

export const specialistAssignees: AssigneeOption[] = [
  { value: 'React Expert', label: 'React Expert', category: 'specialist' },
  { value: 'Security Auditor', label: 'Security Auditor', category: 'specialist' },
  { value: 'Test Writer', label: 'Test Writer', category: 'specialist' },
  { value: 'Documentation Writer', label: 'Documentation Writer', category: 'specialist' },
  { value: 'Performance Reviewer', label: 'Performance Reviewer', category: 'specialist' },
  { value: 'Technical Reviewer', label: 'Technical Reviewer', category: 'specialist' },
  { value: 'Scope Guard', label: 'Scope Guard', category: 'specialist' },
  { value: 'Post-Execution Reviewer', label: 'Post-Execution Reviewer', category: 'specialist' }
];

export function getAllAvailableAssignees(): AssigneeOption[] {
  return [...coreAssignees, ...specialistAssignees];
}

// Install a persona into the workspace .kryleos/agents directory via the
// existing file-create route. Returns nothing; throws on failure.
export async function installCrewPersona(persona: CrewPersona): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/files/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: `.kryleos/agents/${agentFileName(persona.role)}.json`,
      isDirectory: false,
      content: JSON.stringify({ name: persona.name, role: persona.role, prompt: persona.prompt }, null, 2)
    })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `install failed (HTTP ${res.status})`);
  }
}
