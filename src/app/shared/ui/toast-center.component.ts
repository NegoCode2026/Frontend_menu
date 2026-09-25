import { Component, inject } from '@angular/core';
import { ToastService, ToastKind } from './toast.service';

const KIND_STYLE: Record<ToastKind, { dot: string; ring: string; icon: string }> = {
  success: { dot: 'bg-[#16A34A]', ring: 'ring-[#BFE6CC]', icon: '✓' },
  error: { dot: 'bg-red-500', ring: 'ring-red-200', icon: '!' },
  warning: { dot: 'bg-amber-500', ring: 'ring-amber-200', icon: '!' },
  info: { dot: 'bg-[#D97745]', ring: 'ring-[#EAC9A8]', icon: 'i' },
};

/**
 * Centro de avisos Tavita: abajo-derecha en desktop, sobre el tab-bar en móvil.
 * Limpio y serio: tarjeta blanca, punto de color, serif solo en el título.
 */
@Component({
  selector: 'app-toast-center',
  template: `
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-24 sm:items-end sm:px-6 sm:pb-6" aria-live="polite">
      @for (toast of toasts().toasts(); track toast.id) {
        <div
          class="anim-fade-in-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-stone-900/10 bg-white py-3 pl-3.5 pr-2.5 shadow-xl"
          role="status"
          (click)="toasts().dismiss(toast.id)"
        >
          <span
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ring-4 {{ meta(toast.kind).dot }} {{ meta(toast.kind).ring }}"
          >{{ meta(toast.kind).icon }}</span>
          <span class="min-w-0 flex-1 py-0.5">
            <span class="landing-serif block truncate text-[15px] font-bold text-[#1C1917]">{{ toast.title }}</span>
            @if (toast.message) {
              <span class="mt-0.5 block text-[13px] font-medium leading-snug text-stone-500">{{ toast.message }}</span>
            }
          </span>
          <button
            type="button"
            (click)="toasts().dismiss(toast.id); $event.stopPropagation()"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-stone-300 transition-colors hover:bg-stone-100 hover:text-stone-600"
            aria-label="Descartar aviso"
          >✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastCenterComponent {
  readonly toasts = inject(ToastService);

  meta(kind: ToastKind): { dot: string; ring: string; icon: string } {
    return KIND_STYLE[kind];
  }
}
