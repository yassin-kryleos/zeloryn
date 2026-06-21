import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface InteractiveTerminalProps {
  ws: WebSocket | null;
  isConnected: boolean;
}

export const InteractiveTerminal: React.FC<InteractiveTerminalProps> = ({ ws, isConnected }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Initialize xterm.js
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

    term.writeln('\x1b[1;34mKryleos Forge Terminal\x1b[0m');
    term.writeln('Type \x1b[33mexit\x1b[0m to close the session.\r\n');

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

  // Handle WebSocket messages
  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      const term = xtermRef.current;
      if (!term) return;

      switch (msg.type) {
        case 'terminal_created':
          sessionIdRef.current = msg.sessionId;
          setStatus('connected');
          term.clear();
          term.writeln(`\x1b[1;32mTerminal session ${msg.sessionId} ready.\x1b[0m`);
          if (msg.cols && msg.rows) {
            term.resize(msg.cols, msg.rows);
          } else {
            try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
          }
          break;

        case 'terminal_data':
          if (msg.sessionId === sessionIdRef.current) {
            // Strip terminal title escape sequences (OSC 0, OSC 1, OSC 2)
            const safe = typeof msg.data === 'string' ? msg.data.replace(/\x1b\]0;.*?\x07|\x1b\]1;.*?\x07|\x1b\]2;.*?\x07/g, '') : msg.data;
            term.write(safe);
          }
          break;

        case 'terminal_exit':
          if (msg.sessionId === sessionIdRef.current) {
            term.writeln(`\r\n\x1b[1;33mProcess exited with code ${msg.exitCode}\x1b[0m`);
            term.writeln('\x1b[1;32mType any key to start a new session...\x1b[0m');
            sessionIdRef.current = null;
            setStatus('disconnected');
          }
          break;

        case 'error':
          if (msg.code === 'terminal_create_failed') {
            term.writeln(`\r\n\x1b[1;31mError: ${msg.message}\x1b[0m`);
            setStatus('disconnected');
          }
          break;
      }
    } catch { /* non-JSON messages */ }
  }, []);

  useEffect(() => {
    if (!ws || !isConnected) return;
    ws.addEventListener('message', handleWsMessage);
    return () => ws.removeEventListener('message', handleWsMessage);
  }, [ws, isConnected, handleWsMessage]);

  // Auto-create session when WS connects
  useEffect(() => {
    if (!ws || !isConnected) return;
    if (!sessionIdRef.current && status === 'disconnected') {
      setStatus('connecting');
      ws.send(JSON.stringify({ type: 'terminal_create' }));
    }
  }, [ws, isConnected, status]);

  // Keyboard input → WebSocket
  useEffect(() => {
    const term = xtermRef.current;
    if (!term || !ws) return;

    const disposable = term.onData((data: string) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!sessionIdRef.current) {
        ws.send(JSON.stringify({ type: 'terminal_create' }));
        ws.send(JSON.stringify({ type: 'terminal_input', sessionId: '__pending__', data }));
        return;
      }
      ws.send(JSON.stringify({
        type: 'terminal_input',
        sessionId: sessionIdRef.current,
        data,
      }));
    });

    return () => disposable.dispose();
  }, [ws]);

  // Resize → WebSocket
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    const disposable = term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN && sessionIdRef.current) {
        ws.send(JSON.stringify({
          type: 'terminal_resize',
          sessionId: sessionIdRef.current,
          cols,
          rows,
        }));
      }
    });

    return () => disposable.dispose();
  }, [ws]);

  return (
    <div className="h-full flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-1.5 forge-panel-title">
          <span>Interactive Terminal</span>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          {status === 'connected' && (
            <span className="text-green-500 font-bold">● Connected</span>
          )}
          {status === 'connecting' && (
            <span className="text-yellow-500 font-bold">● Connecting...</span>
          )}
          {status === 'disconnected' && (
            <span className="text-forge-dim font-bold">○ Idle</span>
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
