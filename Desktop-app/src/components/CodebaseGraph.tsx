import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pin, Eye, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Node {
  id: string;
  name: string;
  type: 'code' | 'style' | 'docs' | 'other';
  size: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface Edge {
  source: string;
  target: string;
}

interface CodebaseGraphProps {
  onOpenFilePreview: (path: string) => void;
  onPinFile: (path: string) => void;
}

export const CodebaseGraph: React.FC<CodebaseGraphProps> = ({ onOpenFilePreview, onPinFile }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [simulationTrigger, setSimulationTrigger] = useState<number>(0);

  // Viewport transforms (Zoom & Pan)
  const [zoom, setZoom] = useState<number>(0.85);
  const [panX, setPanX] = useState<number>(180);
  const [panY, setPanY] = useState<number>(180);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStart = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const draggedNodeId = useRef<string | null>(null);
  const nodesRef = useRef<Node[]>([]);

  const restartSimulation = () => setSimulationTrigger(prev => prev + 1);

  const fetchGraph = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/workspace/graph`);
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data = await res.json() as { nodes: Node[]; edges: Edge[] };

      // Initialize positions in a clean circular layout
      const initializedNodes = data.nodes.map((node, i) => {
        const angle = (i / data.nodes.length) * 2 * Math.PI;
        const radius = 100 + Math.random() * 50;
        return {
          ...node,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0
        };
      });

      nodesRef.current = initializedNodes;
      setNodes(initializedNodes);
      setEdges(data.edges);
      restartSimulation();
    } catch (err: any) {
      console.error('Failed to fetch dependency graph', err);
      setError(err.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Physics Simulation Loop
  useEffect(() => {
    if (nodes.length === 0 || loading) return;

    let animFrameId: number;
    let stableFrames = 0;
    const repulsionStrength = 2400;
    const attractionStrength = 0.08;
    const centerGravity = 0.035;
    const restLength = 120;
    const damping = 0.82;

    const tick = () => {
      const currentNodes = nodesRef.current;
      if (currentNodes.length === 0) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      let maxVelocity = 0;
      const nextNodes = currentNodes.map((n) => ({ ...n }));
      const nodeMap = new Map(nextNodes.map((n) => [n.id, n]));

      // 1. Repulsion (between all node pairs)
      for (let i = 0; i < nextNodes.length; i++) {
        const n1 = nextNodes[i];
        for (let j = i + 1; j < nextNodes.length; j++) {
          const n2 = nextNodes[j];
          if (n1.x === undefined || n1.y === undefined || n2.x === undefined || n2.y === undefined) continue;

          const dx = n2.x - n1.x || 0.001;
          const dy = n2.y - n1.y || 0.001;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Avoid division by zero/extreme small values
          if (dist < 15) {
            const force = 10;
            n1.vx = (n1.vx || 0) - (dx / dist) * force;
            n1.vy = (n1.vy || 0) - (dy / dist) * force;
            n2.vx = (n2.vx || 0) + (dx / dist) * force;
            n2.vy = (n2.vy || 0) + (dy / dist) * force;
            continue;
          }

          const force = repulsionStrength / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          n1.vx = (n1.vx || 0) - fx;
          n1.vy = (n1.vy || 0) - fy;
          n2.vx = (n2.vx || 0) + fx;
          n2.vy = (n2.vy || 0) + fy;
        }
      }

      // 2. Attraction (along link edges)
      edges.forEach((edge) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);

        if (sourceNode && targetNode) {
          if (sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) return;

          const dx = targetNode.x - sourceNode.x || 0.001;
          const dy = targetNode.y - sourceNode.y || 0.001;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

          const force = (dist - restLength) * attractionStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          sourceNode.vx = (sourceNode.vx || 0) + fx;
          sourceNode.vy = (sourceNode.vy || 0) + fy;
          targetNode.vx = (targetNode.vx || 0) - fx;
          targetNode.vy = (targetNode.vy || 0) - fy;
        }
      });

      // 3. Central Gravity & Apply Velocities
      nextNodes.forEach((n) => {
        if (n.x === undefined || n.y === undefined) return;

        // If this is currently dragged, lock to cursor (handled in mouse events)
        if (draggedNodeId.current === n.id) {
          n.vx = 0;
          n.vy = 0;
          return;
        }

        // Central pull to (0,0)
        n.vx = (n.vx || 0) - n.x * centerGravity;
        n.vy = (n.vy || 0) - n.y * centerGravity;

        // Update coords
        n.x += n.vx;
        n.y += n.vy;

        // Damping friction
        n.vx *= damping;
        n.vy *= damping;

        const velocity = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (velocity > maxVelocity) maxVelocity = velocity;
      });

      nodesRef.current = nextNodes;
      setNodes(nextNodes);

      if (maxVelocity < 0.08) {
        stableFrames++;
      } else {
        stableFrames = 0;
      }

      if (stableFrames > 20) {
        // Pausing simulation to save CPU
        return;
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [nodes.length, edges, loading, simulationTrigger]);

  // Mouse drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // If we click on background, trigger panning
    const target = e.target as SVGElement;
    if (target.tagName === 'svg' || target.getAttribute('id') === 'bg-grid') {
      setIsPanning(true);
      panStart.current = { x: e.clientX - panX, y: e.clientY - panY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPanX(e.clientX - panStart.current.x);
      setPanY(e.clientY - panStart.current.y);
    } else if (draggedNodeId.current) {
      // Find mouse coordinate relative to the grid transform
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left - rect.width / 2;
      const clickY = e.clientY - rect.top - rect.height / 2;

      // Translate click coords back through zoom and pan offsets
      const gridX = (clickX - (panX - rect.width / 2)) / zoom;
      const gridY = (clickY - (panY - rect.height / 2)) / zoom;

      const nextNodes = nodesRef.current.map((n) =>
        n.id === draggedNodeId.current ? { ...n, x: gridX, y: gridY } : n
      );
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    draggedNodeId.current = null;
  };

  // Node Drag
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    draggedNodeId.current = nodeId;
    restartSimulation();
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'code':
        return 'var(--forge-neon)';
      case 'style':
        return '#06b6d4'; // Cyan
      case 'docs':
        return '#a855f7'; // Purple
      default:
        return 'var(--forge-dim)';
    }
  };

  return (
    <div ref={containerRef} className="flex-1 w-full h-full flex flex-col overflow-hidden relative min-h-[300px] border border-forge-dark rounded bg-forge-bg">
      {/* Controls Bar */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-forge-very-dark bg-opacity-75 border border-forge-dark p-1 rounded">
        <button onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))} className="p-1 hover:text-forge-neon" title="Zoom In"><ZoomIn size={12} /></button>
        <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.25))} className="p-1 hover:text-forge-neon" title="Zoom Out"><ZoomOut size={12} /></button>
        <button onClick={() => { setZoom(0.85); setPanX(180); setPanY(180); restartSimulation(); }} className="p-1 hover:text-forge-neon" title="Reset view"><Maximize2 size={12} /></button>
        <div className="w-px h-3 bg-forge-dark mx-1" />
        <button onClick={fetchGraph} className="p-1 hover:text-forge-neon" title="Reload Graph"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-forge-neon font-mono">
          <RefreshCw className="animate-spin mr-1.5" size={12} /> SCANNING WORKSPACE RELATIONSHIPS...
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[10px] text-red-500 font-mono gap-2 p-4 text-center">
          <span>⚠️ {error}</span>
          <button onClick={fetchGraph} className="forge-btn px-2.5 py-1 text-[9px] flex items-center gap-1 font-bold">
            <RefreshCw size={10} /> RETRY SCAN
          </button>
        </div>
      ) : (
        <div className="flex-1 h-full w-full relative overflow-hidden flex">
          
          {/* SVG Canvas */}
          <svg
            width="100%"
            height="100%"
            className="flex-1 h-full w-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* SVG Defs (Patterns & Gradients) */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border-color)" strokeWidth="0.8" />
              </pattern>
              <linearGradient id="linkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--forge-neon)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--forge-dim)" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            <rect id="bg-grid" width="100%" height="100%" fill="url(#grid)" />

            {/* Transform Group */}
            <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
              
              {/* Edges / Dependencies */}
              {edges.map((edge, idx) => {
                const sourceNode = nodes.find((n) => n.id === edge.source);
                const targetNode = nodes.find((n) => n.id === edge.target);

                if (!sourceNode || !targetNode) return null;
                if (sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) return null;

                const midX = (sourceNode.x + targetNode.x) / 2;
                const midY = (sourceNode.y + targetNode.y) / 2;

                return (
                  <g key={`${edge.source}-${edge.target}-${idx}`}>
                    {/* Glowing link line */}
                    <line
                      x1={sourceNode.x}
                      y1={sourceNode.y}
                      x2={targetNode.x}
                      y2={targetNode.y}
                      stroke="url(#linkGrad)"
                      strokeWidth={1.5}
                      strokeOpacity={0.65}
                      className="transition-all duration-200"
                    />
                    
                    {/* Tiny animated flowing stream signal */}
                    <circle
                      r={2}
                      fill="var(--forge-neon)"
                      opacity={0.8}
                    >
                      <animateMotion
                        dur="3s"
                        repeatCount="indefinite"
                        path={`M ${sourceNode.x} ${sourceNode.y} L ${targetNode.x} ${targetNode.y}`}
                      />
                    </circle>
                  </g>
                );
              })}

              {/* Nodes / File Cards */}
              {nodes.map((node) => {
                if (node.x === undefined || node.y === undefined) return null;

                const isSelected = selectedNode?.id === node.id;
                const nodeColor = getNodeColor(node.type);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(node);
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  >
                    {/* Node base glow ring */}
                    <circle
                      r={14}
                      fill="none"
                      stroke={nodeColor}
                      strokeWidth={isSelected ? 3 : 1}
                      strokeOpacity={isSelected ? 0.9 : 0.4}
                      className="group-hover:stroke-opacity-80 transition-all duration-200"
                    />

                    {/* Inside filled circle */}
                    <circle
                      r={10}
                      fill="var(--forge-bg)"
                      stroke={nodeColor}
                      strokeWidth={2}
                    />

                    {/* File extension type badge letter */}
                    <text
                      dy="3.5"
                      textAnchor="middle"
                      fill={nodeColor}
                      fontSize="9"
                      fontWeight="bold"
                      className="font-mono select-none"
                    >
                      {node.name.split('.').pop()?.substring(0, 2).toUpperCase() || 'F'}
                    </text>

                    {/* Floating label */}
                    <text
                      y={25}
                      textAnchor="middle"
                      fill={isSelected ? 'var(--forge-neon)' : 'var(--forge-dim)'}
                      fontSize="9.5"
                      className="font-mono select-none bg-forge-very-dark bg-opacity-70 px-1 rounded pointer-events-none transition-colors duration-150"
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Selected File Floating Side-Drawer */}
          {selectedNode && (
            <div className="absolute right-2 bottom-2 top-12 w-64 bg-forge-panel-bg border border-forge-dark p-3 rounded flex flex-col gap-3 font-mono text-[10px] backdrop-blur-md">
              <div className="flex justify-between items-start border-b border-forge-dark pb-1.5">
                <span className="text-forge-neon font-bold truncate pr-2" title={selectedNode.id}>
                  📄 {selectedNode.name}
                </span>
                <button onClick={() => setSelectedNode(null)} className="text-forge-dim hover:text-forge-text" type="button">✕</button>
              </div>

              <div className="flex-1 flex flex-col gap-1 text-[9px] text-forge-dim">
                <div>Path: <span className="text-forge-text select-all">{selectedNode.id}</span></div>
                <div>Type: <span className="text-forge-text uppercase">{selectedNode.type}</span></div>
                <div>Size: <span className="text-forge-text">{(selectedNode.size / 1024).toFixed(2)} KB</span></div>
              </div>

              <div className="flex gap-2 border-t border-forge-dark pt-2.5">
                <button
                  onClick={() => onOpenFilePreview(selectedNode.id)}
                  className="flex-1 forge-btn py-1 flex items-center justify-center gap-1 font-bold"
                >
                  <Eye size={10} />
                  <span>VIEW / EDIT</span>
                </button>
                <button
                  onClick={() => onPinFile(selectedNode.id)}
                  className="flex-1 forge-btn py-1 flex items-center justify-center gap-1 font-bold"
                >
                  <Pin size={10} />
                  <span>PIN CONTEXT</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
