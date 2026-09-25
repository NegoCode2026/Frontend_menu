import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashService, CashToday } from '../../../core/services/cash.service';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-cash',
  imports: [FormsModule, BusinessMobileNavComponent],
  templateUrl: './cash.component.html',
})
export class CashComponent implements OnInit {
  private readonly cashApi = inject(CashService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  readonly today = signal<CashToday | null>(null);
  readonly loading = signal(true);
  readonly counted = signal<number | null>(null);
  readonly notes = signal('');
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly okMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.cashApi.today().subscribe({
      next: (t) => {
        this.today.set(t);
        if (t.closing) {
          this.counted.set(t.closing.countedCash);
          this.notes.set(t.closing.notes ?? '');
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('No se pudo cargar la caja');
      },
    });
  }

  difference(): number {
    const t = this.today();
    if (!t || this.counted() == null) return 0;
    return (this.counted() ?? 0) - (t.expectedCash ?? 0);
  }

  close(): void {
    if (this.counted() == null || this.counted()! < 0 || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.okMessage.set(null);
    this.cashApi.close(this.counted()!, this.notes() || null).subscribe({
      next: () => {
        this.saving.set(false);
        this.okMessage.set('Caja cerrada correctamente');
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudo cerrar la caja');
      },
    });
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value ?? 0);
  }
}
