import { Injectable, signal } from '@angular/core';

export type StaffNotifyKind = 'NEW' | 'READY' | 'DELIVERED' | 'PAID' | 'CANCELLED';

export interface StaffNotifyPrefs {
  newOrders: boolean;
  ready: boolean;
  served: boolean;
  paid: boolean;
  cancelled: boolean;
  /** Avisos del navegador (requiere permiso; suenan aunque la pestaña esté en fondo). */
  browser: boolean;
}

const DEFAULTS: StaffNotifyPrefs = {
  newOrders: true,
  ready: true,
  served: true,
  paid: true,
  cancelled: true,
  browser: false,
};

/**
 * Avisos del equipo por cambio de estado del pedido (opt-in por trabajador).
 * La preferencia vive en este dispositivo (localStorage por usuario): cada
 * quien elige qué le avisa sin afectar al resto. El transporte ya existe
 * (WebSocket + polling de Pedidos); este servicio solo decide y muestra.
 */
@Injectable({ providedIn: 'root' })
export class StaffNotifyService {
  readonly prefs = signal<StaffNotifyPrefs>({ ...DEFAULTS });
  private userId: number | null = null;

  /** Cargar la preferencia del trabajador en sesión (llamar una vez por vista). */
  init(userId: number | null | undefined): void {
    if (userId == null) return;
    if (this.userId === userId) return;
    this.userId = userId;
    try {
      const raw = localStorage.getItem(this.key(userId));
      this.prefs.set(raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS });
    } catch {
      this.prefs.set({ ...DEFAULTS });
    }
  }

  patch(update: Partial<StaffNotifyPrefs>): void {
    this.prefs.update((p) => {
      const next = { ...p, ...update };
      try {
        if (this.userId != null) localStorage.setItem(this.key(this.userId), JSON.stringify(next));
      } catch {
        // Sin almacenamiento: la preferencia vive solo en memoria
      }
      return next;
    });
  }

  wants(kind: StaffNotifyKind): boolean {
    const p = this.prefs();
    switch (kind) {
      case 'NEW':
        return p.newOrders;
      case 'READY':
        return p.ready;
      case 'DELIVERED':
        return p.served;
      case 'PAID':
        return p.paid;
      case 'CANCELLED':
        return p.cancelled;
    }
  }

  browserPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
    try {
      if (typeof Notification === 'undefined') return 'unsupported';
      return Notification.permission;
    } catch {
      return 'unsupported';
    }
  }

  /** Pide permiso al navegador y activa los avisos de fondo si lo concede. */
  async enableBrowser(): Promise<boolean> {
    try {
      if (typeof Notification === 'undefined') return false;
      const result = await Notification.requestPermission();
      const granted = result === 'granted';
      this.patch({ browser: granted });
      return granted;
    } catch {
      return false;
    }
  }

  /** Aviso del navegador: solo si el trabajador lo activó y la pestaña está en fondo. */
  pushBrowser(title: string, body: string): void {
    try {
      if (!this.prefs().browser) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!document.hidden) return;
      const notification = new Notification(title, { body, tag: `tavita-${Date.now()}` });
      notification.onclick = () => {
        try {
          window.focus();
          notification.close();
        } catch {
          // Ignorar errores de foco
        }
      };
    } catch {
      // Notificaciones no disponibles: el aviso dentro de la app ya cubre
    }
  }

  private key(userId: number): string {
    return `tavita_notify_prefs_${userId}`;
  }
}
