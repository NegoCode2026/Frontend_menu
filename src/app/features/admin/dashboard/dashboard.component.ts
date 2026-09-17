import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { OrderService } from '../../../core/services/order.service';
import { AuthService } from '../../../core/services/auth.service';
import { ORDER_STATUS_LABELS, Order } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

const ACTIVE_ORDER_STATUS: Order['status'][] = ['PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY'];

export interface MesaActiva {
  label: string;
  orders: number;
  urgent: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, BusinessMobileNavComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly restaurantService = inject(RestaurantService);
  private readonly categoryService = inject(CategoryService);
  private readonly productService = inject(ProductService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly restaurantName = signal<string | null>(null);
  readonly isOpen = signal(true);
  readonly menuSlug = signal<string | null>(null);
  readonly categoryCount = signal(0);
  readonly productCount = signal(0);
  readonly availableCount = signal(0);
  readonly latestProduct = signal<{ name: string; price: number; available: boolean } | null>(null);
  readonly allOrders = signal<Order[]>([]);
  readonly planName = signal<string | null>(null);
  readonly planStartsAt = signal<string | null>(null);
  readonly planEndsAt = signal<string | null>(null);
  readonly planStatus = signal<string | null>(null);
  readonly loading = signal(true);
  /** QR real del menú público, generado con la misma librería del estudio QR. */
  readonly qrDataUrl = signal<string | null>(null);

  /** Tiempo restante de la suscripción: texto legible (días o fecha de vencimiento). */
  readonly planRemaining = computed(() => {
    const status = this.planStatus();
    if (!status) return null;
    if (status !== 'ACTIVE') {
      return status === 'CANCELED' || status === 'PENDING_CANCEL' ? 'Cancelado' : 'Sin plan activo';
    }
    const endsAt = this.planEndsAt();
    if (!endsAt) return null;
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms < 0) return 'Vencido';
    const days = Math.ceil(ms / 86400000);
    if (days <= 1) return 'Vence hoy';
    if (days <= 30) return `Quedan ${days} días`;
    const date = new Date(endsAt);
    return `Vence el ${date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  });

  private readonly router = inject(Router);

  /** Progreso honesto del ciclo: fracción restante entre startsAt y endsAt reales. */
  readonly planProgress = computed<{ pct: number; days: number } | null>(() => {
    if (this.planStatus() !== 'ACTIVE') return null;
    const start = this.planStartsAt();
    const end = this.planEndsAt();
    if (!start || !end) return null;
    const total = new Date(end).getTime() - new Date(start).getTime();
    if (!(total > 0)) return null;
    const left = new Date(end).getTime() - Date.now();
    return {
      pct: Math.min(100, Math.max(0, Math.round((left / total) * 100))),
      days: Math.max(0, Math.ceil(left / 86400000)),
    };
  });

  /** El plan requiere atención cuando le quedan 7 días o menos. */
  readonly planAttention = computed(() => {
    const p = this.planProgress();
    return this.planStatus() === 'ACTIVE' && !!p && p.days <= 7;
  });

  readonly isAdmin = computed(() => {
    const raw = this.user()?.role ?? '';
    return (raw.startsWith('ROLE_') ? raw.substring(5) : raw) === 'RESTAURANT_ADMIN';
  });

  /** Pedidos no finalizados, los más antiguos primero (cola de cocina). */
  readonly activeOrders = computed(() =>
    this.allOrders()
      .filter((o) => o && ACTIVE_ORDER_STATUS.includes(o.status))
      .sort((a, b) => this.safeTime(a.createdAt) - this.safeTime(b.createdAt))
  );

  readonly pendingCount = computed(() => this.activeOrders().filter((o) => o.status === 'PENDING').length);

  /** Últimos pedidos para actividad reciente. */
  readonly recentOrders = computed(() =>
    [...this.allOrders()]
      .filter((o) => !!o)
      .sort((a, b) => this.safeTime(b.createdAt) - this.safeTime(a.createdAt))
      .slice(0, 3)
  );

  /** Pedidos creados en los últimos 7 días. */
  readonly weekOrders = computed(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return this.allOrders().filter((o) => o && this.safeTime(o.createdAt) >= weekAgo).length;
  });

  /** Mesas con pedidos activos (único dato real de ocupación disponible). */
  readonly activeTables = computed<MesaActiva[]>(() => {
    const map = new Map<string, { orders: number; urgent: boolean }>();
    for (const o of this.activeOrders()) {
      const label = (o.tableNumber ?? '').trim();
      if (!label) continue;
      const entry = map.get(label) ?? { orders: 0, urgent: false };
      entry.orders += 1;
      if (o.status === 'PENDING') entry.urgent = true;
      map.set(label, entry);
    }
    return [...map.entries()].map(([label, v]) => ({ label, ...v }));
  });

  /** Saludo según la hora + primer nombre real. */
  readonly greetingPrefix = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  });

  readonly firstName = computed(() => (this.user()?.name ?? '').trim().split(/\s+/)[0] ?? '');

  /** % de la carta disponible. */
  readonly cartaPct = computed(() => {
    const total = this.productCount();
    return total > 0 ? Math.round((this.availableCount() / total) * 100) : 0;
  });

  /** Línea de fecha viva: "VIERNES, 24 MAYO · 20:42". */
  readonly todayLine = computed(() => {
    const now = new Date();
    const date = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(now);
    return `${date} · ${time}`.toUpperCase();
  });

  statusLabel(status: Order['status']): string {
    return ORDER_STATUS_LABELS[status] ?? status;
  }

  private safeTime(value: string | null | undefined): number {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  elapsedMin(createdAt: string | null | undefined): string {
    const t = this.safeTime(createdAt);
    if (!t) return '—';
    return `${Math.max(0, Math.floor((Date.now() - t) / 60000))} min`;
  }

  orderTime(createdAt: string | null | undefined): string {
    const t = this.safeTime(createdAt);
    if (!t) return '—';
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(t));
  }

  itemsSummary(order: Order): string {
    const items = order.items ?? [];
    if (items.length === 0) return 'Sin detalle';
    return items
      .slice(0, 2)
      .map((i) => `${i.quantity}x ${i.productName}`)
      .join(' · ');
  }

  formatPrice(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
  }

  logout(): void {
    this.auth.forceLogout();
  }

  ngOnInit(): void {
    if (this.user()?.role === 'SUPER_ADMIN') {
      this.router.navigate(['/admin/super-admin/dashboard']);
      return;
    }

    this.restaurantService.getMine().subscribe({
      next: (r) => {
        this.restaurantName.set(r.name);
        this.isOpen.set(r.open);
        this.menuSlug.set(r.slug);
        this.buildMenuQr(r.slug);
      },
      error: () => undefined,
    });

    this.categoryService.list(0, 100).subscribe({
      next: (categories) => this.categoryCount.set(categories?.totalElements ?? 0),
      error: () => undefined,
    });

    this.productService.list(undefined, 0, 100).subscribe({
      next: (products) => {
        const content = products?.content ?? [];
        this.productCount.set(products?.totalElements ?? 0);
        this.availableCount.set(content.filter((p) => p.available).length);
        const latest = content[0];
        this.latestProduct.set(
          latest ? { name: latest.name, price: latest.price, available: latest.available } : null
        );
      },
      error: () => undefined,
    });

    this.orderService.listMine().subscribe({
      next: (orders) => this.allOrders.set(Array.isArray(orders) ? orders : []),
      error: () => undefined,
    });

    this.subscriptionService.getMine().subscribe({
      next: (s) => {
        this.planName.set(s.plan.name);
        this.planStartsAt.set(s.startsAt);
        this.planEndsAt.set(s.endsAt);
        this.planStatus.set(s.status);
      },
      error: () => undefined,
      complete: () => this.loading.set(false),
    });
  }

  private buildMenuQr(slug: string): void {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/menu/${slug}`;
    QRCode.toDataURL(url, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1c1917', light: '#ffffff' },
    })
      .then((dataUrl) => this.qrDataUrl.set(dataUrl))
      .catch(() => undefined);
  }
}