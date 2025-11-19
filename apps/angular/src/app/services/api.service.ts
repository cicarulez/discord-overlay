import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';

export interface SnapshotResponse {
  ok: boolean;
  data?: {
    members: { id: string; name: string; mute?: boolean; deaf?: boolean }[];
    tracked: { id?: string; name?: string; mute?: boolean; deaf?: boolean } | null;
    updatedAt?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient, private cfg: ConfigService) {}

  getSnapshot(): Observable<SnapshotResponse> {
    const base = this.cfg.httpBaseUrl().replace(/\/$/, '');
    return this.http.get<SnapshotResponse>(`${base}/snapshot`);
  }
}
