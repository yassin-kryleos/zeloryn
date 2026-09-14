import React from 'react';
import { NotificationCenter, type AppNotification, type NotificationKind } from './NotificationCenter';

export type { AppNotification, NotificationKind };

export interface ToastContainerProps {
  notifications: AppNotification[];
  onDismiss: (id: number) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ notifications, onDismiss }) => {
  return <NotificationCenter notifications={notifications} onDismiss={onDismiss} />;
};
