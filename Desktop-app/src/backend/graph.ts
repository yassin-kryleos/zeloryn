import * as fs from 'fs';
import * as path from 'path';

interface GraphNode {
  id: string;
  name: string;
  type: 'code' | 'style' | 'docs' | 'other';
  size: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

export async function generateWorkspaceGraph(workspaceRoot: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const processedFiles = new Set<string>();

  // Set of ignore directories
  const IGNORE_DIRS = new Set(['node_modules', '.git', '.kryleos', '.matrix', 'dist', 'public', '.gemini']);
  // Supported extensions
  const CODE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx']);
  const STYLE_EXTS = new Set(['.css']);
  const DOCS_EXTS = new Set(['.md', '.txt', '.json']);

  async function scan(currentDir: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!CODE_EXTS.has(ext) && !STYLE_EXTS.has(ext) && !DOCS_EXTS.has(ext)) continue;

        const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
        if (processedFiles.has(relativePath)) continue;
        processedFiles.add(relativePath);

        let size = 0;
        try {
          const stats = await fs.promises.stat(fullPath);
          size = stats.size;
        } catch {}

        let type: 'code' | 'style' | 'docs' | 'other' = 'other';
        if (CODE_EXTS.has(ext)) type = 'code';
        else if (STYLE_EXTS.has(ext)) type = 'style';
        else if (DOCS_EXTS.has(ext)) type = 'docs';

        nodes.push({
          id: relativePath,
          name: entry.name,
          type,
          size
        });

        // Scan file content for imports (only if file is not massive)
        if (size < 150 * 1024) { // Clamped to 150KB to keep static analysis extremely fast
          try {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            const fileDir = path.dirname(relativePath);

            // 1. JS/TS Imports / Exports / Requires
            if (type === 'code') {
              const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;
              const requireRegex = /require\(['"](\.\.?\/[^'"]+)['"]\)/g;

              const matches = [
                ...content.matchAll(importRegex),
                ...content.matchAll(requireRegex)
              ];

              for (const match of matches) {
                const targetRel = match[1];
                const resolvedBase = path.join(fileDir, targetRel).replace(/\\/g, '/');

                // Try resolving target with various extensions
                const testSuffixes = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js', ''];
                for (const suffix of testSuffixes) {
                  const testPath = resolvedBase + suffix;
                  const finalTestPath = testPath.startsWith('./') ? testPath.slice(2) : testPath;
                  
                  // Check if this resolved path represents a real file in our workspace
                  const targetFullPath = path.join(workspaceRoot, finalTestPath);
                  if (fs.existsSync(targetFullPath) && fs.statSync(targetFullPath).isFile()) {
                    const finalRel = path.relative(workspaceRoot, targetFullPath).replace(/\\/g, '/');
                    edges.push({
                      source: relativePath,
                      target: finalRel
                    });
                    break;
                  }
                }
              }
            }

            // 2. Markdown File Linking
            if (type === 'docs' && ext === '.md') {
              const mdLinkRegex = /\[[^\]]*\]\((file:\/\/\/|\.\.?\/)([^)]+)\)/g;
              const matches = [...content.matchAll(mdLinkRegex)];
              for (const match of matches) {
                const prefix = match[1];
                const linkPath = match[2];
                let resolvedTarget = '';

                if (prefix.startsWith('file:///')) {
                  // Direct absolute path link
                  const cleanAbs = linkPath.replace(/^[a-zA-Z]:/, ''); // Strip drive letter if any
                  resolvedTarget = path.relative(workspaceRoot, cleanAbs).replace(/\\/g, '/');
                } else {
                  // Relative path link
                  resolvedTarget = path.join(fileDir, prefix + linkPath).replace(/\\/g, '/');
                }

                // Verify target existence
                const targetFullPath = path.join(workspaceRoot, resolvedTarget);
                if (fs.existsSync(targetFullPath)) {
                  const finalRel = path.relative(workspaceRoot, targetFullPath).replace(/\\/g, '/');
                  edges.push({
                    source: relativePath,
                    target: finalRel
                  });
                }
              }
            }

          } catch {}
        }
      }
    }
  }

  await scan(workspaceRoot);
  return { nodes, edges };
}
