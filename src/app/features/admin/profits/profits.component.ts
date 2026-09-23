import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportsService, ProfitPeriod } from '../../../core/services/reports.service';
import { AuthService } from '../../../core/services/auth.service';
import { ProfitsResponse } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

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
  readonly date = signal<string>(new Date().toISOString().slice(0, 10));
  readonly data = signal<ProfitsResponse | null>(null);
  readonly loading = signal(true);

  readonly marginPct = computed(() => {
    const d = this.data();
    if (!d || !d.revenue) return 0;
    return Math.round((d.profit / d.revenue) * 100);
  });

  readonly maxRevenue = computed(() => Math.max(1, ...(this.data()?.days.map((x) => x.revenue) ?? [1])));

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
