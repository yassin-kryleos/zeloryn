import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SemanticIndexer } from '../semanticIndex';

describe('SemanticIndexer (Tree-sitter + PageRank)', () => {
  let tmpDir: string;
  let indexer: SemanticIndexer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-index-test-'));
    indexer = new SemanticIndexer(tmpDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('parses TypeScript files and extracts functions, classes, and types', () => {
    const code = `
      export interface UserProfile {
        id: string;
        name: string;
      }

      export class UserService {
        getUser(id: string): UserProfile {
          return { id, name: 'Alice' };
        }
      }

      export async function fetchAllUsers(): Promise<UserProfile[]> {
        return [];
      }

      export const formatUserName = (user: UserProfile) => user.name.toUpperCase();
    `;

    const result = indexer.parseFile('user.ts', code);
    expect(result.symbols).toHaveLength(5);

    const names = result.symbols.map(s => s.name);
    expect(names).toContain('UserProfile');
    expect(names).toContain('UserService');
    expect(names).toContain('getUser');
    expect(names).toContain('fetchAllUsers');
    expect(names).toContain('formatUserName');

    const service = result.symbols.find(s => s.name === 'UserService');
    expect(service?.type).toBe('class');

    const iface = result.symbols.find(s => s.name === 'UserProfile');
    expect(iface?.type).toBe('interface');
  });

  it('parses TSX files and extracts React components and calls', () => {
    const code = `
      import React from 'react';

      export function UserCard({ name }: { name: string }) {
        return <div className="user-card">{name}</div>;
      }
    `;

    const result = indexer.parseFile('UserCard.tsx', code);
    expect(result.symbols.some(s => s.name === 'UserCard')).toBe(true);
  });

  it('computes PageRank scores over the call/import graph', () => {
    // File A calls helper from File B; File C also calls helper from File B.
    // Therefore helper in File B has higher in-degree and should receive highest PageRank.
    const fileA = {
      symbols: [{ name: 'doWorkA', type: 'function' as const, line: 1, signature: 'function doWorkA()' }],
      imports: [{ source: './b', names: ['sharedHelper'] }],
      calls: ['sharedHelper']
    };

    const fileB = {
      symbols: [{ name: 'sharedHelper', type: 'function' as const, line: 1, signature: 'function sharedHelper()' }],
      imports: [],
      calls: []
    };

    const fileC = {
      symbols: [{ name: 'doWorkC', type: 'function' as const, line: 1, signature: 'function doWorkC()' }],
      imports: [{ source: './b', names: ['sharedHelper'] }],
      calls: ['sharedHelper']
    };

    const { rankedFiles, totalEdges } = indexer.computePageRank({
      'a.ts': fileA,
      'b.ts': fileB,
      'c.ts': fileC
    });

    expect(totalEdges).toBeGreaterThan(0);
    const helperRank = rankedFiles['b.ts'].symbols[0].rank || 0;
    const workARank = rankedFiles['a.ts'].symbols[0].rank || 0;
    const workCRank = rankedFiles['c.ts'].symbols[0].rank || 0;

    expect(helperRank).toBeGreaterThan(workARank);
    expect(helperRank).toBeGreaterThan(workCRank);
  });

  it('builds disk cache and queries symbols sorted by PageRank rank', async () => {
    const file1 = path.join(tmpDir, 'service.ts');
    const file2 = path.join(tmpDir, 'controller.ts');

    fs.writeFileSync(file1, `
      export function coreEngine(query: string) {
        return query.trim();
      }
    `);

    fs.writeFileSync(file2, `
      import { coreEngine } from './service';
      export function handleRequest() {
        return coreEngine('test');
      }
    `);

    const buildResult = await indexer.buildCache();
    expect(buildResult.success).toBe(true);
    expect(buildResult.count).toBeGreaterThanOrEqual(2);

    const cacheFile = path.join(tmpDir, '.matrix_semantic_cache.json');
    expect(fs.existsSync(cacheFile)).toBe(true);

    const queryResult = await indexer.queryCache('coreEngine');
    expect(queryResult).toHaveLength(1);
    expect(queryResult[0].symbol).toBe('coreEngine');
    expect(queryResult[0].rank).toBeGreaterThan(0);

    // Query with wildcard '*' returns all symbols ranked
    const allRanked = await indexer.queryCache('*');
    expect(allRanked.length).toBeGreaterThanOrEqual(2);
    // Verified sorted descending by rank
    expect(allRanked[0].rank).toBeGreaterThanOrEqual(allRanked[1].rank);
  });
});
