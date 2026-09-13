import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditTrailService } from '../auditTrail';

describe('AuditTrailService (Phase 5 compliance export)', () => {
  let tmpDir: string;
  let service: AuditTrailService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-audit-test-'));
    const kryleosDir = path.join(tmpDir, '.kryleos');
    fs.mkdirSync(kryleosDir, { recursive: true });

    // Seed test approvals
    const approvals = [
      {
        timestamp: '2026-09-13T10:00:00.000Z',
        command: 'npm run test',
        tool: 'command.run',
        approved: true,
        destructive: false,
        source: 'local'
      },
      {
        timestamp: '2026-09-13T10:05:00.000Z',
        command: 'rm -rf /tmp/data',
        tool: 'command.run',
        approved: false,
        destructive: true,
        source: 'remote',
        deviceId: 'phone-123'
      }
    ];
    fs.writeFileSync(path.join(kryleosDir, 'command_approvals.json'), JSON.stringify(approvals), 'utf-8');

    // Seed test cost history
    const costs = [
      {
        id: 'cost-1',
        timestamp: '2026-09-13T10:00:00.000Z',
        model: 'deepseek-chat',
        provider: 'DeepSeek',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.0028
      },
      {
        id: 'cost-2',
        timestamp: '2026-09-13T10:02:00.000Z',
        model: 'claude-3-5-sonnet-latest',
        provider: 'Anthropic',
        inputTokens: 2000,
        outputTokens: 1000,
        cost: 0.0210
      }
    ];
    fs.writeFileSync(path.join(kryleosDir, 'cost_history.json'), JSON.stringify(costs), 'utf-8');

    // Seed test tool invocations
    const toolLogs = [
      JSON.stringify({
        invocationId: 'inv-1',
        timestamp: '2026-09-13T10:00:00.000Z',
        tool: 'file.read',
        caller: 'agent',
        permission: 'read',
        success: true
      }),
      JSON.stringify({
        invocationId: 'inv-2',
        timestamp: '2026-09-13T10:01:00.000Z',
        tool: 'command.run',
        caller: 'agent',
        permission: 'execute',
        success: true
      })
    ].join('\n');
    fs.writeFileSync(path.join(kryleosDir, 'tool-invocations.jsonl'), toolLogs, 'utf-8');

    service = new AuditTrailService(tmpDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('aggregates governance and financial data into structured report', async () => {
    const data = await service.generateReportData();
    expect(data.governanceSummary.totalCommandsEvaluated).toBe(2);
    expect(data.governanceSummary.commandsApproved).toBe(1);
    expect(data.governanceSummary.commandsRejected).toBe(1);
    expect(data.governanceSummary.destructiveCommandsIntercepted).toBe(1);
    expect(data.governanceSummary.approvalsBySource.local).toBe(1);
    expect(data.governanceSummary.approvalsBySource.remote).toBe(1);

    expect(data.financialSummary.totalInvocations).toBe(2);
    expect(data.financialSummary.totalCostUsd).toBeCloseTo(0.0238, 4);
    expect(data.financialSummary.costByProvider['DeepSeek']).toBeCloseTo(0.0028, 4);
    expect(data.financialSummary.costByProvider['Anthropic']).toBeCloseTo(0.0210, 4);
    expect(data.integrityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates compliance markdown with auditor signature lines', async () => {
    const data = await service.generateReportData();
    const md = service.toMarkdownReport(data);

    expect(md).toContain('# Kryleos Forge Compliance Audit Report');
    expect(md).toContain('## 1. Security & Compliance Posture');
    expect(md).toContain('## 2. Financial & Model Usage Summary');
    expect(md).toContain('## 3. Governance & Human Approval Trail');
    expect(md).toContain('## 4. Auditor Sign-off');
    expect(md).toContain('rm -rf /tmp/data');
    expect(md).toContain('REJECTED');
  });

  it('generates valid CSV event export', async () => {
    const data = await service.generateReportData();
    const csv = service.toCsvEvents(data);

    const lines = csv.split('\n');
    expect(lines[0]).toBe('Timestamp,EventType,Identifier,ToolOrModel,DecisionOrStatus,Source,Details,CostUsd');
    expect(csv).toContain('COMMAND_APPROVAL');
    expect(csv).toContain('TOOL_INVOCATION');
    expect(csv).toContain('APPROVED');
    expect(csv).toContain('REJECTED');
  });

  it('exports audit package to disk with integrity hash', async () => {
    const res = await service.exportAuditPackage();

    expect(fs.existsSync(res.reportMarkdownPath)).toBe(true);
    expect(fs.existsSync(res.reportJsonPath)).toBe(true);
    expect(fs.existsSync(res.reportCsvPath)).toBe(true);

    const json = JSON.parse(fs.readFileSync(res.reportJsonPath, 'utf-8'));
    expect(json.integrityHash).toBe(res.integrityHash);
  });
});
