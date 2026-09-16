import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PwaBannerComponent } from '../../../shared/pwa-banner/pwa-banner.component';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PwaBannerComponent],
  templateUrl: './admin-layout.component.html',
})
export class AdminLayoutComponent {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
  readonly mobileMenuOpen = signal(false);

  readonly isSuperAdmin = computed(() => {
    const role = this.user()?.role ?? '';
    return (role.startsWith('ROLE_') ? role.substring(5) : role) === 'SUPER_ADMIN';
  });

  readonly superNavItems = [
    { path: '/admin/super-admin/dashboard', label: 'Panel Super Admin', icon: '👑' },
    { path: '/admin/super-admin/restaurants', label: 'Restaurantes', icon: '🏢' },
    { path: '/admin/super-admin/users', label: 'Usuarios Globales', icon: '👥' },
  ];

  readonly allNavItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: '📊', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/orders', label: 'Pedidos', icon: '🛒', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/restaurant', label: 'Mi Restaurante', icon: '🏪', roles: ['RESTAURANT_ADMIN'] },
    { path: '/admin/categories', label: 'Categorías', icon: '🗂️', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/products', label: 'Productos', icon: '🍔', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/qr', label: 'Código QR', icon: '📱', roles: ['RESTAURANT_ADMIN'] },
    { path: '/admin/users', label: 'Usuarios', icon: '👥', roles: ['RESTAURANT_ADMIN'] },
    { path: '/admin/settings', label: 'Configuración', icon: '⚙️', roles: ['RESTAURANT_ADMIN'] },
  ];

  readonly navItems = computed(() => {
    const rawRole = this.user()?.role ?? '';
    const role = rawRole.startsWith('ROLE_') ? rawRole.substring(5) : rawRole;
    if (!role) return [];
    return this.allNavItems.filter((item) => item.roles.includes(role));
  });

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  logout(): void {
    this.auth.forceLogout();
  }
}