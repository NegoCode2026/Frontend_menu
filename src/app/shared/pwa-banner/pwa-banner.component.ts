import { Component, computed, inject, signal } from '@angular/core';
import { PwaService } from '../../core/services/pwa.service';

@Component({
  selector: 'app-pwa-banner',
  standalone: true,
  template: `
    <!-- Offline indicator -->
    @if (!pwa.isOnline()) {
      <div class="fixed bottom-4 left-4 z-50 bg-red-600 text-white text-xs font-bold px-3.5 py-2 rounded-full shadow-lg flex items-center gap-1.5 anim-fade-in-up select-none">
        <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
        Sin conexión
      </div>
    }

    <!-- Update available -->
    @if (pwa.updateAvailable()) {
      <div class="fixed top-4 right-4 z-50 max-w-xs sm:w-auto bg-stone-900 text-white rounded-2xl shadow-2xl border border-stone-800 p-3 flex items-center gap-3 anim-fade-in-up select-none">
        <div class="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-lg shrink-0">🔄</div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold">Nueva versión disponible</p>
          <p class="text-[11px] text-stone-300 mt-0.5 leading-snug">Recarga para usar la última versión.</p>
        </div>
        <button
          (click)="pwa.reload()"
          class="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 shadow-sm shrink-0 transition-colors"
        >
          Actualizar
        </button>
      </div>
    }

    <!-- Install prompt -->
    @if (showInstall()) {
      <div class="fixed top-4 right-4 z-50 max-w-xs sm:w-auto bg-white rounded-2xl shadow-2xl border border-stone-200 p-3 flex items-center gap-3 anim-fade-in-up select-none">
        <img
          src="assets/tavita-icon.svg"
          alt="Tavita"
          class="w-10 h-10 rounded-xl shrink-0 object-contain bg-primary-50 p-1"
        />
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-stone-900">Agregar a pantalla de inicio</p>
          <p class="text-[11px] text-stone-500 mt-0.5 leading-snug">Accede rápido sin abrir el navegador.</p>
        </div>
        <button
          (click)="pwa.install()"
          class="px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-bold hover:bg-primary-700 shadow-sm shrink-0 transition-colors"
        >
          Instalar
        </button>
        <button
          (click)="dismissInstall()"
          class="w-6 h-6 rounded-full bg-stone-100 text-stone-500 hover:text-stone-800 text-xs flex items-center justify-center shrink-0 transition-colors"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
    }
  `,
})
export class PwaBannerComponent {
  readonly pwa = inject(PwaService);
  readonly dismissed = signal(
    typeof localStorage !== 'undefined' &&
      localStorage.getItem('tavita_pwa_install_dismissed') === '1',
  );

  readonly showInstall = computed(
    () => this.pwa.canInstall() && !this.pwa.isInstalled() && !this.dismissed(),
  );

  dismissInstall(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem('tavita_pwa_install_dismissed', '1');
    } catch {}
  }
}
