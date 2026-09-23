import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { MobileMenuService } from '../../../core/services/mobile-menu.service';

/**
 * Bottom tab flotante negro estilo food-app para las vistas de negocio
 * (tenant) en móvil: Inicio, Pedidos, Productos, QR/Categorías y Más.
 * El 4.º tab es QR para RESTAURANT_ADMIN y Categorías para
 * RESTAURANT_USER (que no tiene acceso a QR). "Más" abre el drawer
 * lateral con el resto de secciones. Solo visual en móvil (lg:hidden).
 */
@Component({
  selector: 'app-business-mobile-nav',
  imports: [RouterLink],
  template: `
    <div
      class="fixed bottom-0 left-1/2 z-[60] w-full max-w-[430px] -translate-x-1/2 px-4 lg:hidden"
      style="padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));"
    >
      <nav class="flex items-center justify-between rounded-full bg-[#101014] px-5 py-3 shadow-[0_20px_45px_rgba(0,0,0,0.4)]">
        <a
          routerLink="/admin/dashboard"
          aria-label="Inicio"
          class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'home' ? 'bg-[#ff5c00] text-white' : 'text-[#9a9aa0]' }}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-[22px] w-[22px]"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"/><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z"/></svg>
        </a>
        <a
          routerLink="/admin/orders"
          aria-label="Pedidos"
          class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'orders' ? 'bg-[#ff5c00] text-white' : 'text-[#9a9aa0]' }}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-[22px] w-[22px]"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>
        </a>
        <a
          routerLink="/admin/products"
          aria-label="Productos"
          class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'products' ? 'bg-[#ff5c00] text-white' : 'text-[#9a9aa0]' }}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-[22px] w-[22px]"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z"/></svg>
        </a>
        @if (isAdmin()) {
          <a
            routerLink="/admin/qr"
            aria-label="Código QR"
            class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'qr' ? 'bg-[#ff5c00] text-white' : 'text-[#9a9aa0]' }}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-[22px] w-[22px]"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375V4.875zm9.75 0c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125V4.875zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zm9.75 0c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z"/></svg>
          </a>
        } @else {
          <a
            routerLink="/admin/tables"
            aria-label="Mesas"
            class="flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition {{ active() === 'none' ? 'text-[#9a9aa0]' : 'text-[#9a9aa0]' }}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-[22px] w-[22px]"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18v13H3zM3 10h18M9 10v9M15 10v9"/></svg>
          </a>
        }
        <button
          (click)="openMore()"
          aria-label="Más secciones"
          class="flex h-11 w-11 items-center justify-center rounded-full text-[#9a9aa0] active:scale-90 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="h-[22px] w-[22px]"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
        </button>
      </nav>
    </div>
  `,
})
export class BusinessMobileNavComponent {
  private readonly auth = inject(AuthService);
  private readonly menu = inject(MobileMenuService);

  readonly active = input<'home' | 'orders' | 'products' | 'qr' | 'none'>('none');

  readonly isAdmin = computed(() => {
    const raw = this.auth.user()?.role ?? '';
    const role = raw.startsWith('ROLE_') ? raw.substring(5) : raw;
    return role === 'RESTAURANT_ADMIN';
  });

  openMore(): void {
    this.menu.openMenu();
  }
}
