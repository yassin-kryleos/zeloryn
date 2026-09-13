import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkspaceSandbox } from '../tools';
import * as fs from 'fs';
import * as path from 'path';

describe('WorkspaceSandbox Unit Tests', () => {
  const testDir = path.resolve(__dirname, 'sandbox-test-temp');
  let sandbox: WorkspaceSandbox;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      await fs.promises.mkdir(testDir, { recursive: true });
    }
    sandbox = new WorkspaceSandbox(testDir);
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should resolve path within boundary', () => {
    const resolved = sandbox.resolvePath('file.txt');
    expect(resolved).toBe(path.join(testDir, 'file.txt'));
  });

  it('should reject resolution outside directory boundary', () => {
    expect(() => sandbox.resolvePath('../forbidden.txt')).toThrow(/Access Denied/);
  });

  it('should write and read files successfully', async () => {
    await sandbox.writeFile('test.txt', 'hello workspace');
    const content = await sandbox.readFile('test.txt');
    expect(content).toBe('hello workspace');
  });

  it('should list directory contents', async () => {
    await sandbox.writeFile('dir/file1.txt', '1');
    await sandbox.writeFile('dir/file2.txt', '2');
    const files = await sandbox.listDir('dir');
    expect(files.length).toBe(2);
    expect(files.map(f => f.name)).toContain('file1.txt');
    expect(files.map(f => f.name)).toContain('file2.txt');
  });

  it('should perform search-and-replace edits successfully via modifyFile', async () => {
    await sandbox.writeFile('edit.txt', 'original line\nkeep this\noriginal line');
    
    // Modify non-unique content should fail
    const failRes = await sandbox.modifyFile('edit.txt', 'original line', 'new line');
    expect(failRes.success).toBe(false);

    // Modify unique content should succeed
    const successRes = await sandbox.modifyFile('edit.txt', 'keep this', 'modified this');
    expect(successRes.success).toBe(true);
    
    const content = await sandbox.readFile('edit.txt');
    expect(content).toBe('original line\nmodified this\noriginal line');
  });

  it('should resolve concurrent merges using LWW-CRDT rules', async () => {
    const filename = 'merge.txt';
    await sandbox.writeFile(filename, 'Line 1\nLine 2');
    
    // Simulating concurrent writes within 3 seconds
    await sandbox.writeFile(filename, 'Line 1\nLine 2\nLine 3 Added by A');
    await sandbox.writeFile(filename, 'Line 1\nLine 2\nLine 4 Added by B');

    const mergedContent = await sandbox.readFile(filename);
    expect(mergedContent).toContain('Line 3 Added by A');
    expect(mergedContent).toContain('Line 4 Added by B');
  });

  it('should capture snapshots and revert file states successfully', async () => {
    const filename = 'snapshot.txt';
    await sandbox.writeFile(filename, 'original baseline');
    
    // Modify file captures snapshot
    await sandbox.modifyFile(filename, 'original baseline', 'dirty edit');
    expect(await sandbox.readFile(filename)).toBe('dirty edit');

    // Revert restores baseline
    const revertSuccess = await sandbox.revertFile(filename);
    expect(revertSuccess).toBe(true);
    expect(await sandbox.readFile(filename)).toBe('original baseline');
  });

  it('should rank grepSearch results using TF-IDF term relevance', async () => {
    await sandbox.writeFile('search1.txt', 'contains basic query keyword');
    await sandbox.writeFile('search2.txt', 'exact target query phrase matches here');
    
    const results = await sandbox.grepSearch('target query phrase');
    expect(results.length).toBeGreaterThan(0);
    // search2.txt contains exact phrase match and should be ranked first (score 1000+)
    expect(results[0].file).toBe('search2.txt');
  });

  it('should write markdown and read/modify/revert files transparently', async () => {
    const docFile = 'document.md';
    const originalMarkdown = '# Hello World\n\nThis is a **bold** paragraph. Math: x < y and custom tags <custom>.';
    
    // Write markdown to file
    await sandbox.writeFile(docFile, originalMarkdown);
    
    // Check if the physical file exists
    const resolved = sandbox.resolvePath(docFile);
    expect(fs.existsSync(resolved)).toBe(true);
    const stats = fs.statSync(resolved);
    expect(stats.size).toBeGreaterThan(50);
    
    // Read file - it should return content
    const readContent = await sandbox.readFile(docFile);
    expect(readContent).toContain('Hello World');
    expect(readContent).toContain('x < y');
    expect(readContent).toContain('<custom>');

    // Modify file content
    const modRes = await sandbox.modifyFile(docFile, '# Hello World', '# Awesome Doc');
    expect(modRes.success).toBe(true);

    const updatedContent = await sandbox.readFile(docFile);
    expect(updatedContent).toContain('Awesome Doc');
    expect(updatedContent).not.toContain('Hello World');

    // Revert file should restore snapshot
    const revertRes = await sandbox.revertFile(docFile);
    expect(revertRes).toBe(true);
    const revertedContent = await sandbox.readFile(docFile);
    expect(revertedContent).toContain('Hello World');
    expect(revertedContent).not.toContain('Awesome Doc');
  });
});
