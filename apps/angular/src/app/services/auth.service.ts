import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly LS_TOKEN = 'overlay.auth.token';

  tokenSig = signal<string | null>(this.loadToken());

  private loadToken(): string | null {
    try {
      return localStorage.getItem(this.LS_TOKEN);
    } catch {
      return null;
    }
  }

  token(): string | null {
    return this.tokenSig();
  }

  setToken(t: string | null) {
    if (t) {
      localStorage.setItem(this.LS_TOKEN, t);
      this.tokenSig.set(t);
    } else {
      localStorage.removeItem(this.LS_TOKEN);
      this.tokenSig.set(null);
    }
  }

  isAuthenticated(): boolean {
    return !!this.tokenSig();
  }

  logout() {
    this.setToken(null);
  }
}
