import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../core/services/product.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { AuthService } from '../../../core/services/auth.service';
import { MovementReason, Product, StockMovement } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-inventory',
  imports: [FormsModule, BusinessMobileNavComponent],
  templateUrl: './inventory.component.html',
})
export class InventoryComponent implements OnInit {
  private readonly productsApi = inject(ProductService);
  private readonly inventoryApi = inject(InventoryService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  readonly products = signal<Product[]>([]);
  readonly lowStock = signal<Product[]>([]);
  readonly movements = signal<StockMovement[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly onlyTracked = signal(true);
  readonly adjustId = signal<number | null>(null);
  readonly adjustQty = signal<number | null>(null);
  readonly adjustReason = signal<MovementReason>('RESTOCK');
  readonly saving = signal(false);

  readonly trackedProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    return this.products()
      .filter((p) => !this.onlyTracked() || p.trackStock)
      .filter((p) => !q || (p.name ?? '').toLowerCase().includes(q));
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.productsApi.list(undefined, 0, 200).subscribe({
      next: (page) => {
        this.products.set(page.content ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('No se pudo cargar el inventario');
      },
    });
    this.inventoryApi.lowStock().subscribe({
      next: (list) => this.lowStock.set(list ?? []),
      error: () => undefined,
    });
    this.inventoryApi.movements(undefined, 0, 30).subscribe({
      next: (page) => this.movements.set(page.content ?? []),
      error: () => undefined,
    });
  }

  margin(p: Product): string {
    if (!p.price) return '—';
    const pct = ((p.price - (p.costPrice ?? 0)) / p.price) * 100;
    return `${Math.round(pct)}%`;
  }

  openAdjust(p: Product): void {
    this.adjustId.set(p.id);
    this.adjustQty.set(p.stockQuantity ?? 0);
    this.adjustReason.set('RESTOCK');
  }

  closeAdjust(): void {
    this.adjustId.set(null);
    this.adjustQty.set(null);
  }

  submitAdjust(): void {
    const id = this.adjustId();
    const qty = this.adjustQty();
    if (id == null || qty == null || qty < 0 || this.saving()) return;
    this.saving.set(true);
    this.inventoryApi.adjust({ productId: id, quantity: qty, reason: this.adjustReason() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeAdjust();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudo ajustar el stock');
      },
    });
  }

  reasonLabel(reason: MovementReason): string {
    switch (reason) {
      case 'ORDER':
        return '🧾 Venta';
      case 'CANCEL_RESTORE':
        return '↩️ Devolución';
      case 'RESTOCK':
        return '📦 Reposición';
      default:
        return '✏️ Ajuste';
    }
  }

  formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value ?? 0);
  }
}
