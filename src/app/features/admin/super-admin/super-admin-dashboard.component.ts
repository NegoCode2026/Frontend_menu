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
        tint: 'bg-amber-50',
        link: '/admin/super-admin/restaurants',
      },
      {
        id: 'active',
        title: 'En Operación',
        subtitle: `de ${total} totales`,
        value: active,
        badge: `${pct}% ON`,
        emoji: '✅',
        tint: 'bg-emerald-50',
        link: '/admin/super-admin/restaurants',
      },
      {
        id: 'users',
        title: 'Usuarios',
        subtitle: 'todos los roles',
        value: s?.totalUsers ?? 0,
        badge: 'GLOBAL',
        emoji: '👥',
        tint: 'bg-blue-50',
        link: '/admin/super-admin/users',
      },
      {
        id: 'plans',
        title: 'Suscripciones',
        subtitle: 'activas este ciclo',
        value: s?.activeSubscriptions ?? 0,
        badge: 'PLAN',
        emoji: '💳',
        tint: 'bg-violet-50',
        link: '/admin/super-admin/restaurants',
      },
      {
        id: 'dishes',
        title: 'Productos',
        subtitle: 'en todos los menús',
        value: s?.totalProducts ?? 0,
        badge: 'MENÚ',
        emoji: '🍔',
        tint: 'bg-orange-50',
        link: '/admin/super-admin/restaurants',
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
