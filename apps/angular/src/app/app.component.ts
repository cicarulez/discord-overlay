import { Component, OnDestroy, OnInit, signal, effect, EffectRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api.service';
import { RealtimeService, ConnectionStatus } from './services/realtime.service';
import { ConfigService } from './services/config.service';
import { AuthService } from './services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  // UI state
  minimized = signal(false);
  showHelp = signal(false);
  showSettings = signal(false);
  showMembers = signal(true);
  // members: list displayed in the UI (optionally filtered to exclude the tracked user)
  members: { id: string; name: string; mute?: boolean; deaf?: boolean }[] = [];
  // membersAll: full list coming from the backend
  private membersAll: { id: string; name: string; mute?: boolean; deaf?: boolean }[] = [];
  tracked: { id?: string; name?: string; mute?: boolean; deaf?: boolean } | null = null;
  lastUpdated: string | null = null;

  // Settings form
  backendHttpBase = '';
  settingsError = '';

  // Auth form
  loginUsername = '';
  loginPassword = '';
  loginError = '';

  // Connection state
  connectionStatus: ConnectionStatus = 'connecting';
  lastErrorMsg: string = '';
  httpFailed = false;

  private sub?: Subscription;
  private tokenEff?: EffectRef;

  constructor(
    private api: ApiService,
    private rt: RealtimeService,
    public config: ConfigService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    // Initialize settings
    this.backendHttpBase = this.config.httpBaseUrl();

    // Subscribe to realtime updates
    this.sub = this.rt.state$.subscribe((s) => {
      if (!s) return;
      // Update local state from backend (ignore any server-side tracked user)
      this.membersAll = s.members || [];
      this.recomputeTrackedAndFilter();
      this.lastUpdated = s.updatedAt || null;
    });

    // Track connection status and errors
    this.rt.status$.subscribe((st) => {
      this.connectionStatus = st || 'disconnected';
      // If the WS is connected, consider the initial HTTP error resolved
      if (st === 'connected') {
        this.httpFailed = false;
      }
    });
    this.rt.lastError$.subscribe((msg) => {
      this.lastErrorMsg = msg || '';
    });

    // React to token changes: connect/disconnect
    this.tokenEff = effect(() => {
      const t = this.auth.tokenSig();
      if (t) {
        this.connectAndLoad();
      } else {
        this.rt.disconnect();
      }
    });

    // If already authenticated, connect immediately
    if (this.auth.isAuthenticated()) {
      this.connectAndLoad();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    try { this.tokenEff?.destroy(); } catch {}
    this.rt.disconnect();
  }

  toggleMinimize() {
    this.minimized.update((v) => !v);
  }

  toggleMembers() {
    this.showMembers.update((v) => !v);
  }

  openHelp() { this.showHelp.set(true); }
  closeHelp() { this.showHelp.set(false); }

  openSettings() {
    this.settingsError = '';
    this.backendHttpBase = this.config.httpBaseUrl();
    this.showSettings.set(true);
  }
  closeSettings() { this.showSettings.set(false); }

  saveSettings() {
    this.settingsError = '';
    const url = (this.backendHttpBase || '').trim();
    try {
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('Enter a valid URL starting with http:// or https://');
      }
      this.config.setHttpBaseUrl(url);
      // Reconnect WS with new URL
      this.httpFailed = false; // clear any previous error
      this.rt.reconnect();
      this.showSettings.set(false);
    } catch (e: any) {
      this.settingsError = e?.message || 'Validation error.';
    }
  }

  retryConnect() {
    this.httpFailed = false; // remove banner while retrying
    this.rt.reconnect();
  }

  private connectAndLoad() {
    this.rt.connect();
    // Fallback: load snapshot once at start
    this.api.getSnapshot().subscribe({
      next: (snap) => {
        if (!snap?.data) return;
        this.membersAll = snap.data.members || [];
        this.recomputeTrackedAndFilter();
        this.lastUpdated = snap.data.updatedAt || null;
        this.httpFailed = false;
      },
      error: () => {
        this.httpFailed = true;
      }
    });
  }

  // ---------- Auth ----------
  doLogin() {
    this.loginError = '';
    const u = (this.loginUsername || '').trim();
    const p = this.loginPassword || '';
    if (!u || !p) {
      this.loginError = 'Enter username and password';
      return;
    }
    this.api.loginBasic(u, p).subscribe({
      next: (res) => {
        if (res?.ok && res.token) {
          this.auth.setToken(res.token);
          this.loginPassword = '';
          // connectAndLoad will be called by the token listener
        } else {
          this.loginError = 'Invalid credentials';
        }
      },
      error: () => {
        this.loginError = 'Login failed';
        }
      });
    }

  logout() {
    this.auth.logout();
    this.members = [];
    this.tracked = null;
    this.lastUpdated = null;
  }

  // ---------- Client-side tracked selection ----------
  private selectTracked(
    members: { id: string; name: string; mute?: boolean; deaf?: boolean }[],
    pref: { mode: 'id' | 'name'; value: string } | null
  ) {
    if (!pref) return null;
    if (pref.mode === 'id') return members.find(m => m.id === pref.value) || null;
    if (pref.mode === 'name') return members.find(m => m.name === pref.value) || null;
    return null;
  }

  private recomputeTrackedAndFilter() {
    const pref = this.config.getTrackedPref();
    const t = this.selectTracked(this.membersAll, pref);
    this.tracked = t;
    if (t?.id) {
      this.members = this.membersAll.filter(m => m.id !== t.id);
    } else {
      this.members = this.membersAll.slice();
    }
  }

  setTracked(m: { id: string; name: string }) {
    this.config.setTrackedPref({ mode: 'id', value: m.id });
    this.recomputeTrackedAndFilter();
  }

  clearTracked() {
    this.config.setTrackedPref(null);
    this.recomputeTrackedAndFilter();
  }
}
