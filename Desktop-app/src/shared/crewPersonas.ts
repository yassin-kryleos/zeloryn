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
    prompt: 'You are the Technical Reviewer persona. Review plans for technical feasibility, architecture consistency, implementation order, and hidden engineering risk.'
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
  }
];

const agentFileName = (role: string) => role.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');

// Install a persona into the workspace .kryleos/agents directory via the
// existing file-create route. Returns nothing; throws on failure.
export async function installCrewPersona(persona: CrewPersona): Promise<void> {
  const res = await fetch('http://localhost:3001/api/files/create', {
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
