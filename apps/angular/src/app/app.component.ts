import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api.service';
import { RealtimeService, ConnectionStatus } from './services/realtime.service';
import { ConfigService } from './services/config.service';
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
  // members: lista mostrata in UI (eventualmente filtrata per escludere il tracked)
  members: { id: string; name: string; mute?: boolean; deaf?: boolean }[] = [];
  // membersAll: lista completa proveniente dal backend
  private membersAll: { id: string; name: string; mute?: boolean; deaf?: boolean }[] = [];
  tracked: { id?: string; name?: string; mute?: boolean; deaf?: boolean } | null = null;
  lastUpdated: string | null = null;

  // Settings form
  backendHttpBase = '';
  settingsError = '';

  // Connection state
  connectionStatus: ConnectionStatus = 'connecting';
  lastErrorMsg: string = '';
  httpFailed = false;

  private sub?: Subscription;

  constructor(
    private api: ApiService,
    private rt: RealtimeService,
    public config: ConfigService
  ) {}

  ngOnInit(): void {
    // Initialize settings
    this.backendHttpBase = this.config.httpBaseUrl();

    // Subscribe to realtime updates
    this.sub = this.rt.state$.subscribe((s) => {
      if (!s) return;
      // Aggiorna lo stato locale dal backend (ignoriamo l'eventuale tracked lato server)
      this.membersAll = s.members || [];
      this.recomputeTrackedAndFilter();
      this.lastUpdated = s.updatedAt || null;
    });

    // Track connection status and errors
    this.rt.status$.subscribe((st) => {
      this.connectionStatus = st || 'disconnected';
      // Se la WS è connessa, consideriamo risolto l'eventuale errore HTTP iniziale
      if (st === 'connected') {
        this.httpFailed = false;
      }
    });
    this.rt.lastError$.subscribe((msg) => {
      this.lastErrorMsg = msg || '';
    });

    // Ensure connection
    this.rt.connect();

    // Fallback: load snapshot once at start
    this.api.getSnapshot().subscribe({
      next: (snap) => {
        if (!snap?.data) return;
        // Ignora `tracked` lato server; calcola localmente dal preferito salvato
        this.membersAll = snap.data.members || [];
        this.recomputeTrackedAndFilter();
        this.lastUpdated = snap.data.updatedAt || null;
        // Snapshot riuscito: azzera flag errore HTTP
        this.httpFailed = false;
      },
      error: () => {
        this.httpFailed = true;
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
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
      this.httpFailed = false; // pulisci eventuale errore precedente
      this.rt.reconnect();
      this.showSettings.set(false);
    } catch (e: any) {
      this.settingsError = e?.message || 'Validation error.';
    }
  }

  retryConnect() {
    this.httpFailed = false; // rimuovi banner finché riprova
    this.rt.reconnect();
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
