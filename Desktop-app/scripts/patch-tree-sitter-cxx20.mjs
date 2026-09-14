#!/usr/bin/env node
// Patches tree-sitter's binding.gyp to require C++20 instead of C++17.
//
// tree-sitter's native binding doesn't declare C++20 for newer V8/Node
// headers (Electron 42+ requires it). This is an open upstream bug --
// present even in the latest tree-sitter release -- see
// https://github.com/tree-sitter/node-tree-sitter/issues/268
//
// Setting CXXFLAGS/CL env vars at build time works on Linux/macOS (the
// env var wins the "last flag on the command line" ordering fight), but
// not on Windows: binding.gyp's own msvs_settings.AdditionalOptions
// explicitly sets /std:c++17, which MSBuild appends *after* the CL env
// var's prefix flags and so overrides it. Only editing the file directly
// fixes Windows. Runs as a postinstall hook since node_modules is
// reinstalled fresh on every `npm ci`.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bindingGypPath = join(__dirname, '..', 'node_modules', 'tree-sitter', 'binding.gyp');

if (!existsSync(bindingGypPath)) {
  console.log('[patch-tree-sitter-cxx20] tree-sitter/binding.gyp not found, skipping (not installed?)');
  process.exit(0);
}

let content = readFileSync(bindingGypPath, 'utf-8');
const before = content;

content = content
  .replaceAll('"-std=c++17"', '"-std=c++20"')
  .replaceAll('"/std:c++17"', '"/std:c++20"')
  .replaceAll('"CLANG_CXX_LANGUAGE_STANDARD": "c++17"', '"CLANG_CXX_LANGUAGE_STANDARD": "c++20"');

if (content === before) {
  console.log('[patch-tree-sitter-cxx20] no c++17 references found, already patched or upstream fixed it -- nothing to do');
} else {
  writeFileSync(bindingGypPath, content, 'utf-8');
  console.log('[patch-tree-sitter-cxx20] patched binding.gyp: c++17 -> c++20');
}
