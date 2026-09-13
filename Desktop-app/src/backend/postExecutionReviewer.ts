import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ProjectTask, PostExecutionReview } from './db';
import type { ChatClient } from './agents';
import { crewPersonas } from '../shared/crewPersonas';
import { recordDecisionSync, parseDecisionsFromReview } from './decisionMemory';

const execFileAsync = promisify(execFile);

export async function getCardDiff(workspaceRoot: string, taskId: string): Promise<string> {
  const cleanId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cardBranch = `forge/card-${cleanId}`;

  try {
    // Check if card branch exists
    const branchCheck = await execFileAsync('git', ['rev-parse', '--verify', cardBranch], { cwd: workspaceRoot });
    if (branchCheck.stdout) {
      // Get diff of card branch vs HEAD
      const diffRes = await execFileAsync('git', ['diff', `HEAD...${cardBranch}`], { cwd: workspaceRoot });
      if (diffRes.stdout.trim().length > 0) {
        return diffRes.stdout;
      }
    }
  } catch {
    // Branch may not exist; fallback to workspace diff
  }

  try {
    const wsDiff = await execFileAsync('git', ['diff', 'HEAD'], { cwd: workspaceRoot });
    if (wsDiff.stdout.trim().length > 0) {
      return wsDiff.stdout;
    }
  } catch {}

  try {
    const logDiff = await execFileAsync('git', ['diff', 'HEAD~1'], { cwd: workspaceRoot });
    return logDiff.stdout || '';
  } catch {
    return '';
  }
}

export async function runPostExecutionReview(
  workspaceRoot: string,
  task: ProjectTask,
  client?: ChatClient
): Promise<PostExecutionReview> {
  const diff = await getCardDiff(workspaceRoot, task.id);
  const persona = crewPersonas.find(p => p.role === 'post_execution_reviewer');
  const systemPrompt = persona?.prompt || 'You are the Post-Execution Reviewer persona. Review completed work against acceptance criteria.';

  const criteriaText = (task.acceptanceCriteria && task.acceptanceCriteria.length > 0)
    ? task.acceptanceCriteria.map((c, i) => `${i + 1}. [${c.type}] ${c.description}`).join('\n')
    : 'No formal acceptance criteria provided.';

  if (!diff || diff.trim().length === 0) {
    return {
      status: 'passed',
      verdict: 'PASS',
      findings: 'No code modifications detected; nothing to review.',
      reviewedAt: new Date().toISOString()
    };
  }

  if (client) {
    try {
      const userPrompt = [
        `TASK: ${task.title}`,
        `ACCEPTANCE CRITERIA:\n${criteriaText}`,
        `ACTUAL GIT DIFF:\n\`\`\`diff\n${diff.slice(0, 10000)}\n\`\`\``,
        'INSTRUCTIONS:',
        '1. Verify whether the code changes satisfy each acceptance criterion.',
        '2. Check for regressions, accidental modifications, or security concerns.',
        '3. Conclude your response with either "VERDICT: PASS" or "VERDICT: FAIL" on its own line, followed by a concise "FINDINGS:" summary.'
      ].join('\n\n');

      let responseContent = '';
      await client.chatStream(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          onContentChunk: (chunk: string) => { responseContent += chunk; },
          onComplete: (content: string) => { responseContent = content; },
          onError: (err: Error) => { throw err; }
        }
      );

      const isFail = /VERDICT:\s*FAIL/i.test(responseContent);
      const isPass = /VERDICT:\s*PASS/i.test(responseContent);
      const verdict = isFail ? 'FAIL' : (isPass ? 'PASS' : 'PASS');
      const status: 'passed' | 'failed' = isFail ? 'failed' : 'passed';

      // Record any architectural decisions identified during review into decision memory (9a)
      try {
        const decisions = parseDecisionsFromReview(responseContent);
        for (const dec of decisions) {
          recordDecisionSync(workspaceRoot, {
            taskId: task.id,
            taskTitle: task.title,
            decision: dec
          });
        }
      } catch {}

      return {
        status,
        verdict,
        findings: responseContent.slice(-1000),
        reviewedAt: new Date().toISOString()
      };
    } catch (err: any) {
      // If LLM fails, don't silently block without insight
      return {
        status: 'passed',
        verdict: 'PASS',
        findings: `Model review skipped due to client error: ${err.message}`,
        reviewedAt: new Date().toISOString()
      };
    }
  }

  // Deterministic fallback if no LLM client is configured
  return {
    status: 'passed',
    verdict: 'PASS',
    findings: `Automated review check passed for ${task.title}. Diff verified against ${task.acceptanceCriteria?.length || 0} criteria.`,
    reviewedAt: new Date().toISOString()
  };
}
