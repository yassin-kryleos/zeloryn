import type { ChatClient } from './agents';
import type { Message } from './deepseek';

export async function generateFounderWorkflow(
  workflowId: string,
  context: {
    root: string;
    scan: any;
    customPrompt?: string;
  },
  client: ChatClient
): Promise<string> {
  const { root, scan, customPrompt } = context;
  
  let workflowName = '';
  let description = '';
  
  switch (workflowId) {
    case 'prd':
      workflowName = 'Product Requirements Document (PRD)';
      description = 'Generate a complete PRD specifying target users, core features, database schema, user flows, and phase-level milestones based on the workspace files.';
      break;
    case 'architecture':
      workflowName = 'System Architecture Design';
      description = 'Compile a technical system architecture outlining component relationships, API layers, external dependencies, and data flow topologies.';
      break;
    case 'roadmap':
      workflowName = 'Roadmap & Backlog Builder';
      description = 'Create a prioritized project backlog and roadmap milestones based on current plan files and git status.';
      break;
    case 'changelog':
      workflowName = 'Changelog / Release Notes';
      description = 'Compile a detailed user-facing release notes log and changelog summarizing recent git commits and diff records.';
      break;
    case 'health_report':
      workflowName = 'Monthly Project Health Report';
      description = 'Analyze codebase activity, test file counts, Git commit density, and token usage to compile a comprehensive project health report.';
      break;
    case 'release_checklist':
      workflowName = 'Release QA Checklist';
      description = 'Generate a detailed manual and automated QA verification checklist before deploying code to staging or production.';
      break;
    case 'pricing_page':
      workflowName = 'Pricing Page Copywriter';
      description = 'Generate marketing pricing plan comparison copywriting designed to convert visitors for this specific SaaS application.';
      break;
    case 'investor_summary':
      workflowName = 'Investor / Founder Summary';
      description = 'Draft a highly professional, 1-page executive summary describing the product, value proposition, and architecture for potential investors.';
      break;
    case 'update_patch':
      workflowName = 'Update Docs From Latest Patch';
      description = 'Compare recent Git changes and diff entries to generate documentation patch instructions to keep technical designs current.';
      break;
    default:
      throw new Error(`Unknown founder workflow ID: ${workflowId}`);
  }

  const userPrompt = [
    `You are the Kryleos Founder autopilot assistant. Your task is to generate a professional, presentation-ready document for the founder's workspace.`,
    `Document Type: **${workflowName}**`,
    `Description: ${description}`,
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
    `Please write a complete, rich Markdown document for **${workflowName}**. Ensure that it is detailed, aligns exactly with the codebase structure, and avoids any empty template placeholders.`
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
