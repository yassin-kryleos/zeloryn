import React, { useState, useRef, useEffect } from 'react';
import { Brain, ChevronDown, ChevronRight, Mic, MicOff, Pencil, Square } from 'lucide-react';
import type { AgentLog, AgentRole } from '../backend/agents';
import { useVoiceInput } from '../hooks/useVoiceInput';

// Helper to clean up raw LLM messages
const formatTerminalText = (text: string): string => {
  // Strip action tags completely (handles complete or incomplete tags during streaming)
  let cleanText = text.split(/<action/i)[0].trim();
  // Unescape literal "\n" strings from JSON serialization
  cleanText = cleanText.replace(/\\n/g, '\n');
  return cleanText;
};

const highlightWordDiff = (line: string, otherLines: string[], isAddition: boolean) => {
  const prefix = isAddition ? '+' : '-';
  const cleanLine = line.substring(1);
  
  const opposingWords = new Set<string>();
  otherLines.forEach(other => {
    other.substring(1).split(/[^a-zA-Z0-9_]+/).forEach(w => {
      if (w.trim()) opposingWords.add(w.trim());
    });
  });

  const parts = cleanLine.split(/([^a-zA-Z0-9_]+)/);

  return (
    <>
      <span className="opacity-50 mr-1">{prefix}</span>
      {parts.map((part, idx) => {
        if (!part.trim()) return part;
        // Check if alphanumeric token
        const isWord = /^[a-zA-Z0-9_]+$/.test(part);
        if (isWord) {
          const isDifferent = !opposingWords.has(part);
          if (isDifferent) {
            const highlightClass = isAddition 
              ? 'bg-emerald-800 text-white px-0.5 rounded font-bold' 
              : 'bg-rose-950 text-rose-300 px-0.5 rounded font-bold line-through';
            return (
              <span key={idx} className={highlightClass}>
                {part}
              </span>
            );
          }
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
};

const parseInlineFormatting = (text: string) => {
  const tokenRegex = /(\*\*.*?\*\*|`.*?`)/g;
  const tokens = text.split(tokenRegex);
  
  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={index} className="text-forge-neon font-bold select-text">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={index} className="bg-forge-very-dark bg-opacity-70 text-cyan-300 border border-forge-dark px-1.5 py-0.5 rounded font-mono text-[10px] select-text">
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={index}>{token}</React.Fragment>;
  });
};

// Main markdown formatter for lines
const renderFormattedText = (text: string, defaultStyleClass: string) => {
  const cleanText = formatTerminalText(text);
  if (!cleanText) return null;
  
  const lines = cleanText.split('\n');
  
  return lines.map((line, idx) => {
    // Heading 3
    if (line.startsWith('### ')) {
      return (
        <h3 key={idx} className="text-forge-neon font-bold text-xs tracking-wider uppercase mt-2 mb-1 select-text">
          {parseInlineFormatting(line.slice(4))}
        </h3>
      );
    }
    // Heading 2 or Heading 1
    if (line.startsWith('## ') || line.startsWith('# ')) {
      const headingText = line.startsWith('## ') ? line.slice(3) : line.slice(2);
      return (
        <h2 key={idx} className="text-white border-b border-forge-dark pb-0.5 text-xs font-bold tracking-widest uppercase mt-3 mb-1.5 select-text">
          {parseInlineFormatting(headingText)}
        </h2>
      );
    }
    // Bullet point
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const bulletText = line.trim().startsWith('- ') ? line.trim().slice(2) : line.trim().slice(2);
      return (
        <div key={idx} className="flex items-start gap-1.5 pl-3 py-0.5 select-text">
          <span className="text-forge-neon select-none">✦</span>
          <span className={`${defaultStyleClass} select-text`}>{parseInlineFormatting(bulletText)}</span>
        </div>
      );
    }

    // Default body line
    return (
      <div key={idx} className={`min-h-[1.1em] py-0.5 ${defaultStyleClass} select-text`}>
        {parseInlineFormatting(line)}
      </div>
    );
  });
};

interface ChatConsoleProps {
  logs: AgentLog[];
  isStreaming: boolean;
  streamingReasoning?: string;
  streamingContent?: string;
  activeAgent: AgentRole | 'system';
  onSendQuery: (query: string) => void;
  initialInput?: string;
  onClearInitialInput?: () => void;
  customPrompt?: string;
  onClearCustomPrompt?: () => void;
  commandPendingApproval?: { tool: string; command: string } | null;
  onApproveCommand?: (approved: boolean) => void;
  onSendToPlan?: (text: string) => void;
  onPushToFlow?: (text: string) => void;
  onAbort?: () => void;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  logs,
  isStreaming,
  streamingReasoning,
  streamingContent,
  activeAgent,
  onSendQuery,
  initialInput = '',
  onClearInitialInput,
  customPrompt = '',
  onClearCustomPrompt,
  commandPendingApproval = null,
  onApproveCommand,
  onSendToPlan,
  onPushToFlow,
  onAbort,
}) => {
  const [query, setQuery] = useState<string>('');
  const voice = useVoiceInput((text) => {
    setQuery(prev => prev ? `${prev} ${text}` : text);
  });

  useEffect(() => {
    if (customPrompt) {
      setQuery(customPrompt);
      onClearCustomPrompt?.();
    }
  }, [customPrompt, onClearCustomPrompt]);

  useEffect(() => {
    if (initialInput) {
      setQuery(initialInput);
      onClearInitialInput?.();
    }
  }, [initialInput, onClearInitialInput]);

  const [collapsedThoughts, setCollapsedThoughts] = useState<{ [key: number]: boolean }>({});
  const [collapsedResults, setCollapsedResults] = useState<{ [key: number]: boolean }>({});
  const [shouldAutoScroll, setShouldAutoScroll] = useState<boolean>(true);
  const [revertStatus, setRevertStatus] = useState<{[key: number]: string}>({});

  const executeRevert = async (logIndex: number, filePath: string) => {
    try {
      setRevertStatus(prev => ({ ...prev, [logIndex]: 'reverting...' }));
      const response = await fetch('http://localhost:3001/api/workspace/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      const data = await response.json();
      if (data.success) {
        setRevertStatus(prev => ({ ...prev, [logIndex]: 'REVERTED' }));
      } else {
        setRevertStatus(prev => ({ ...prev, [logIndex]: 'no snapshot' }));
      }
    } catch {
      setRevertStatus(prev => ({ ...prev, [logIndex]: 'error' }));
    }
  };
  
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Monitor scroll events to check if user has manually scrolled up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // If the user is within 60px of the bottom, keep auto-scroll active
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setShouldAutoScroll(isAtBottom);
  };

  useEffect(() => {
    if (shouldAutoScroll) {
      consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, streamingContent, streamingReasoning, shouldAutoScroll]);

  // Force scroll to bottom when a new user message or log is initiated
  useEffect(() => {
    setShouldAutoScroll(true);
    consoleEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [logs.length]);

  // Autofocus the input when streaming completes
  useEffect(() => {
    if (!isStreaming && activeAgent === 'system') {
      inputRef.current?.focus();
    }
  }, [isStreaming, activeAgent]);

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitQuery = () => {
    if (!query.trim() || isStreaming || activeAgent !== 'system') return;
    onSendQuery(query);
    setQuery('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuery();
  };

  const editPreviousQuestion = () => {
    const previousUserMessage = [...logs].reverse().find(log => log.sender === 'user' && log.type === 'info');
    if (!previousUserMessage) return;
    setQuery(String(previousUserMessage.message || ''));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const toggleThought = (index: number) => {
    setCollapsedThoughts(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleResult = (index: number) => {
    setCollapsedResults(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // Maps backend roles to Forge team names
  const getAgentCodename = (sender: string): string => {
    switch (sender.toLowerCase()) {
      case 'coordinator':
        return 'Planner';
      case 'developer':
        return 'Builder';
      case 'researcher':
        return 'Analyst';
      case 'debugger':
        return 'Reviewer';
      default:
        return sender;
    }
  };

  const getSenderColor = (sender: string) => {
    switch (sender.toLowerCase()) {
      case 'coordinator':
      case 'planner':
        return 'text-forge-neon';
      case 'developer':
      case 'builder':
        return 'text-cyan-400';
      case 'researcher':
      case 'analyst':
        return 'text-purple-400';
      case 'debugger':
      case 'reviewer':
        return 'neon-amber';
      case 'terminal':
        return 'text-gray-400';
      case 'system':
        return 'text-forge-dim';
      default:
        return 'text-forge-text';
    }
  };

  const renderLogContent = (log: AgentLog, index: number) => {
    const isThought = log.type === 'thought';
    const isResult = log.type === 'result';
    const isError = log.type === 'error';
    const isAction = log.type === 'action';
    
    const agentName = getAgentCodename(log.sender);

    if (isThought) {
      const isCollapsed = collapsedThoughts[index] ?? false;
      return (
        <div key={index} className="my-1.5 font-mono border-l-2 border-forge-dark pl-3 py-1">
          <button
            onClick={() => toggleThought(index)}
            className="flex items-center gap-2 text-xs neon-amber hover:text-white font-bold tracking-widest focus:outline-none mb-1 text-left"
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span className="flex items-center gap-1.5">
              <Brain size={12} />
              <span>COGNITIVE TRACE // {agentName.toUpperCase()}</span>
            </span>
          </button>
          {!isCollapsed && (
            <div className="text-xs text-[#dcb059] leading-relaxed whitespace-pre-wrap select-text pl-4 font-mono bg-forge-very-dark bg-opacity-30 p-2 rounded">
              {log.message}
            </div>
          )}
        </div>
      );
    }

    if (isResult) {
      const hasDiff = log.message.includes('--- DIFF CONTENT ---');
      const isCollapsed = collapsedResults[index] ?? (hasDiff ? false : true);
      const isLongMessage = log.message.length > 200;
      
      let displayContent;
      if (hasDiff) {
        const parts = log.message.split('--- DIFF CONTENT ---');
        const headerText = parts[0].trim();
        const diffBlock = parts[1].split('--------------------')[0].trim();
        const diffLines = diffBlock.split('\n');

        displayContent = isCollapsed ? (
          <pre className="m-0 bg-transparent border-0 p-0 overflow-hidden text-ellipsis whitespace-nowrap opacity-60">
            {headerText}...
          </pre>
        ) : (
          <div className="mt-1">
            <div className="text-[10px] text-forge-neon mb-1">{headerText}</div>
            <div className="font-mono text-xs border border-forge-dark bg-black bg-opacity-65 rounded overflow-auto max-h-[300px] select-text">
              {diffLines.map((line, lIdx) => {
                let lineClass = 'text-forge-dim opacity-70 px-2 py-0.5';
                const addedLines = diffLines.filter(l => l.startsWith('+'));
                const removedLines = diffLines.filter(l => l.startsWith('-'));
                let renderedLine = <>{line}</>;

                if (line.startsWith('+')) {
                  lineClass = 'diff-add px-2 py-0.5 font-bold';
                  renderedLine = highlightWordDiff(line, removedLines, true);
                } else if (line.startsWith('-')) {
                  lineClass = 'diff-remove px-2 py-0.5 font-bold';
                  renderedLine = highlightWordDiff(line, addedLines, false);
                }
                return (
                  <div key={lIdx} className={`${lineClass} whitespace-pre-wrap select-text`}>
                    {renderedLine}
                  </div>
                );
              })}
            </div>
          </div>
        );
      } else {
        displayContent = isCollapsed && isLongMessage ? (
          <pre className="m-0 bg-transparent border-0 p-0 overflow-hidden text-ellipsis whitespace-nowrap opacity-60">
            {log.message.slice(0, 100)}...
          </pre>
        ) : (
          <pre className="m-0 bg-black bg-opacity-40 border border-forge-dark p-2 overflow-auto max-h-[250px] whitespace-pre-wrap text-emerald-300 select-text">
            {log.message}
          </pre>
        );
      }

      const parts = hasDiff ? log.message.split('--- DIFF CONTENT ---') : [];
      const headerText = hasDiff ? parts[0].trim() : '';
      const pathMatch = headerText.match(/Successfully modified\s+([a-zA-Z0-9_\-\.\/\\~]+)/i);
      const fileToRevert = pathMatch ? pathMatch[1] : '';
      const currentRevertStatus = revertStatus[index];

      return (
        <div key={index} className="my-1.5 font-mono border-l-2 border-forge-dark pl-3 py-0.5">
          <div className="flex items-center gap-4 text-[10px] text-forge-dim tracking-wider mb-1">
            <span>[OUTPUT DELTA // FROM: {agentName.toUpperCase()}]</span>
            {(isLongMessage || hasDiff) && (
              <button
                onClick={() => toggleResult(index)}
                className="text-forge-neon hover:underline focus:outline-none cursor-pointer"
              >
                {isCollapsed ? '[EXPAND]' : '[COLLAPSE]'}
              </button>
            )}
            {fileToRevert && !isCollapsed && (
              <button
                onClick={() => executeRevert(index, fileToRevert)}
                disabled={currentRevertStatus === 'REVERTED' || currentRevertStatus === 'reverting...'}
                className="text-red-400 hover:text-white border border-red-500 px-1.5 py-0.5 rounded bg-forge-very-dark cursor-pointer text-[9px] font-bold transition-all"
              >
                {currentRevertStatus ? `[${currentRevertStatus.toUpperCase()}]` : '[REVERT UNDO]'}
              </button>
            )}
            {onSendToPlan && (
              <button
                onClick={() => onSendToPlan(log.message)}
                className="text-forge-dim hover:text-forge-neon border border-forge-dark px-1.5 py-0.5 rounded cursor-pointer text-[9px] font-mono transition-colors"
                title="Add delta output to planning scoping phase"
              >
                {"[-> PLAN]"}
              </button>
            )}
          </div>
          <div className="text-xs text-emerald-400 select-text">
            {displayContent}
          </div>
        </div>
      );
    }

    // Standard shell log formatting
    let promptPrefix = '';
    let messageText = log.message;

    if (log.sender === 'user') {
      promptPrefix = 'forge@workspace:~$ ';
    } else if (log.sender === 'system') {
      promptPrefix = '[sys] ';
    } else {
      promptPrefix = `[${agentName}] ~ $ `;
    }

    const textStyle = isError 
      ? 'neon-red' 
      : isAction 
        ? 'text-forge-neon' 
        : log.sender === 'user' 
          ? 'text-white' 
          : 'text-forge-text';

    const cleanMsg = formatTerminalText(messageText);
    if (!cleanMsg) return null; // Hide logs that are completely stripped action tags

    return (
      <div key={index} className="text-xs font-mono py-1 select-text border-b border-forge-very-dark pb-1.5 mb-1.5 last:border-b-0">
        <div className="flex items-center justify-between select-none opacity-85">
          <div className="flex items-center gap-1.5">
            <span className="text-forge-dim">[{log.timestamp}]</span>
            <span className={`${getSenderColor(log.sender)} font-bold`}>{promptPrefix.trim()}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onPushToFlow && log.sender === 'assistant' && /###\s+\[ITEM\]/i.test(log.message) && (
              <button
                onClick={() => onPushToFlow(log.message)}
                className="text-[9px] text-forge-neon hover:text-white border border-forge-neon px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                title="Push parsed items to Flow tasks board"
              >
                {"[PUSH TO FLOW]"}
              </button>
            )}
            {onSendToPlan && (log.sender === 'assistant' || log.sender === 'user') && (
              <button
                onClick={() => onSendToPlan(log.message)}
                className="text-[9px] text-forge-dim hover:text-forge-neon border border-forge-dark px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                title="Add this text to planning scoping phase"
              >
                {"[-> PLAN]"}
              </button>
            )}
          </div>
        </div>
        <div className="pl-4 mt-1 select-text">
          {renderFormattedText(messageText, textStyle)}
        </div>
      </div>
    );
  };

  return (
    <div onClick={() => inputRef.current?.focus()} className="flex flex-col h-full overflow-hidden p-2 select-text cursor-text relative">
      
      {/* Terminal Trace logs */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pr-1 space-y-1 mb-2 font-mono select-text bg-forge-panel-bg p-3 rounded border border-forge-dark"
      >
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-forge-dim font-mono py-8 select-none">
            <span className="text-sm tracking-widest text-forge-neon font-bold mb-1">CREW SPECIALIST SQUAD READY</span>
            <span className="text-[10px] text-forge-dim max-w-sm mb-4">
              Collaborate with Planner, Builder, Analyst, and Reviewer to explore, plan, and build features.
            </span>
            <div className="grid grid-cols-2 gap-2 max-w-md w-full">
              {[
                { label: 'Audit Codebase Architecture', prompt: 'Analyze this codebase architecture, identify core modules, entrypoints, and dependencies.' },
                { label: 'Plan New Feature Specs', prompt: 'Help me plan a new feature with structured architecture, acceptance criteria, and schema changes.' },
                { label: 'Review Security & Permissions', prompt: 'Audit current auth, endpoints, input sanitization, and security risks in this project.' },
                { label: 'Identify Code Refactors & TODOs', prompt: 'Scan this repository for technical debt, messy patterns, and high-leverage refactor opportunities.' }
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuery(item.prompt);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className="p-2 border border-forge-dark hover:border-forge-neon bg-forge-very-dark/50 hover:bg-forge-dark/60 rounded text-left transition-colors cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-[10px] font-bold text-zinc-200">{item.label}</span>
                  <span className="text-[8.5px] text-forge-dim truncate">{item.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Console stream logs */}
        {logs.map((log, index) => renderLogContent(log, index))}

        {/* Live streaming reasoning thoughts & console responses */}
        {isStreaming && (
          <div className="my-1.5 font-mono border-l border-forge-neon border-opacity-40 pl-3 py-1 animate-pulse">
            
            {streamingReasoning && (
              <div className="mb-2 pl-2">
                <span className="text-[10px] neon-amber font-bold flex items-center gap-1.5 mb-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-forge-amber animate-ping" />
                  COGNITIVE TRACE ACTIVE...
                </span>
                <div className="text-xs text-[#ffd27f] leading-relaxed whitespace-pre-wrap select-text">
                  {streamingReasoning}
                </div>
              </div>
            )}

            {streamingContent && (
              <div className="pl-2 select-text">
                <span className="text-[10px] text-forge-neon font-bold flex items-center gap-1.5 mb-1 select-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-forge-neon animate-ping" />
                  STREAMING CONTENT...
                </span>
                <div className="pl-4 select-text">
                  {renderFormattedText(streamingContent, 'text-white')}
                </div>
              </div>
            )}

          </div>
        )}

         {/* Command Approval Prompt Card */}
        {commandPendingApproval && (
          <div className="my-3 font-mono border border-forge-neon bg-forge-very-dark p-3 rounded flex flex-col gap-2 select-none animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold text-forge-neon tracking-wider">
              <span className="h-2 w-2 rounded-full bg-forge-neon animate-ping" />
              <span>SECURITY GATING // COMMAND RUN APPROVAL REQUESTED</span>
            </div>
            <div className="text-[10px] text-forge-dim leading-relaxed">
              Forge is paused. Approve to execute this command in the active workspace, or reject to continue without running it.
            </div>
            <div className="bg-black bg-opacity-70 p-2 border border-forge-dark rounded text-xs font-mono text-cyan-300 select-text overflow-x-auto whitespace-pre-wrap">
              {commandPendingApproval.command}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <button
                type="button"
                onClick={() => onApproveCommand?.(true)}
                className="bg-forge-very-dark hover:bg-forge-dark border border-forge-neon text-forge-neon hover:text-white px-3 py-1 text-xs font-bold rounded cursor-pointer transition-all"
              >
                [APPROVE & RUN]
              </button>
              <button
                type="button"
                onClick={() => onApproveCommand?.(false)}
                className="bg-forge-very-dark hover:bg-forge-dark border border-red-500 text-red-500 hover:text-white px-3 py-1 text-xs font-bold rounded cursor-pointer transition-all"
              >
                [REJECT]
              </button>
            </div>
          </div>
        )}

        <div ref={consoleEndRef} />
      </div>

      {/* Floating Scroll to Bottom alert */}
      {!shouldAutoScroll && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShouldAutoScroll(true);
            consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-16 right-6 forge-secondary-button animate-pulse transition-all"
        >
          New activity
        </button>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="forge-composer font-mono select-none">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-forge-text text-xs font-bold select-none">
            {activeAgent !== 'system' ? 'Working...' : 'Ask Zeloryn'}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={editPreviousQuestion}
              disabled={isStreaming || !logs.some(log => log.sender === 'user' && log.type === 'info')}
              className="forge-secondary-button disabled:opacity-40"
              title="Edit previous question"
            >
              <Pencil size={11} />
            </button>
            {isStreaming && (
              <button
                type="button"
                onClick={onAbort}
                className="forge-stop-button flex items-center gap-1"
                title="Stop current activity"
              >
                <Square size={10} />
                <span>STOP</span>
              </button>
            )}
          </div>
        </div>
        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitQuery();
            }
          }}
          disabled={isStreaming || activeAgent !== 'system'}
          placeholder={activeAgent !== 'system' ? 'Waiting for current activity...' : 'Describe the work, question, or review you need...'}
          className="forge-input w-full bg-forge-very-dark border-forge-dark outline-none text-[12px] text-forge-text font-mono placeholder:text-forge-dim"
          style={{
            minHeight: 130,
            maxHeight: 240,
            resize: 'vertical',
            overflowY: 'auto',
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere'
          }}
        />
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[10px] text-forge-dim font-bold uppercase tracking-wider">{query.length > 0 ? `${query.length} chars` : 'ready'}</span>
          <div className="flex items-center gap-2">
            {voice.isSupported && activeAgent === 'system' && !isStreaming && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  voice.isListening ? voice.stopListening() : voice.startListening();
                }}
                className={`border px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                  voice.isListening
                    ? 'border-red-500 text-red-400 bg-forge-very-dark'
                    : 'border-forge-dark text-forge-neon bg-forge-very-dark hover:border-forge-neon'
                }`}
                title={voice.isListening ? 'Stop voice input' : 'Start voice input'}
              >
                {voice.isListening ? <MicOff size={12} /> : <Mic size={12} />}
              </button>
            )}
            <button
              type="submit"
              disabled={isStreaming || activeAgent !== 'system' || !query.trim()}
              className="forge-btn text-[11px] px-3.5 font-bold disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </form>
      {voice.error && (
        <div className="text-[9px] text-red-400 font-mono px-1.5 mt-1">{voice.error}</div>
      )}

      {/* Visual Navigation Shortcuts & Mentions Tip banner */}
      <div className="flex gap-4 justify-between items-center text-[9px] text-forge-dim font-mono select-none px-1.5 mt-1.5 border-t border-forge-dark border-opacity-30 pt-1.5">
        <div className="flex gap-2">
          <span>Shortcuts:</span>
          <span className="text-forge-neon font-bold">F1 Plan</span>
          <span className="text-forge-neon font-bold">F2 Crew</span>
          <span className="text-forge-neon font-bold">F3 Flow</span>
          <span className="text-forge-neon font-bold">F4 Forge</span>
          <span className="text-forge-neon font-bold">F5 Vibe</span>
        </div>
        <div>
          <span>Tip: Type <span className="text-forge-neon font-bold">@filename</span> to pin files</span>
        </div>
      </div>

    </div>
  );
};
