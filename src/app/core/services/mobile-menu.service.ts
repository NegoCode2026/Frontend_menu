import { Injectable, signal } from '@angular/core';

/**
 * Estado compartido del drawer lateral en móvil.
 * El layout lo lee; el bottom tab de negocios lo abre con el botón "Más".
 */
@Injectable({ providedIn: 'root' })
export class MobileMenuService {
  readonly mobileMenuOpen = signal(false);

  openMenu(): void {
    this.mobileMenuOpen.set(true);
  }

  closeMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }
}
