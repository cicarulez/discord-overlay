import { Injectable } from '@angular/core';

// Gestisce la configurazione di collegamento al backend esterno.
// Default: http://localhost:5090
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly LS_KEY_HTTP = 'overlay.backend.httpBase';
  private readonly DEFAULT_HTTP = 'http://localhost:4200/api';
  private readonly LS_KEY_TRACKED = 'overlay.client.trackedMember';

  // Tipi per la preferenza di tracked member lato client
  // mode: 'id' | 'name'
  // value: valore corrispondente (id utente o nome visualizzato)
  // Manteniamo volutamente semplice e locale per dispositivo.
  getTrackedPref(): { mode: 'id' | 'name'; value: string } | null {
    try {
      const raw = localStorage.getItem(this.LS_KEY_TRACKED);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setTrackedPref(pref: { mode: 'id' | 'name'; value: string } | null): void {
    if (!pref) {
      localStorage.removeItem(this.LS_KEY_TRACKED);
      return;
    }
    localStorage.setItem(this.LS_KEY_TRACKED, JSON.stringify(pref));
  }

  httpBaseUrl(): string {
    const saved = localStorage.getItem(this.LS_KEY_HTTP);
    return saved || this.DEFAULT_HTTP;
  }

  setHttpBaseUrl(url: string) {
    localStorage.setItem(this.LS_KEY_HTTP, url);
  }

  wsBaseUrl(): string {
    const http = this.httpBaseUrl();
    try {
      const u = new URL(http);
      const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      // Preserve the pathname from the HTTP base (e.g., '/api') so WS is under the same prefix
      const pathname = (u.pathname && u.pathname !== '/') ? u.pathname.replace(/\/$/, '') : '';
      return `${wsProtocol}//${u.host}${pathname}`;
    } catch {
      // fallback
      // Fall back to dev server proxy path
      return 'ws://localhost:4200/api';
    }
  }
}
