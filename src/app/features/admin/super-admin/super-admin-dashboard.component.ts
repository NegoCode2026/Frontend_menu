import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdminStats } from '../../../core/models/models';
import { SuperAdminMobileNavComponent } from './super-admin-mobile-nav.component';

type CatId = 'all' | 'rest' | 'active' | 'users' | 'plans' | 'dishes';

interface MetricCard {
  id: CatId;
  title: string;
  subtitle: string;
  value: number;
  badge: string;
  emoji: string;
  tint: string;
  link: string;
  icon: string;
  emptyMessage: string;
  emptyAction: string;
  tone: 'brand' | 'positive' | 'neutral';
}

@Component({
  selector: 'app-super-admin-dashboard',
  imports: [RouterLink, SuperAdminMobileNavComponent],
  templateUrl: './super-admin-dashboard.component.html',
})
export class SuperAdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly stats = signal<AdminStats | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly search = signal('');
  readonly activeCat = signal<CatId | 'all'>('all');

  readonly categories: { id: CatId | 'all'; label: string; emoji: string }[] = [
    { id: 'rest', label: 'Rest.', emoji: '🏢' },
    { id: 'users', label: 'Usuarios', emoji: '👥' },
    { id: 'all', label: 'All', emoji: '⊞' },
    { id: 'plans', label: 'Planes', emoji: '💳' },
    { id: 'dishes', label: 'Platos', emoji: '🍔' },
  ];

  readonly cards = computed<MetricCard[]>(() => {
    const s = this.stats();
    const total = s?.totalRestaurants ?? 0;
    const active = s?.activeRestaurants ?? 0;
    const pct = total > 0 ? Math.round((active / total) * 100) : 0;
    return [
      {
        id: 'rest',
        title: 'Restaurantes',
        subtitle: 'cuentas registradas',
        value: total,
        badge: 'TOTAL',
        emoji: '🏢',
        tint: 'bg-primary-50',
        link: '/admin/super-admin/restaurants',
        icon: 'M3 10l2-7h14l2 7M3 10a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M4 13v8h16v-8M9 21v-6h6v6M9 3v7M15 3v7',
        emptyMessage: 'No hay restaurantes registrados',
        emptyAction: 'Agregar restaurante',
        tone: 'brand',
      },
      {
        id: 'active',
        title: 'En Operación',
        subtitle: `de ${total} totales`,
        value: active,
        badge: `${pct}% ON`,
        emoji: '✅',
        tint: active > 0 ? 'bg-emerald-50' : 'bg-stone-100',
        link: '/admin/super-admin/restaurants',
        icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0M8 12l3 3 5-6',
        emptyMessage: 'No hay restaurantes activos',
        emptyAction: 'Revisar restaurantes',
        tone: active > 0 ? 'positive' : 'neutral',
      },
      {
        id: 'users',
        title: 'Usuarios',
        subtitle: 'todos los roles',
        value: s?.totalUsers ?? 0,
        badge: 'GLOBAL',
        emoji: '👥',
        tint: 'bg-stone-100',
        link: '/admin/super-admin/users',
        icon: 'M9 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-4M9 2h6v4H9zM15 11a3 3 0 11-6 0 3 3 0 016 0M7 19a5 5 0 0110 0',
        emptyMessage: 'No hay usuarios registrados',
        emptyAction: 'Gestionar usuarios',
        tone: 'neutral',
      },
      {
        id: 'plans',
        title: 'Suscripciones',
        subtitle: 'activas este ciclo',
        value: s?.activeSubscriptions ?? 0,
        badge: 'PLAN',
        emoji: '💳',
        tint: (s?.activeSubscriptions ?? 0) > 0 ? 'bg-emerald-50' : 'bg-stone-100',
        link: '/admin/super-admin/restaurants',
        icon: 'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM2 9h20M6 15h3M12 15h2',
        emptyMessage: 'No hay suscripciones activas',
        emptyAction: 'Revisar planes',
        tone: (s?.activeSubscriptions ?? 0) > 0 ? 'positive' : 'neutral',
      },
      {
        id: 'dishes',
        title: 'Productos',
        subtitle: 'en todos los menús',
        value: s?.totalProducts ?? 0,
        badge: 'MENÚ',
        emoji: '🍔',
        tint: 'bg-primary-50',
        link: '/admin/super-admin/restaurants',
        icon: 'M3 17a9 9 0 0118 0H3zM2 21h20M12 8V5M10 5h4',
        emptyMessage: 'No hay productos registrados',
        emptyAction: 'Ver restaurantes',
        tone: 'brand',
      },
    ];
  });

  readonly filteredCards = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.activeCat();
    return this.cards().filter((c) => {
      const matchesCat = cat === 'all' || c.id === cat || (cat === 'rest' && c.id === 'active');
      const matchesQ = !q || c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  });

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  setCat(id: CatId | 'all'): void {
    this.activeCat.set(id);
  }

  ngOnInit(): void {
    this.adminService.getStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(
          err.status === 401 || err.status === 403
            ? 'Tu sesión no tiene permisos de Super Admin. Vuelve a iniciar sesión con la cuenta correcta.'
            : 'No se pudieron cargar las métricas. Verifica tu conexión e inténtalo de nuevo.'
        );
      },
    });
  }

  retry(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.ngOnInit();
  }

  logout(): void {
    this.auth.forceLogout();
  }
}
