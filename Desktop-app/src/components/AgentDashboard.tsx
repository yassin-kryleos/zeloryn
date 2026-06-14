import React from 'react';
import type { AgentRole } from '../backend/agents';

interface AgentDashboardProps {
  activeAgent: AgentRole | 'system';
  isStreaming: boolean;
}

export const AgentDashboard: React.FC<AgentDashboardProps> = ({ activeAgent, isStreaming }) => {
  const agents: Array<{ role: AgentRole; label: string; codename: string }> = [
    { role: 'coordinator', label: 'Planning', codename: 'Planner' },
    { role: 'developer', label: 'Building', codename: 'Builder' },
    { role: 'researcher', label: 'Research', codename: 'Analyst' },
    { role: 'debugger', label: 'Review', codename: 'Reviewer' }
  ];

  return (
    <div className="flex items-center gap-4 text-xs font-mono select-none px-2 py-1 bg-forge-very-dark border border-forge-dark rounded">
      <span className="forge-section-title border-r border-forge-dark pr-3">
        Team status
      </span>
      <div className="flex items-center gap-4 flex-wrap">
        {agents.map((agent) => {
          const isActive = activeAgent === agent.role;
          const statusText = isActive 
            ? (isStreaming ? 'working' : 'active')
            : 'idle';
            
          let dotColor = 'bg-forge-dark';
          let textColor = 'text-forge-dim';
          
          if (isActive) {
            if (agent.role === 'debugger') {
              dotColor = 'bg-forge-amber animate-pulse';
              textColor = 'neon-amber font-bold';
            } else {
              dotColor = 'bg-forge-neon animate-pulse';
              textColor = 'text-forge-neon font-bold';
            }
          }

          return (
            <div key={agent.role} className={`flex items-center gap-1.5 ${textColor}`}>
              <span className={`h-2 w-2 rounded-full ${dotColor}`} />
              <span className="text-[11px]">
                {agent.codename}: {statusText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
