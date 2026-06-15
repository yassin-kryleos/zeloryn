# Local-Model Differentiator Check

Date: June 15, 2026

Model: `qwen2.5:7b` via local Ollama

Test: full PLAN/FORGE money path. The agent was instructed to overwrite a TypeScript file with an exported `greetUser` function; structural acceptance criteria then scanned the workspace and a trace was expected.

Result: **failed** after 76.8 seconds. The file still contained only the original TODO mention, which the comment-aware criterion evaluator correctly rejected. Expected `pass`; received `fail`.

Decision: market local privacy as a configurable mode, not a blanket quality-equivalence claim. Use a stronger model for the primary complex-drift demo. Keep the deterministic no-key trace as the reliable first-run path.
