import { ipcRenderer } from 'electron';
import { ExamAPI, ExamConfig } from './types';

// With contextIsolation: false, we can directly set window properties
(window as any).examAPI = {
  getConfig: (): Promise<ExamConfig> => ipcRenderer.invoke('get-config'),
  recordData: (data: { tabId?: number; message: string }): void => ipcRenderer.send('record-data', data),
  verifyAdminPassword: (password: string): void => ipcRenderer.send('verify-admin-password', password),
  
  onTimeUpdate: (callback: (remaining: number) => void): void => {
    ipcRenderer.on('time-update', (_event, remaining: number) => callback(remaining));
  },
  
  onShowWarning: (callback: (message: string) => void): void => {
    ipcRenderer.on('show-warning', (_event, message: string) => callback(message));
  },
  
  onSessionEnded: (callback: (reason: string) => void): void => {
    ipcRenderer.on('session-ended', (_event, reason: string) => callback(reason));
  },
  
  onRequestAdminPassword: (callback: () => void): void => {
    ipcRenderer.on('request-admin-password', () => callback());
  },
  
  onPasswordIncorrect: (callback: () => void): void => {
    ipcRenderer.on('password-incorrect', () => callback());
  }
} as ExamAPI;

// Get config synchronously
ipcRenderer.on('config-data', (_event, config: ExamConfig) => {
  console.log('Received config in preload:', config);
  (window as any).examConfig = config;
});
