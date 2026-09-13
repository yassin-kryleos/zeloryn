import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';

interface InteractiveTerminalProps {
  ws: WebSocket | null;
  isConnected: boolean;
}

interface TerminalTab {
  sessionId: string;
  title: string;
  status: 'connecting' | 'connected' | 'disconnected';
  history: string;
}

export const InteractiveTerminal: React.FC<InteractiveTerminalProps> = ({ ws, isConnected }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const tabsRef = useRef<TerminalTab[]>([]);

  // Keep ref synchronized with state
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const pendingBufferRef = useRef<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => { wsRef.current = ws; }, [ws]);

  // Initialize xterm once
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 12,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      allowTransparency: true,
      cols: 60,
      rows: 16,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    term.open(terminalRef.current);
    fitAddon.fit();

    term.writeln('\x1b[1;34mKryleos Forge Multi-PTY Terminal\x1b[0m');
    term.writeln('Spawn multiple concurrent terminal sessions with \x1b[32m+\x1b[0m.\r\n');

    xtermRef.current = term;

    const onResize = () => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Switch active tab view
  const switchTab = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    const target = tabsRef.current.find(t => t.sessionId === sessionId);
    const term = xtermRef.current;
    if (!term || !target) return;

    term.clear();
    term.writeln(`\x1b[1;34m[Active Session: ${target.title}]\x1b[0m\r\n`);
    if (target.history) {
      term.write(target.history);
    }
    try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
  }, []);

  // Spawn new terminal session
  const createNewSession = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'terminal_create' }));
  }, []);

  // Close a terminal session
  const closeSession = useCallback((sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'terminal_input',
        sessionId,
        data: 'exit\r',
      }));
    }
    setTabs(prev => {
      const remaining = prev.filter(t => t.sessionId !== sessionId);
      if (activeSessionIdRef.current === sessionId) {
        const next = remaining[0]?.sessionId || null;
        setActiveSessionId(next);
        const term = xtermRef.current;
        if (term) {
          term.clear();
          if (next) {
            const nextTab = remaining[0];
            term.writeln(`\x1b[1;34m[Active Session: ${nextTab.title}]\x1b[0m\r\n`);
            if (nextTab.history) term.write(nextTab.history);
          } else {
            term.writeln('\x1b[1;33mNo active terminal sessions. Click + to create one.\x1b[0m\r\n');
          }
        }
      }
      return remaining;
    });
  }, []);

  // Handle WebSocket messages
  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      const term = xtermRef.current;
      const currentWs = wsRef.current;

      switch (msg.type) {
        case 'terminal_created': {
          const sid = msg.sessionId;
          setTabs(prev => {
            if (prev.some(t => t.sessionId === sid)) return prev;
            const newIndex = prev.length + 1;
            const newTab: TerminalTab = {
              sessionId: sid,
              title: `PTY #${newIndex}`,
              status: 'connected',
              history: ''
            };
            return [...prev, newTab];
          });
          setActiveSessionId(sid);

          if (term) {
            term.clear();
            term.writeln(`\x1b[1;32mTerminal session ${sid.slice(0, 8)} ready.\x1b[0m\r\n`);
            if (msg.cols && msg.rows) {
              term.resize(msg.cols, msg.rows);
            } else {
              try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
            }
          }

          // Flush any keystrokes buffered while session was pending
          const buffer = pendingBufferRef.current;
          pendingBufferRef.current = [];
          for (const data of buffer) {
            currentWs?.send(JSON.stringify({ type: 'terminal_input', sessionId: sid, data }));
          }
          break;
        }

        case 'terminal_data': {
          const sid = msg.sessionId;
          // Strip terminal title escape sequences (OSC 0, OSC 1, OSC 2)
          const ESC = '\x1b';
          const BEL = '\x07';
          const pattern = new RegExp(`${ESC}\]0;.*?${BEL}|${ESC}\]1;.*?${BEL}|${ESC}\]2;.*?${BEL}`, 'g');
          const safe = typeof msg.data === 'string' ? msg.data.replace(pattern, '') : msg.data;

          // Update tab history buffer (cap to last 50,000 chars)
          setTabs(prev => prev.map(t => {
            if (t.sessionId !== sid) return t;
            const updated = (t.history + safe).slice(-50000);
            return { ...t, history: updated };
          }));

          // If this data belongs to the currently active session, write to xterm
          if (sid === activeSessionIdRef.current && term) {
            term.write(safe);
          }
          break;
        }

        case 'terminal_exit': {
          const sid = msg.sessionId;
          setTabs(prev => prev.map(t => (t.sessionId === sid ? { ...t, status: 'disconnected' } : t)));
          if (sid === activeSessionIdRef.current && term) {
            term.writeln(`\r\n\x1b[1;33mProcess exited with code ${msg.exitCode}\x1b[0m`);
            term.writeln('\x1b[1;32mType any key or click + to start a new session...\x1b[0m');
          }
          break;
        }

        case 'error': {
          if (msg.code === 'terminal_create_failed' && term) {
            term.writeln(`\r\n\x1b[1;31mError: ${msg.message}\x1b[0m`);
          }
          break;
        }
      }
    } catch { /* non-JSON messages */ }
  }, []);

  useEffect(() => {
    if (!ws || !isConnected) return;
    ws.addEventListener('message', handleWsMessage);
    return () => ws.removeEventListener('message', handleWsMessage);
  }, [ws, isConnected, handleWsMessage]);

  // Auto-create initial session when WS connects if none exist
  useEffect(() => {
    if (!ws || !isConnected) return;
    if (tabs.length === 0 && !activeSessionId) {
      ws.send(JSON.stringify({ type: 'terminal_create' }));
    }
  }, [ws, isConnected, tabs.length, activeSessionId]);

  // Keyboard input → WebSocket for active session
  useEffect(() => {
    const term = xtermRef.current;
    if (!term || !ws) return;

    const disposable = term.onData((data: string) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const currentSid = activeSessionIdRef.current;
      if (!currentSid) {
        pendingBufferRef.current.push(data);
        ws.send(JSON.stringify({ type: 'terminal_create' }));
        return;
      }
      ws.send(JSON.stringify({
        type: 'terminal_input',
        sessionId: currentSid,
        data,
      }));
    });

    return () => disposable.dispose();
  }, [ws]);

  // Resize → WebSocket for active session
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    const disposable = term.onResize(({ cols, rows }) => {
      const currentSid = activeSessionIdRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && currentSid) {
        ws.send(JSON.stringify({
          type: 'terminal_resize',
          sessionId: currentSid,
          cols,
          rows,
        }));
      }
    });

    return () => disposable.dispose();
  }, [ws]);

  const activeTab = tabs.find(t => t.sessionId === activeSessionId);

  return (
    <div className="h-full flex flex-col gap-1 p-1">
      {/* Session Tab Bar */}
      <div className="flex items-center justify-between border-b border-forge-dark pb-1 gap-1">
        <div className="flex items-center gap-1 overflow-x-auto max-w-[280px]">
          {tabs.map((tab) => {
            const isActive = tab.sessionId === activeSessionId;
            return (
              <div
                key={tab.sessionId}
                onClick={() => switchTab(tab.sessionId)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono cursor-pointer border transition-colors ${
                  isActive
                    ? 'border-forge-neon bg-forge-very-dark text-forge-neon font-bold'
                    : 'border-forge-dark bg-black/40 text-forge-dim hover:text-white'
                }`}
                title={`Session: ${tab.sessionId}`}
              >
                <TerminalIcon size={9} />
                <span>{tab.title}</span>
                <button
                  type="button"
                  onClick={(e) => closeSession(tab.sessionId, e)}
                  className="hover:text-red-400 p-0.5 ml-0.5"
                  title="Close session"
                >
                  <X size={8} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={createNewSession}
            className="flex items-center justify-center p-1 rounded border border-forge-dark bg-black/40 text-forge-neon hover:bg-forge-very-dark text-[9px]"
            title="Create new terminal PTY session"
          >
            <Plus size={10} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[8px] font-mono shrink-0">
          {activeTab?.status === 'connected' && (
            <span className="text-green-400 font-bold">● Active</span>
          )}
          {activeTab?.status === 'disconnected' && (
            <span className="text-forge-dim font-bold">○ Exited</span>
          )}
          {!activeTab && (
            <span className="text-forge-dim font-bold">○ No session</span>
          )}
        </div>
      </div>

      <div
        ref={terminalRef}
        className="flex-1 border border-forge-dark rounded overflow-hidden"
      />
    </div>
  );
};
