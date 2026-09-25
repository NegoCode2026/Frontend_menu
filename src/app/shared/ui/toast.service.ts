import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string | null;
}

/**
 * Avisos propios de Tavita (reemplazan alert()/confirm() del navegador).
 * Se renderizan en <app-toast-center />, montado una vez en el admin-layout.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly toasts = signal<Toast[]>([]);

  show(kind: ToastKind, title: string, message?: string | null, durationMs = 4_500): number {
    const id = this.nextId++;
    this.toasts.update((list) => [...list.slice(-3), { id, kind, title, message }]);
    if (durationMs > 0) {
      const timer = setTimeout(() => this.dismiss(id), durationMs);
      this.timers.set(id, timer);
    }
    return id;
  }

  success(title: string, message?: string | null): number {
    return this.show('success', title, message);
  }

  error(title: string, message?: string | null, durationMs = 6_000): number {
    return this.show('error', title, message, durationMs);
  }

  info(title: string, message?: string | null): number {
    return this.show('info', title, message);
  }

  warning(title: string, message?: string | null): number {
    return this.show('warning', title, message);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
