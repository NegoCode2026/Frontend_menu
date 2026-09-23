import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportsService, ProfitPeriod } from '../../../core/services/reports.service';
import { OrderService } from '../../../core/services/order.service';
import { AuthService } from '../../../core/services/auth.service';
import { ProfitsResponse } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

@Component({
  selector: 'app-profits',
  imports: [FormsModule, BusinessMobileNavComponent],
  templateUrl: './profits.component.html',
})
export class ProfitsComponent implements OnInit {
  private readonly reports = inject(ReportsService);
  private readonly ordersApi = inject(OrderService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  readonly period = signal<ProfitPeriod>('day');
  readonly date = signal<string>(new Date().toISOString().slice(0, 10));
  readonly data = signal<ProfitsResponse | null>(null);
  readonly loading = signal(true);
  readonly soldItems = signal(0);

  readonly marginPct = computed(() => {
    const d = this.data();
    if (!d || !d.revenue) return 0;
    return Math.round((d.profit / d.revenue) * 100);
  });

  readonly ticketAvg = computed(() => {
    const d = this.data();
    return d && d.orders > 0 ? d.revenue / d.orders : 0;
  });

  readonly maxRevenue = computed(() => Math.max(1, ...(this.data()?.days.map((x) => x.revenue) ?? [1])));

  readonly topProducts = signal<TopProduct[]>([]);

  ngOnInit(): void {
    this.reload();
  }

  setPeriod(p: ProfitPeriod): void {
    this.period.set(p);
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.reports.profits(this.period(), this.date() || undefined).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    // Ticket extraído del backend; top e ítems se agregan de los pedidos.
    this.ordersApi.listMine().subscribe({
      next: (orders) => {
        const valid = (Array.isArray(orders) ? orders : []).filter((o) => !!o && o.status !== 'CANCELLED');
        this.soldItems.set(valid.reduce((s, o) => s + (o.items ?? []).reduce((a, i) => a + (i.quantity || 0), 0), 0));
        const map = new Map<string, { qty: number; revenue: number }>();
        for (const o of valid) {
          for (const item of o.items ?? []) {
            const entry = map.get(item.productName || 'Sin nombre') ?? { qty: 0, revenue: 0 };
            entry.qty += item.quantity || 0;
            entry.revenue += item.subtotal ?? (item.unitPrice || 0) * (item.quantity || 0);
            map.set(item.productName || 'Sin nombre', entry);
          }
        }
        this.topProducts.set(
          [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 5)
        );
      },
      error: () => undefined,
    });
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value ?? 0);
  }

  formatDay(iso: string): string {
    try {
      const d = new Date(iso + 'T12:00:00');
      return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
    } catch {
      return iso;
    }
  }

  periodLabel(): string {
    switch (this.period()) {
      case 'week':
        return 'Últimos 7 días';
      case 'month':
        return 'Este mes';
      default:
        return 'Hoy';
    }
  }
}
