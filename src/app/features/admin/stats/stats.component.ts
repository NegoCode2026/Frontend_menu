import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { OrderService } from '../../../core/services/order.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { Order } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

interface DayBucket {
  key: string;
  label: string;
  revenue: number;
  count: number;
}

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

@Component({
  selector: 'app-stats',
  imports: [BusinessMobileNavComponent],
  templateUrl: './stats.component.html',
})
export class StatsComponent implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly rangeDays = signal<7 | 30>(7);
  readonly menuSlug = signal<string | null>(null);
  readonly isOpen = signal(true);

  private safeTime(value: string | null | undefined): number {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  readonly rangedOrders = computed(() => {
    const days = this.rangeDays();
    const since = Date.now() - days * 86400000;
    return this.orders().filter((o) => o && this.safeTime(o.createdAt) >= since);
  });

  readonly validOrders = computed(() => this.rangedOrders().filter((o) => o.status !== 'CANCELLED'));

  readonly revenue = computed(() => this.validOrders().reduce((s, o) => s + (o.totalAmount || 0), 0));

  readonly ticketAvg = computed(() => {
    const n = this.validOrders().length;
    return n > 0 ? this.revenue() / n : 0;
  });

  readonly itemsSold = computed(() =>
    this.validOrders().reduce((s, o) => s + (o.items ?? []).reduce((a, i) => a + (i.quantity || 0), 0), 0)
  );

  readonly daily = computed<DayBucket[]>(() => {
    const days = this.rangeDays();
    const buckets: DayBucket[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const label = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(d);
      buckets.push({ key, label, revenue: 0, count: 0 });
    }
    for (const o of this.validOrders()) {
      const t = this.safeTime(o.createdAt);
      if (!t) continue;
      const d = new Date(t);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const b = buckets.find((x) => x.key === key);
      if (b) {
        b.revenue += o.totalAmount || 0;
        b.count += 1;
      }
    }
    return buckets;
  });

  readonly maxRevenue = computed(() => Math.max(1, ...this.daily().map((d) => d.revenue)));

  readonly topProducts = computed<TopProduct[]>(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    for (const o of this.validOrders()) {
      for (const item of o.items ?? []) {
        const name = item.productName || 'Sin nombre';
        const entry = map.get(name) ?? { qty: 0, revenue: 0 };
        entry.qty += item.quantity || 0;
        entry.revenue += item.subtotal ?? (item.unitPrice || 0) * (item.quantity || 0);
        map.set(name, entry);
      }
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  });

  ngOnInit(): void {
    this.orderService.listMine().subscribe({
      next: (orders) => {
        this.orders.set(Array.isArray(orders) ? orders.filter((o) => !!o) : []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.restaurantService.getMine().subscribe({
      next: (r) => {
        this.menuSlug.set(r.slug);
        this.isOpen.set(r.open);
      },
      error: () => undefined,
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value || 0);
  }

  barHeight(revenue: number): number {
    if (!(revenue > 0)) return 2;
    return Math.max(4, (revenue / this.maxRevenue()) * 100);
  }

  logout(): void {
    this.auth.forceLogout();
  }
}
