import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationCenterProps {
  notifications: AppNotification[];
  onDismiss: (id: number) => void;
}

const iconByKind = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

const classByKind: Record<NotificationKind, string> = {
  success: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10',
  error: 'border-red-500/30 text-red-500 bg-red-500/10',
  warning: 'border-amber-500/30 text-amber-500 bg-amber-500/10',
  info: 'border-cyan-500/30 text-cyan-500 bg-cyan-500/10'
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onDismiss }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[70] flex w-[320px] max-w-[calc(100vw-24px)] flex-col gap-2 font-mono pointer-events-none">
      {notifications.map(notification => {
        const Icon = iconByKind[notification.kind];
        return (
          <div
            key={notification.id}
            className={`pointer-events-auto border rounded px-3 py-2 shadow-lg backdrop-blur-sm ${classByKind[notification.kind]}`}
            role="status"
          >
            <div className="flex items-start gap-2">
              <Icon size={14} className="mt-0.5 shrink-0" />
              <div className="flex-1 text-[11px] leading-relaxed break-words">
                <div>{notification.message}</div>
                {notification.action && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      notification.action?.onClick();
                    }}
                    className="mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold border border-current opacity-90 hover:opacity-100 cursor-pointer inline-block"
                  >
                    {notification.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => onDismiss(notification.id)}
                className="shrink-0 opacity-70 hover:opacity-100"
                type="button"
                title="Dismiss notification"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
