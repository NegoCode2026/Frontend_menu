import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportsService, ProfitPeriod } from '../../../core/services/reports.service';
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
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  readonly period = signal<ProfitPeriod>('day');
  readonly date = signal<string>(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  readonly data = signal<ProfitsResponse | null>(null);
  readonly failed = signal(false);
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
    this.failed.set(false);
    this.reports.profits(this.period(), this.date() || undefined).subscribe({
      next: (d) => {
        this.data.set(d);
        this.soldItems.set(d.soldItems ?? 0);
        this.topProducts.set(d.topProducts ?? []);
        this.loading.set(false);
      },
      error: () => { this.failed.set(true); this.data.set(null); this.loading.set(false); },
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
