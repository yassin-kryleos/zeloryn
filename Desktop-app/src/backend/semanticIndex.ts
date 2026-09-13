import * as fs from 'fs';
import * as path from 'path';
import Parser from 'tree-sitter';
import tsPkg from 'tree-sitter-typescript';
import jsPkg from 'tree-sitter-javascript';

// Handle commonjs / esm exports from tree-sitter language modules
const TypeScript = (tsPkg as any).typescript || tsPkg;
const TSX = (tsPkg as any).tsx || tsPkg;
const JavaScript = jsPkg;

export interface SemanticSymbol {
  name: string;
  type: 'function' | 'class' | 'type' | 'interface' | 'arrow-function' | 'method';
  line: number;
  signature: string;
  rank?: number;
}

export interface SemanticFileIndex {
  symbols: SemanticSymbol[];
  imports: Array<{ source: string; names: string[] }>;
  calls: string[];
}

export interface SemanticCacheData {
  version: '2.0-pagerank';
  generatedAt: string;
  files: Record<string, { symbols: SemanticSymbol[] }>;
  graphStats: {
    totalFiles: number;
    totalSymbols: number;
    totalEdges: number;
  };
}

export class SemanticIndexer {
  private workspaceRoot: string;
  private parser: Parser;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.parser = new Parser();
  }

  private getParserForExt(ext: string): boolean {
    try {
      if (ext === '.tsx') {
        this.parser.setLanguage(TSX);
        return true;
      } else if (ext === '.ts') {
        this.parser.setLanguage(TypeScript);
        return true;
      } else if (ext === '.js' || ext === '.jsx') {
        this.parser.setLanguage(JavaScript);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  /** Parses a single file and extracts symbols, imports, and call references via tree-sitter */
  public parseFile(filePath: string, content: string): SemanticFileIndex {
    const ext = path.extname(filePath).toLowerCase();
    const canParse = this.getParserForExt(ext);
    if (!canParse) {
      return { symbols: [], imports: [], calls: [] };
    }

    const tree = this.parser.parse(content);
    const symbols: SemanticSymbol[] = [];
    const imports: Array<{ source: string; names: string[] }> = [];
    const calls: string[] = [];

    const lines = content.split('\n');
    const getLineText = (lineIndex: number) => (lines[lineIndex] || '').trim();

    const visit = (node: Parser.SyntaxNode) => {
      // 1. Function Declarations
      if (node.type === 'function_declaration' || node.type === 'generator_function_declaration') {
        const idNode = node.childForFieldName('name');
        if (idNode) {
          symbols.push({
            name: idNode.text,
            type: 'function',
            line: idNode.startPosition.row + 1,
            signature: getLineText(idNode.startPosition.row)
          });
        }
      }
      // 2. Class Declarations
      else if (node.type === 'class_declaration') {
        const idNode = node.childForFieldName('name');
        if (idNode) {
          symbols.push({
            name: idNode.text,
            type: 'class',
            line: idNode.startPosition.row + 1,
            signature: getLineText(idNode.startPosition.row)
          });
        }
      }
      // 3. Interface & Type Declarations
      else if (node.type === 'interface_declaration') {
        const idNode = node.childForFieldName('name');
        if (idNode) {
          symbols.push({
            name: idNode.text,
            type: 'interface',
            line: idNode.startPosition.row + 1,
            signature: getLineText(idNode.startPosition.row)
          });
        }
      } else if (node.type === 'type_alias_declaration') {
        const idNode = node.childForFieldName('name');
        if (idNode) {
          symbols.push({
            name: idNode.text,
            type: 'type',
            line: idNode.startPosition.row + 1,
            signature: getLineText(idNode.startPosition.row)
          });
        }
      }
      // 4. Arrow functions assigned to const/let/var
      else if (node.type === 'variable_declarator') {
        const idNode = node.childForFieldName('name');
        const valNode = node.childForFieldName('value');
        if (idNode && valNode && (valNode.type === 'arrow_function' || valNode.type === 'function_expression')) {
          symbols.push({
            name: idNode.text,
            type: 'arrow-function',
            line: idNode.startPosition.row + 1,
            signature: getLineText(idNode.startPosition.row)
          });
        }
      }
      // 5. Method definitions inside classes
      else if (node.type === 'method_definition') {
        const idNode = node.childForFieldName('name');
        if (idNode && idNode.text !== 'constructor') {
          symbols.push({
            name: idNode.text,
            type: 'method',
            line: idNode.startPosition.row + 1,
            signature: getLineText(idNode.startPosition.row)
          });
        }
      }
      // 6. Imports
      else if (node.type === 'import_statement') {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          const importSource = sourceNode.text.replace(/['"]/g, '');
          const importedNames: string[] = [];
          for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child && child.type === 'import_clause') {
              for (let j = 0; j < child.namedChildCount; j++) {
                const specifier = child.namedChild(j);
                if (specifier) importedNames.push(specifier.text);
              }
            }
          }
          imports.push({ source: importSource, names: importedNames });
        }
      }
      // 7. Call expressions (call edges)
      else if (node.type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        if (funcNode) {
          if (funcNode.type === 'identifier') {
            calls.push(funcNode.text);
          } else if (funcNode.type === 'member_expression') {
            const propNode = funcNode.childForFieldName('property');
            if (propNode) calls.push(propNode.text);
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
    };

    visit(tree.rootNode);
    return { symbols, imports, calls };
  }

  /**
   * Computes PageRank over the symbol and call/import graph (Aider repo-map approach)
   */
  public computePageRank(
    fileIndices: Record<string, SemanticFileIndex>,
    damping: number = 0.85,
    iterations: number = 30
  ): {
    rankedFiles: Record<string, { symbols: SemanticSymbol[] }>;
    totalEdges: number;
  } {
    // Build node IDs for all symbols: `${file}#${symbolName}`
    const symbolMap = new Map<string, SemanticSymbol>();
    const nodeIds: string[] = [];
    const symbolNameToIds = new Map<string, string[]>();

    for (const [relPath, index] of Object.entries(fileIndices)) {
      for (const sym of index.symbols) {
        const id = `${relPath}#${sym.name}`;
        nodeIds.push(id);
        symbolMap.set(id, sym);

        const list = symbolNameToIds.get(sym.name) || [];
        list.push(id);
        symbolNameToIds.set(sym.name, list);
      }
    }

    const n = nodeIds.length;
    if (n === 0) {
      return { rankedFiles: {}, totalEdges: 0 };
    }

    // Build directed graph: outgoing edges (source -> target) and incoming edges (target <- source)
    const outEdges = new Map<string, Set<string>>();
    const inEdges = new Map<string, Set<string>>();

    for (const id of nodeIds) {
      outEdges.set(id, new Set());
      inEdges.set(id, new Set());
    }

    let totalEdges = 0;

    // Connect calls from each file's symbols to matching candidate definitions
    for (const [relPath, index] of Object.entries(fileIndices)) {
      const fileSymbolIds = index.symbols.map(s => `${relPath}#${s.name}`);

      for (const callName of index.calls) {
        const targets = symbolNameToIds.get(callName);
        if (targets && targets.length > 0) {
          for (const sourceId of fileSymbolIds) {
            for (const targetId of targets) {
              if (sourceId !== targetId) {
                if (!outEdges.get(sourceId)!.has(targetId)) {
                  outEdges.get(sourceId)!.add(targetId);
                  inEdges.get(targetId)!.add(sourceId);
                  totalEdges++;
                }
              }
            }
          }
        }
      }
    }

    // Run PageRank iterations
    let ranks = new Map<string, number>();
    const initialRank = 1.0 / n;
    for (const id of nodeIds) {
      ranks.set(id, initialRank);
    }

    for (let iter = 0; iter < iterations; iter++) {
      const newRanks = new Map<string, number>();
      let danglingSum = 0;

      for (const id of nodeIds) {
        const degree = outEdges.get(id)!.size;
        if (degree === 0) {
          danglingSum += ranks.get(id)!;
        }
      }

      for (const id of nodeIds) {
        let incomingSum = 0;
        const incoming = inEdges.get(id)!;
        for (const sourceId of incoming) {
          const outDegree = outEdges.get(sourceId)!.size;
          if (outDegree > 0) {
            incomingSum += ranks.get(sourceId)! / outDegree;
          }
        }

        const rank = ((1 - damping) / n) + damping * (incomingSum + danglingSum / n);
        newRanks.set(id, rank);
      }

      ranks = newRanks;
    }

    // Attach ranks to symbols
    const rankedFiles: Record<string, { symbols: SemanticSymbol[] }> = {};
    for (const [relPath, index] of Object.entries(fileIndices)) {
      const rankedSymbols = index.symbols.map(sym => {
        const id = `${relPath}#${sym.name}`;
        const score = ranks.get(id) || initialRank;
        return {
          ...sym,
          rank: parseFloat(score.toFixed(6))
        };
      });

      // Sort symbols in this file by rank descending
      rankedSymbols.sort((a, b) => (b.rank || 0) - (a.rank || 0));
      rankedFiles[relPath] = { symbols: rankedSymbols };
    }

    return { rankedFiles, totalEdges };
  }

  /**
   * Scans workspace directory, parses files with tree-sitter, computes PageRank,
   * and saves cache to `.matrix_semantic_cache.json`.
   */
  public async buildCache(): Promise<{ success: boolean; count: number; totalEdges: number }> {
    const fileIndices: Record<string, SemanticFileIndex> = {};
    let totalSymbols = 0;

    const scanDir = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.gemini', '.kryleos', 'dist-backend'].includes(entry.name)) {
            continue;
          }
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            try {
              const content = await fs.promises.readFile(fullPath, 'utf-8');
              const relPath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
              const index = this.parseFile(relPath, content);
              if (index.symbols.length > 0 || index.calls.length > 0) {
                fileIndices[relPath] = index;
                totalSymbols += index.symbols.length;
              }
            } catch {}
          }
        }
      }
    };

    await scanDir(this.workspaceRoot);

    const { rankedFiles, totalEdges } = this.computePageRank(fileIndices);

    const cacheData: SemanticCacheData = {
      version: '2.0-pagerank',
      generatedAt: new Date().toISOString(),
      files: rankedFiles,
      graphStats: {
        totalFiles: Object.keys(rankedFiles).length,
        totalSymbols,
        totalEdges
      }
    };

    const cachePath = path.join(this.workspaceRoot, '.matrix_semantic_cache.json');
    await fs.promises.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');

    return { success: true, count: totalSymbols, totalEdges };
  }

  /**
   * Query the cache with PageRank-sorted results fitting a symbol budget
   */
  public async queryCache(
    query: string,
    limit: number = 50
  ): Promise<Array<{ file: string; symbol: string; type: string; line: number; signature: string; rank: number }>> {
    const cachePath = path.join(this.workspaceRoot, '.matrix_semantic_cache.json');
    if (!fs.existsSync(cachePath)) {
      return [];
    }

    const content = await fs.promises.readFile(cachePath, 'utf-8');
    const cacheData = JSON.parse(content);
    const files: Record<string, { symbols: SemanticSymbol[] }> = cacheData.files || cacheData;

    const matches: Array<{ file: string; symbol: string; type: string; line: number; signature: string; rank: number }> = [];
    const lowerQuery = query ? query.toLowerCase().trim() : '';

    for (const [file, data] of Object.entries(files)) {
      for (const sym of data.symbols || []) {
        const matchesQuery = !lowerQuery || lowerQuery === '*'
          || sym.name.toLowerCase().includes(lowerQuery)
          || sym.signature.toLowerCase().includes(lowerQuery);

        if (matchesQuery) {
          matches.push({
            file,
            symbol: sym.name,
            type: sym.type,
            line: sym.line,
            signature: sym.signature,
            rank: sym.rank || 0
          });
        }
      }
    }

    // Sort by PageRank score descending
    matches.sort((a, b) => b.rank - a.rank);

    return matches.slice(0, limit);
  }
}
