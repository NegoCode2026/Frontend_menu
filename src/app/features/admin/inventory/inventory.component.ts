import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../core/services/product.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { AuthService } from '../../../core/services/auth.service';
import { Ingredient, MovementReason, Product, StockMovement } from '../../../core/models/models';
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

  // Alta rápida de producto con stock inicial
  readonly showCreate = signal(false);
  readonly newName = signal('');
  readonly newPrice = signal<number | null>(null);
  readonly newCost = signal<number | null>(null);
  readonly newStock = signal<number | null>(null);
  readonly newThreshold = signal<number>(5);

  // Ingredientes (el stock de verdad; los platos los consumen por receta)
  readonly ingredients = signal<Ingredient[]>([]);
  readonly lowIngredients = signal<Ingredient[]>([]);
  readonly showIngForm = signal(false);
  readonly editingIng = signal<Ingredient | null>(null);
  readonly ingName = signal('');
  readonly ingUnit = signal('und');
  readonly ingStock = signal<number | null>(null);
  readonly ingThreshold = signal<number>(5);

  readonly trackedProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    return this.products()
      .filter((p) => !this.onlyTracked() || p.trackStock)
      .filter((p) => !q || (p.name ?? '').toLowerCase().includes(q));
  });

  ngOnInit(): void {
    this.reload();
  }

  reloadIngredients(): void {
    this.inventoryApi.ingredients().subscribe({
      next: (list) => this.ingredients.set(list ?? []),
      error: () => undefined,
    });
    this.inventoryApi.lowStockIngredients().subscribe({
      next: (list) => this.lowIngredients.set(list ?? []),
      error: () => undefined,
    });
  }

  openIngCreate(): void {
    this.editingIng.set(null);
    this.ingName.set('');
    this.ingUnit.set('und');
    this.ingStock.set(null);
    this.ingThreshold.set(5);
    this.errorMessage.set(null);
    this.showIngForm.set(true);
  }

  openIngEdit(ing: Ingredient): void {
    this.editingIng.set(ing);
    this.ingName.set(ing.name);
    this.ingUnit.set(ing.unit);
    this.ingStock.set(ing.stockQuantity);
    this.ingThreshold.set(ing.lowStockThreshold);
    this.errorMessage.set(null);
    this.showIngForm.set(true);
  }

  closeIngForm(): void {
    this.showIngForm.set(false);
    this.editingIng.set(null);
  }

  submitIngForm(): void {
    const name = this.ingName().trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    const payload = {
      name,
      unit: this.ingUnit().trim() || 'und',
      stockQuantity: this.ingStock(),
      lowStockThreshold: this.ingThreshold(),
      trackStock: true,
    };
    const editing = this.editingIng();
    const op = editing
      ? this.inventoryApi.updateIngredient(editing.id, payload)
      : this.inventoryApi.createIngredient(payload);
    op.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeIngForm();
        this.reloadIngredients();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(this.apiError(err, 'No se pudo guardar el ingrediente'));
      },
    });
  }

  adjustIng(ing: Ingredient, delta: number): void {
    const next = Math.max((ing.stockQuantity ?? 0) + delta, 0);
    this.inventoryApi.adjustIngredient(ing.id, next, delta >= 0 ? 'RESTOCK' : 'ADJUST').subscribe({
      next: () => this.reloadIngredients(),
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo ajustar'),
    });
  }

  removeIng(ing: Ingredient): void {
    if (!confirm(`¿Eliminar "${ing.name}"? (los platos que lo usen pierden ese ingrediente)`)) return;
    this.inventoryApi.deleteIngredient(ing.id).subscribe({
      next: () => this.reloadIngredients(),
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo eliminar'),
    });
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
    this.reloadIngredients();
  }

  /** Error legible: si el endpoint no existe (404), el docker está desactualizado. */
  private apiError(err: unknown, fallback: string): string {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return 'El servidor está desactualizado (no tiene este endpoint). Actualiza el docker del restaurante.';
    }
    const msg = (err as { error?: { message?: string } })?.error?.message;
    return msg ?? fallback;
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
  }  closeAdjust(): void {
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
        this.errorMessage.set(this.apiError(err, 'No se pudo ajustar el stock'));
      },
    });
  }

  openCreate(): void {
    this.newName.set('');
    this.newPrice.set(null);
    this.newCost.set(null);
    this.newStock.set(null);
    this.newThreshold.set(5);
    this.errorMessage.set(null);
    this.showCreate.set(true);
  }

  closeCreate(): void {
    this.showCreate.set(false);
  }

  submitCreate(): void {
    const name = this.newName().trim();
    const price = this.newPrice();
    const stock = Math.max(this.newStock() ?? 0, 0);
    if (!name || price == null || price < 0 || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.productsApi.create({
      categoryId: null,
      name,
      price,
      costPrice: this.newCost() ?? null,
      stockQuantity: stock,
      lowStockThreshold: this.newThreshold() ?? 5,
      trackStock: true,
      available: true,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeCreate();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(this.apiError(err, 'No se pudo crear el producto'));
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
