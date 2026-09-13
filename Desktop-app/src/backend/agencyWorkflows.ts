import type { ChatClient } from './agents';
import type { Message } from './deepseek';

const AGENCY_WORKFLOWS: Record<string, { name: string; description: string }> = {
  handoff: {
    name: 'Client Handoff Pack',
    description: 'Compile a complete development handoff package summarizing codebase layout, module structures, API interfaces, configuration settings, test verification outputs, and deployment protocols.'
  },
  brochure: {
    name: 'Project Pitch Brochure',
    description: 'Draft a premium visual and technical marketing brochure summarizing the product benefits, user value proposition, modern tech stack components, security architecture, and developer workflows.'
  },
  branded_doc: {
    name: 'Branded Technical Summary',
    description: 'Create a highly professional, beautifully styled HTML technical project report using the agency theme, colors, and branding details.'
  }
};

export async function generateAgencyWorkflow(
  workflowId: string,
  context: {
    root: string;
    scan: any;
    customPrompt?: string;
    branding?: {
      agencyName?: string;
      logoUrl?: string;
      primaryColor?: string;
    };
  },
  client: ChatClient
): Promise<string> {
  const workflow = AGENCY_WORKFLOWS[workflowId];
  if (!workflow) {
    throw new Error(`Unknown agency workflow ID: ${workflowId}`);
  }

  const { root, scan, customPrompt, branding } = context;
  const agencyName = branding?.agencyName || 'Kryleos Partner Agency';
  const logoUrl = branding?.logoUrl || 'https://raw.githubusercontent.com/thetimelord69/Kryleos-forge/main/logo.png';
  const primaryColor = branding?.primaryColor || '#10b981';

  const userPrompt = [
    `You are the Kryleos Agency autopilot assistant. Your task is to generate a premium client-facing document using agency branding.`,
    `Agency Name: **${agencyName}**`,
    `Primary Theme Color: ${primaryColor}`,
    `Logo URL: ${logoUrl}`,
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
    `Please output the complete document. For 'branded_doc', output a fully self-contained HTML document with inline CSS styling using the primary theme color (${primaryColor}), responsive layout, beautiful typography (Inter or Outfit), and the agency logo. For other types, output detailed, professional Markdown. Avoid any empty placeholders.`
  ].filter(Boolean).join('\n\n');

  const messages: Message[] = [
    {
      role: 'system',
      content: 'You generate high-value, professional client-ready agency documents. Output ONLY the generated document content (Markdown or HTML). Do not write any conversational preamble or comments.'
    },
    { role: 'user', content: userPrompt }
  ];

  let generatedContent = '';
  await client.chatStream(messages, {
    onContentChunk: (chunk) => { generatedContent += chunk; },
    onComplete: (content) => { generatedContent = content; }
  });

  if (!generatedContent) {
    throw new Error('LLM generated empty response for agency workflow.');
  }

  return generatedContent;
}
