import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { TenantBackendService } from './tenant-backend.service';
import { OrderEvent } from '../models/models';

/**
 * Pedidos en tiempo real para meseros/caja (STOMP mínimo sobre
 * WebSocket nativo, sin dependencias extra).
 *
 * - URL: misma base que ApiService pero ws(s) + /ws.
 * - El handshake lleva las cookies HttpOnly (SameSite=None en prod),
 *   el backend autentica igual que un GET normal.
 * - Tópico: /topic/r/{restaurantId}/orders (el backend solo deja
 *   escuchar el tenant propio).
 * - Reconexión con backoff; `connected` expone el estado para la UI.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket: WebSocket | null = null;
  private readonly events$ = new Subject<OrderEvent>();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectDelay = 3000;
  private wantedRid: number | null = null;
  private buffer = '';

  readonly connected = signal(false);

  constructor(
    private auth: AuthService,
    private tenants: TenantBackendService,
  ) {}

  /** Suscribe a los eventos del restaurante actual. Llamar una vez por vista. */
  connect(): Observable<OrderEvent> {
    const rid = this.auth.user()?.restaurantId ?? null;
    if (rid == null) throw new Error('Sin restaurante en sesión');
    if (this.socket && this.wantedRid === rid) return this.events$.asObservable();
    this.disconnect();
    this.wantedRid = rid;
    this.open(rid);
    return this.events$.asObservable();
  }

  disconnect(): void {
    this.wantedRid = null;
    this.reconnectDelay = 3000;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    try {
      this.socket?.close();
    } catch {}
    this.socket = null;
    this.buffer = '';
    this.connected.set(false);
  }

  private wsUrl(): string {
    const base = this.tenants.apiBase();
    if (/^https?:\/\//.test(base)) {
      return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    }
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws`;
  }

  private open(rid: number): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.wsUrl(), ['v12.stomp', 'v11.stomp']);
    } catch {
      this.scheduleReconnect(rid);
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelay = 3000;
      socket.send('CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0');
    };

    socket.onmessage = (ev) => {
      const frames = this.extractFrames(String(ev.data ?? ''));
      for (const frame of frames) this.handleFrame(frame, rid);
    };

    socket.onclose = () => {
      this.connected.set(false);
      if (this.wantedRid === rid) this.scheduleReconnect(rid);
    };

    socket.onerror = () => {
      try {
        socket.close();
      } catch {}
    };
  }

  private scheduleReconnect(rid: number): void {
    if (this.wantedRid !== rid) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(this.reconnectDelay, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      if (this.wantedRid === rid) this.open(rid);
    }, delay);
  }

  /** STOMP sobre TCP: un onmessage puede traer 0, 1 o varios frames. */
  private extractFrames(chunk: string): string[] {
    this.buffer += chunk;
    const frames: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\0')) !== -1) {
      frames.push(this.buffer.slice(0, idx));
      this.buffer = this.buffer.slice(idx + 1).replace(/^\n+/, '');
    }
    // Evita que un handshake parcial crezca sin límite
    if (this.buffer.length > 65536) this.buffer = '';
    return frames;
  }

  private handleFrame(frame: string, rid: number): void {
    const command = frame.split('\n', 1)[0]?.trim();
    if (command === 'CONNECTED') {
      this.connected.set(true);
      this.socket?.send(`SUBSCRIBE\nid:sub-0\ndestination:/topic/r/${rid}/orders\nack:auto\n\n\0`);
      return;
    }
    if (command === 'MESSAGE') {
      const bodyIdx = frame.indexOf('\n\n');
      if (bodyIdx === -1) return;
      try {
        const event = JSON.parse(frame.slice(bodyIdx + 2).replace(/\0/g, '')) as OrderEvent;
        if (event && event.order) this.events$.next(event);
      } catch {}
      return;
    }
    if (command === 'ERROR') {
      this.connected.set(false);
    }
  }
}
