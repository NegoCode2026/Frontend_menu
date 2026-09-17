import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { MobileMenuService } from '../../../core/services/mobile-menu.service';
import { OrderService } from '../../../core/services/order.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { PwaBannerComponent } from '../../../shared/pwa-banner/pwa-banner.component';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PwaBannerComponent],
  templateUrl: './admin-layout.component.html',
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly menu = inject(MobileMenuService);
  private readonly orders = inject(OrderService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly subscriptionService = inject(SubscriptionService);
  readonly user = this.auth.user;
  /** Pedidos pendientes para el badge de navegación (solo vista de negocio). */
  readonly pendingOrders = signal(0);
  /** Restaurante y plan para la tarjeta de espacio de trabajo. */
  readonly restaurantName = signal<string | null>(null);
  readonly planName = signal<string | null>(null);

  readonly initials = computed(() => {
    const parts = (this.user()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  readonly roleLabel = computed(() => {
    const raw = this.user()?.role ?? '';
    const role = raw.startsWith('ROLE_') ? raw.substring(5) : raw;
    if (role === 'SUPER_ADMIN') return 'Super Admin';
    if (role === 'RESTAURANT_ADMIN') return 'Administrador';
    if (!role) return '';
    return 'Equipo';
  });
  // El drawer móvil lo controla el servicio: lo abre el botón "Más" del
  // bottom tab (las vistas Super Admin y negocio traen su propio header).
  readonly mobileMenuOpen = this.menu.mobileMenuOpen;

  readonly isSuperAdmin = computed(() => {
    const role = this.user()?.role ?? '';
    return (role.startsWith('ROLE_') ? role.substring(5) : role) === 'SUPER_ADMIN';
  });

  readonly isAdmin = computed(() => {
    const role = this.user()?.role ?? '';
    return (role.startsWith('ROLE_') ? role.substring(5) : role) === 'RESTAURANT_ADMIN';
  });

  readonly superNavItems = [
    { path: '/admin/super-admin/dashboard', label: 'Panel Super Admin', icon: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z' },
    { path: '/admin/super-admin/restaurants', label: 'Restaurantes', icon: 'M3 10V7l2-4h14l2 4v3M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 10V7l1-4m5 7V7l-1-4M3 7h18M4 13v8h16v-8M9 21v-6h6v6' },
    { path: '/admin/super-admin/users', label: 'Usuarios Globales', icon: 'M9 3h6v4H9V3Zm0 2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-6 6a4 4 0 0 1 8 0' },
  ];

  readonly allNavItems = [
    { path: '/admin/dashboard', label: 'Resumen', icon: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/orders', label: 'Pedidos', icon: 'M5 3h14v18l-2.3-1.5-2.3 1.5-2.4-1.5-2.4 1.5L7.3 19.5 5 21V3zM9 8h6M9 12h6', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/products', label: 'Menú', icon: 'M3 17a9 9 0 0 1 18 0H3zM2 21h20M12 8V5M10 5h4', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/categories', label: 'Categorías', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', roles: ['RESTAURANT_ADMIN', 'RESTAURANT_USER'] },
    { path: '/admin/qr', label: 'Código QR', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h4v4h-4zM18 18h3v3h-3z', roles: ['RESTAURANT_ADMIN'] },
    { path: '/admin/users', label: 'Equipo', icon: 'M9 3h6v4H9V3Zm0 2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-6 6a4 4 0 0 1 8 0', roles: ['RESTAURANT_ADMIN'] },
    { path: '/admin/settings', label: 'Configuración', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z', roles: ['RESTAURANT_ADMIN'] },
  ];

  ngOnInit(): void {
    // Vigía de sesión: si las cookies mueren, a /login.
    // Periódico + inmediato al volver a la pestaña.
    const checkSession = () => {
      this.auth.validateSession(true).subscribe({
        next: (ok) => {
          if (!ok) this.auth.redirectToLogin();
        },
        error: () => undefined,
      });
    };
    this.sessionWatch = window.setInterval(checkSession, 30000);
    window.addEventListener('focus', this.onWindowFocus);
    document.addEventListener('visibilitychange', this.onWindowFocus);
    if (this.isSuperAdmin()) return;
    this.orders.listMine('PENDING').subscribe({
      next: (orders) => this.pendingOrders.set(orders.length),
      error: () => undefined,
    });
    this.restaurantService.getMine().subscribe({
      next: (r) => this.restaurantName.set(r.name),
      error: () => undefined,
    });
    this.subscriptionService.getMine().subscribe({
      next: (s) => this.planName.set(s.plan.name),
      error: () => undefined,
    });
  }

  private sessionWatch: number | undefined;

  private readonly onWindowFocus = () => {
    if (document.visibilityState === 'hidden') return;
    this.auth.validateSession(true).subscribe({
      next: (ok) => {
        if (!ok) this.auth.redirectToLogin();
      },
      error: () => undefined,
    });
  };

  ngOnDestroy(): void {
    if (this.sessionWatch !== undefined) {
      window.clearInterval(this.sessionWatch);
    }
    window.removeEventListener('focus', this.onWindowFocus);
    document.removeEventListener('visibilitychange', this.onWindowFocus);
  }

  readonly navItems = computed(() => {
    const rawRole = this.user()?.role ?? '';
    const role = rawRole.startsWith('ROLE_') ? rawRole.substring(5) : rawRole;
    if (!role) return [];
    return this.allNavItems.filter((item) => item.roles.includes(role));
  });

  toggleMobileMenu(): void {
    this.menu.toggleMenu();
  }

  closeMobileMenu(): void {
    this.menu.closeMenu();
  }

  logout(): void {
    this.auth.forceLogout();
  }
}