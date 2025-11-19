import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfigService } from './config.service';

export interface OverlayState {
  members: { id: string; name: string; mute?: boolean; deaf?: boolean }[];
  tracked: { id?: string; name?: string; mute?: boolean; deaf?: boolean } | null;
  updatedAt?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private ws?: WebSocket;
  private reconnectTimer?: any;
  private readonly RECONNECT_MS = 3000;

  private _state$ = new BehaviorSubject<OverlayState | null>(null);
  readonly state$: Observable<OverlayState | null> = this._state$.asObservable();

  private _status$ = new BehaviorSubject<ConnectionStatus>('disconnected');
  readonly status$: Observable<ConnectionStatus> = this._status$.asObservable();

  private _lastError$ = new BehaviorSubject<string>('');
  readonly lastError$: Observable<string> = this._lastError$.asObservable();

  constructor(private cfg: ConfigService) {}

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const wsUrl = this.cfg.wsBaseUrl() + '/ws';
    this._status$.next('connecting');
    this._lastError$.next('');
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (_) {
      this._lastError$.next('Failed to create WebSocket connection.');
      this._status$.next('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._status$.next('connected');
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'snapshot' || msg?.type === 'voice_state_update') {
          const payload = msg.payload as OverlayState;
          this._state$.next(payload);
        }
      } catch (_) {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this._status$.next('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._lastError$.next('WebSocket error occurred.');
      this.ws?.close();
    };
  }

  reconnect() {
    this.disconnect();
    this.connect();
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = undefined;
    }
    this._status$.next('disconnected');
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.RECONNECT_MS);
  }
}
