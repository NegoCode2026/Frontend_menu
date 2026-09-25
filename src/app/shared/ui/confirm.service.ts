import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true: botón de confirmación rojo (eliminar). false: oscuro Tavita. */
  danger?: boolean;
}

interface PendingConfirm extends Required<Pick<ConfirmOptions, 'title' | 'message'>> {
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (value: boolean) => void;
}

/**
 * Confirmación propia estilo Tavita (reemplaza confirm() del navegador).
 * Se renderiza en <app-confirm-dialog />, montado una vez en el admin-layout.
 *
 * Uso: if (!(await this.confirm.ask({ title, message, danger: true }))) return;
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<PendingConfirm | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.pending.set({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirmar',
        cancelLabel: options.cancelLabel ?? 'Cancelar',
        danger: options.danger ?? false,
        resolve,
      });
    });
  }

  answer(value: boolean): void {
    const current = this.pending();
    if (!current) return;
    this.pending.set(null);
    current.resolve(value);
  }
}
