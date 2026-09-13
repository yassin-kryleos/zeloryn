import type { ChatClient } from './agents';
import type { Message } from './deepseek';

const FOUNDER_WORKFLOWS: Record<string, { name: string; description: string }> = {
  prd: { name: 'Product Requirements Document (PRD)', description: 'Generate a complete PRD specifying target users, core features, database schema, user flows, and phase-level milestones based on the workspace files.' },
  architecture: { name: 'System Architecture Design', description: 'Compile a technical system architecture outlining component relationships, API layers, external dependencies, and data flow topologies.' },
  roadmap: { name: 'Roadmap & Backlog Builder', description: 'Create a prioritized project backlog and roadmap milestones based on current plan files and git status.' },
  changelog: { name: 'Changelog / Release Notes', description: 'Compile a detailed user-facing release notes log and changelog summarizing recent git commits and diff records.' },
  health_report: { name: 'Monthly Project Health Report', description: 'Analyze codebase activity, test file counts, Git commit density, and token usage to compile a comprehensive project health report.' },
  release_checklist: { name: 'Release QA Checklist', description: 'Generate a detailed manual and automated QA verification checklist before deploying code to staging or production.' },
  pricing_page: { name: 'Pricing Page Copywriter', description: 'Generate marketing pricing plan comparison copywriting designed to convert visitors for this specific SaaS application.' },
  investor_summary: { name: 'Investor / Founder Summary', description: 'Draft a highly professional, 1-page executive summary describing the product, value proposition, and architecture for potential investors.' },
  update_patch: { name: 'Update Docs From Latest Patch', description: 'Compare recent Git changes and diff entries to generate documentation patch instructions to keep technical designs current.' }
};

export async function generateFounderWorkflow(
  workflowId: string,
  context: {
    root: string;
    scan: any;
    customPrompt?: string;
  },
  client: ChatClient
): Promise<string> {
  const workflow = FOUNDER_WORKFLOWS[workflowId];
  if (!workflow) {
    throw new Error(`Unknown founder workflow ID: ${workflowId}`);
  }

  const { root, scan, customPrompt } = context;

  const userPrompt = [
    `You are the Kryleos Founder autopilot assistant. Your task is to generate a professional, presentation-ready document for the founder's workspace.`,
    `Document Type: **${workflow.name}**`,
    `Description: ${workflow.description}`,
    customPrompt ? `User Specific Instructions: ${customPrompt}` : '',
    ``,
    `=== CODEBASE CONTEXT ===`,
    `Workspace Root: ${root}`,
    scan.packageJson ? `Package Manifest:\n${JSON.stringify(scan.packageJson, null, 2)}` : '',
    scan.readmeExcerpt ? `README Excerpt:\n${scan.readmeExcerpt}` : '',
    scan.sourceTree ? `Source Tree Structure:\n${scan.sourceTree}` : '',
    `Test Count: ${scan.testFilesCount} test files discovered.`,
    scan.recentGitChanges ? `Recent Commits:\n${scan.recentGitChanges}` : '',
    scan.gitStatus ? `Git Status:\n${scan.gitStatus}` : '',
    ``,
    `Please write a complete, rich Markdown document for **${workflow.name}**. Ensure that it is detailed, aligns exactly with the codebase structure, and avoids any empty template placeholders.`
  ].filter(Boolean).join('\n\n');

  const messages: Message[] = [
    { role: 'system', content: 'You generate high-value, professional founder documentation. Output ONLY the markdown content. Do not output conversational preambles or chat messages.' },
    { role: 'user', content: userPrompt }
  ];

  let generatedContent = '';
  await client.chatStream(messages, {
    onContentChunk: (chunk) => { generatedContent += chunk; },
    onComplete: (content) => { generatedContent = content; }
  });

  if (!generatedContent) {
    throw new Error('LLM generated empty response for founder workflow.');
  }

  return generatedContent;
}
