import { Component, HostListener, inject } from '@angular/core';
import { ConfirmService } from './confirm.service';

/**
 * Diálogo de confirmación Tavita: tarjeta blanca centrada, título serif,
 * acción principal oscura (o roja para eliminar) y cerrar con Escape o fondo.
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    @if (confirm.pending(); as pending) {
      <div
        class="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm anim-fade-in"
        role="alertdialog"
        aria-modal="true"
        [attr.aria-label]="pending.title"
        (click)="confirm.answer(false)"
      >
        <div
          class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl anim-fade-in-scale"
          (click)="$event.stopPropagation()"
        >
          <span
            class="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black text-white"
            [class]="pending.danger ? 'bg-red-500' : 'bg-[#1C1917]'"
            aria-hidden="true"
          >{{ pending.danger ? '!' : '?' }}</span>
          <h3 class="landing-serif mt-4 text-[22px] font-medium leading-tight text-[#1C1917]">{{ pending.title }}</h3>
          <p class="mt-1.5 text-[13px] font-medium leading-relaxed text-stone-500">{{ pending.message }}</p>
          <div class="mt-5 flex gap-2">
            <button
              type="button"
              (click)="confirm.answer(false)"
              class="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
            >{{ pending.cancelLabel }}</button>
            <button
              type="button"
              (click)="confirm.answer(true)"
              class="flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white transition-colors"
              [class]="pending.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1C1917] hover:bg-stone-800'"
            >{{ pending.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  readonly confirm = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.confirm.pending()) this.confirm.answer(false);
  }
}
