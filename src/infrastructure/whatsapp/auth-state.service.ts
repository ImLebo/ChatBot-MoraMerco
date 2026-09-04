import { useMultiFileAuthState, AuthenticationState } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

export interface AuthStateResult {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

export class AuthStateService {
  constructor(private readonly sessionDirectory: string) {}

  public async getAuthState(): Promise<AuthStateResult> {
    if (!fs.existsSync(this.sessionDirectory)) {
      fs.mkdirSync(this.sessionDirectory, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDirectory);
    return { state, saveCreds };
  }

  public async clearSession(): Promise<void> {
    if (fs.existsSync(this.sessionDirectory)) {
      fs.rmSync(this.sessionDirectory, { recursive: true, force: true });
    }
  }
}
