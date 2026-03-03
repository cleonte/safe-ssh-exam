export interface HostInfo {
  host: string;
  port: number;
  description: string;
}

export interface ExamConfig {
  devMode: boolean;
  allowedHosts: HostInfo[];
  sessionDuration: number;
  maxTabs: number;
  allowCopyPaste: boolean;
  recordSession: boolean;
  sessionRecordingPath: string;
  allowedCommands: string[];
  blockedCommands: string[];
  requirePassword: boolean;
  adminPassword: string;
  exitMessage: string;
  warnings: {
    '5min': boolean;
    '1min': boolean;
  };
}

export interface ConnectionInfo {
  hostIndex: number;
  username: string;
  password: string;
  hostInfo: HostInfo;
}

export interface Tab {
  id: number;
  terminal: any; // xterm Terminal type
  sshClient: any; // ssh2 Client type
  sshStream: any; // ssh2 Stream type
  fitAddon: any; // FitAddon type
  sessionBuffer: string;
  label: string;
  containerElement: HTMLElement;
}

export interface ExamAPI {
  getConfig: () => Promise<ExamConfig>;
  recordData: (data: { tabId?: number; message: string }) => void;
  verifyAdminPassword: (password: string) => void;
  onTimeUpdate: (callback: (remaining: number) => void) => void;
  onShowWarning: (callback: (message: string) => void) => void;
  onSessionEnded: (callback: (reason: string) => void) => void;
  onRequestAdminPassword: (callback: () => void) => void;
  onPasswordIncorrect: (callback: () => void) => void;
}

declare global {
  interface Window {
    examAPI: ExamAPI;
    examConfig?: ExamConfig;
  }
}
