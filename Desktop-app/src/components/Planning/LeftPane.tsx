import React from "react";
import { Send, Sparkles, Mic, MicOff, FileCode, Pencil, Square } from "lucide-react";
import { usePlanningStore } from "../../store/usePlanningStore";
import { useVoiceInput } from "../../hooks/useVoiceInput";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 0.14 / 1000000, output: 0.28 / 1000000 },
  "deepseek-reasoner": { input: 0.55 / 1000000, output: 2.19 / 1000000 },
  "gemini-2.5-flash": { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  "gemini-2.5-pro": { input: 1.25 / 1000000, output: 5.00 / 1000000 },
  "gpt-4o": { input: 2.50 / 1000000, output: 10.00 / 1000000 },
  "gpt-4o-mini": { input: 0.15 / 1000000, output: 0.60 / 1000000 },
  "claude-3-5-sonnet-latest": { input: 3.00 / 1000000, output: 15.00 / 1000000 },
  "claude-3-5-haiku-latest": { input: 0.80 / 1000000, output: 4.00 / 1000000 },
  "meta-llama/llama-3.3-70b-instruct": { input: 0.54 / 1000000, output: 0.54 / 1000000 },
  "qwen/qwen-2.5-coder-32b-instruct": { input: 0.40 / 1000000, output: 0.40 / 1000000 },
};

function getPricingForModel(model: string): { input: number; output: number } {
  const m = (model || "").toLowerCase();
  if (m.startsWith("ollama:") || m === "llama3" || m === "qwen2.5-coder") {
    return { input: 0, output: 0 };
  }
  if (MODEL_PRICING[m]) return MODEL_PRICING[m];
  if (m.startsWith("gemini")) return { input: 0.075 / 1000000, output: 0.30 / 1000000 };
  if (m.startsWith("gpt")) return { input: 0.15 / 1000000, output: 0.60 / 1000000 };
  if (m.startsWith("claude")) return { input: 3.00 / 1000000, output: 15.00 / 1000000 };
  if (m.includes("llama")) return { input: 0.54 / 1000000, output: 0.54 / 1000000 };
  return { input: 0.14 / 1000000, output: 0.28 / 1000000 };
}

export interface LeftPaneProps {
  activeProject?: any | null;
  chatMessages: Array<{ role: "user" | "assistant"; content: string }>;
  isStreaming: boolean;
  streamingContent: string;
  onSend: () => void;
  onEditPreviousQuestion: () => void;
  onSummarizeAndPush: () => void;
  onAbort?: () => void;
  activeModel?: string;
}

export function LeftPane({
  activeProject = null,
  chatMessages,
  isStreaming,
  streamingContent,
  onSend,
  onEditPreviousQuestion,
  onSummarizeAndPush,
  onAbort,
  activeModel = "deepseek-chat"
}: LeftPaneProps) {
  const { inputText, setInputText } = usePlanningStore();

  const voice = useVoiceInput((text) => {
    setInputText(prev => prev ? `${prev} ${text}` : text);
  });

  return (
    <div
      role="region"
      aria-label="Scratchbook Panel"
      className="flex flex-col border-b lg:border-b-0 lg:border-r border-forge-dark bg-forge-panel-bg overflow-hidden"
      style={{ flex: "1 1 44%", minWidth: 320, maxWidth: 760 }}
    >
      {!activeProject ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-forge-very-dark/30 font-mono h-full">
          <div className="max-w-md w-full border border-forge-dark bg-forge-panel-bg p-8 rounded shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-forge-neon animate-pulse" />
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center p-3 border border-forge-dark rounded bg-forge-very-dark mb-2">
                <Sparkles size={32} className="text-forge-neon" />
              </div>

              <h2 className="text-sm font-bold text-forge-text tracking-widest uppercase">
                Plan
              </h2>

              <p className="text-xs text-forge-text/80 leading-relaxed border-t border-b border-forge-dark py-4">
                No project selected yet. Pick a project from the left sidebar, or use "Add project" in the header to create one — then start scoping here.
              </p>

              <div className="text-[10px] text-forge-dim">
                The Scratchbook opens as soon as a project is active.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="forge-panel-header flex items-center justify-between shrink-0">
            <span className="forge-panel-title flex items-center gap-1.5">
              <Sparkles size={14} className="text-forge-neon" />
              <span>Scratchbook</span>
            </span>
            <span className="forge-status-chip forge-status-chip-success">Continuous Ideation</span>
          </div>

          {/* Messages feed */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 flex flex-col justify-end">
            <div className="space-y-3 overflow-y-auto max-h-full pr-1">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`forge-chat-bubble p-2.5 text-[11px] leading-relaxed max-w-[90%] ${
                    msg.role === "user"
                      ? "text-forge-text ml-auto"
                      : "forge-chat-bubble-assistant text-forge-text"
                  }`}
                >
                  <div className="text-[9px] text-forge-dim font-bold mb-1">
                    {msg.role === "user" ? "You" : "Assistant"}
                  </div>
                  <div className="whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{msg.content}</div>
                </div>
              ))}
              {isStreaming && (
                <div className="forge-chat-bubble forge-chat-bubble-assistant p-2.5 text-[11px] max-w-[90%] animate-pulse">
                  <div className="text-[9px] text-forge-dim font-bold mb-1">Assistant is drafting</div>
                  <div className="whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{streamingContent || "Thinking..."}</div>
                </div>
              )}
            </div>
          </div>

          {/* Summarize & Push Button + Composer */}
          <div className="p-3 border-t border-forge-dark bg-forge-panel-bg flex flex-col gap-2 shrink-0">
            {chatMessages.length <= 1 && (
              <div className="grid grid-cols-1 gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    const query = "Analyze the existing codebase in this repository. Produce an architectural summary, list key modules, files, dependencies, and propose a structured roadmap for tinkering or extending features.";
                    setInputText(query);
                  }}
                  className="text-left text-[10px] font-bold border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 rounded px-2.5 py-1.5 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <FileCode size={12} className="text-cyan-400" />
                    <span>Analyze &amp; Map Existing Codebase</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-cyan-400/80">Brownfield</span>
                </button>
                {[
                  "Turn my rough idea into a small first release with testable acceptance criteria.",
                  "Review this repo and suggest the safest high-impact improvement.",
                  "Help me scope one feature into frontend, backend, and test tasks."
                ].map(prompt => (
                  <button key={prompt} type="button" onClick={() => setInputText(prompt)} className="text-left text-[9px] border border-forge-dark rounded px-2 py-1 text-forge-dim hover:text-forge-text hover:border-forge-neon">
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={onSummarizeAndPush}
                disabled={isStreaming || chatMessages.length <= 1}
                title={
                  isStreaming
                    ? "Wait for the current response to finish."
                    : chatMessages.length <= 1
                      ? "Chat with the Scratchbook first — then summarize the conversation into plan items."
                      : "Extract structured plan items from this conversation."
                }
                className="w-full text-center py-2 px-3 bg-forge-neon text-black font-bold uppercase rounded hover:bg-white disabled:opacity-40 disabled:pointer-events-none transition-colors text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={13} />
                <span>Summarize &amp; Push to Workspace</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-[9px] text-forge-dim">Ephemeral Chat Scratchpad</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onEditPreviousQuestion}
                  disabled={isStreaming || !chatMessages.some(message => message.role === "user")}
                  className="forge-secondary-button disabled:opacity-40"
                  title="Edit previous question"
                >
                  <Pencil size={10} />
                </button>
                {isStreaming && (
                  <button
                    type="button"
                    onClick={onAbort}
                    className="forge-stop-button flex items-center gap-1 animate-pulse"
                    title="Stop current activity"
                  >
                    <Square size={9} />
                    <span>STOP</span>
                  </button>
                )}
              </div>
            </div>
            
            <div className="forge-composer flex flex-col gap-2">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder="Brainstorm features, describe endpoints, outline databases..."
                className="forge-input text-[12px] bg-forge-very-dark border-forge-dark text-forge-text"
                style={{
                  minHeight: 120,
                  maxHeight: 220,
                  resize: "vertical",
                  overflowY: "auto",
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere"
                }}
                disabled={isStreaming}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-forge-dim font-bold uppercase tracking-wider flex items-center gap-2">
                  <span>{inputText.length > 0 ? `${inputText.length} chars` : "ready"}</span>
                  {inputText.length > 0 && (
                    <span className="text-forge-neon">
                      ~{Math.ceil(inputText.length / 4)} tokens
                      {(() => {
                        const tokens = Math.ceil(inputText.length / 4);
                        const pricing = getPricingForModel(activeModel);
                        const cost = tokens * pricing.input;
                        if (cost === 0) return " (Free)";
                        return ` ($${cost.toFixed(5)})`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {voice.isSupported && (
                    <button
                      onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}
                      disabled={isStreaming}
                      className={`border px-2.5 rounded text-[10px] font-bold disabled:opacity-50 ${
                        voice.isListening
                          ? "border-red-500 text-red-400 bg-forge-very-dark"
                          : "border-forge-dark text-forge-neon bg-forge-very-dark hover:border-forge-neon"
                      }`}
                      type="button"
                      title={voice.isListening ? "Stop voice input" : "Start voice input"}
                    >
                      {voice.isListening ? <MicOff size={12} /> : <Mic size={12} />}
                    </button>
                  )}
                  <button
                    onClick={onSend}
                    disabled={isStreaming || !inputText.trim()}
                    className="forge-btn text-[11px] px-3.5 flex items-center gap-1 font-bold disabled:opacity-50"
                    type="button"
                  >
                    <Send size={11} />
                    <span>SEND</span>
                  </button>
                </div>
              </div>
              {voice.error && <span className="text-[9px] text-red-400 self-center">{voice.error}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
