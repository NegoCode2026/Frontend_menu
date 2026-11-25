import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subscription, expand, forkJoin, map, reduce } from 'rxjs';
import { Ingredient, MovementReason, Product, StockMovement } from '../../../core/models/models';
import { InventoryService } from '../../../core/services/inventory.service';
import { ProductService } from '../../../core/services/product.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { adviseInventory } from '../../../shared/assistants/inventory-advisor';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';
import { StockRow, StockState, pageCount, searchText, stockRows } from './inventory-view';

@Component({
  selector: 'app-inventory',
  imports: [FormsModule, RouterLink, BusinessMobileNavComponent],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css',
})
export class InventoryComponent implements OnInit {
  private readonly inventory = inject(InventoryService);
  private readonly productsApi = inject(ProductService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');
  private catalogRequest?: Subscription;
  private historyRequest?: Subscription;
  readonly products = signal<Product[]>([]);
  readonly ingredients = signal<Ingredient[]>([]);
  readonly rows = computed(() => stockRows(this.ingredients(), this.products()));
  readonly filters = ['Todos', 'Agotado', 'Por reponer'] as const;
  readonly scope = signal<'Todos' | StockState>('Todos');
  readonly kind = signal<'Todos' | StockRow['kind']>('Todos');
  readonly query = signal('');
  readonly limit = signal(30);
  readonly counts = computed(() => {
    const rows = this.rows();
    return {
      Todos: rows.length,
      Agotado: rows.filter((r) => r.state === 'Agotado').length,
      'Por reponer': rows.filter((r) => r.state === 'Por reponer').length,
    };
  });
  readonly filtered = computed(() => {
    const query = searchText(this.query());
    return this.rows().filter(
      (row) =>
        (this.scope() === 'Todos' || row.state === this.scope()) &&
        (this.kind() === 'Todos' || row.kind === this.kind()) &&
        searchText(row.name).includes(query),
    );
  });
  readonly section = signal<'stock' | 'history'>('stock');
  readonly loading = signal(true);
  readonly catalogError = signal('');
  readonly movements = signal<StockMovement[]>([]);
  readonly historyPage = signal(0);
  readonly historyPages = signal(0);
  readonly historyError = signal('');
  readonly historyLoading = signal(false);
  readonly reviewing = signal(false);
  readonly advice = signal<string[]>([]);
  readonly reviewedAt = signal('');
  readonly dialog = signal<'adjust' | 'ingredient' | 'product' | 'delete'>('adjust');
  readonly selected = signal<StockRow | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  form = {
    name: '',
    unit: 'und',
    quantity: null as number | null,
    threshold: 5,
    cost: 0,
    price: null as number | null,
    reason: 'ADJUST' as MovementReason,
  };
  private readonly currency = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
  private readonly numbers = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
  private readonly dates = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly movementNames = computed(() => new Map(this.rows().map((r) => [r.kind + r.id, r])));

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.catalogRequest?.unsubscribe();
    this.loading.set(true);
    this.catalogError.set('');
    const productPage = (index: number) =>
      this.productsApi.list(undefined, index, 100).pipe(map((result) => ({ result, index })));
    const products = productPage(0).pipe(
      expand(({ result, index }) => (index + 1 < pageCount(result) ? productPage(index + 1) : EMPTY)),
      reduce((all, { result }) => all.concat(result.content), [] as Product[]),
    );
    this.catalogRequest = forkJoin({ products, ingredients: this.inventory.ingredients() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.products.set(data.products);
          this.ingredients.set(data.ingredients);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.catalogError.set('No se pudieron actualizar las existencias.');
        },
      });
    if (this.section() === 'history') this.loadHistory(0);
  }

  showStock(scope = this.scope()): void {
    this.section.set('stock');
    this.scope.set(scope);
    this.limit.set(30);
  }

  chooseSummary(scope: (typeof this.filters)[number]): void {
    this.kind.set('Todos');
    this.query.set('');
    this.showStock(scope);
  }

  loadHistory(index: number): void {
    this.section.set('history');
    this.historyRequest?.unsubscribe();
    this.historyPage.set(index);
    this.historyLoading.set(true);
    this.historyError.set('');
    this.historyRequest = this.inventory
      .movements(undefined, index, 30)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.movements.set(page.content);
          this.historyPages.set(pageCount(page));
          this.historyLoading.set(false);
        },
        error: () => {
          this.historyLoading.set(false);
          this.historyError.set('No se pudo cargar el historial.');
        },
      });
  }

  movementItem(m: StockMovement): StockRow | undefined {
    return this.movementNames().get(
      m.ingredientId != null ? 'Ingrediente' + m.ingredientId : 'Plato' + m.productId,
    );
  }

  reasonLabel(reason: MovementReason): string {
    return (
      { ORDER: 'Venta', CANCEL_RESTORE: 'Devolución', RESTOCK: 'Reposición', ADJUST: 'Conteo o merma' }[
        reason
      ] ?? 'Ajuste'
    );
  }

  number(value: number): string {
    return this.numbers.format(value);
  }
  money(value: number): string {
    return this.currency.format(value);
  }
  date(value: string): string {
    return this.dates.format(new Date(value));
  }
  margin(p: StockRow): string {
    return p.price ? Math.round((100 * (p.price - (p.costPrice ?? 0))) / p.price) + '%' : '—';
  }

  open(mode: 'adjust' | 'ingredient' | 'product', row: StockRow | null = null): void {
    this.dialog.set(mode);
    this.selected.set(row);
    this.formError.set('');
    const ingredient =
      mode === 'ingredient' && row ? this.ingredients().find((i) => i.id === row.id) : undefined;
    this.form = {
      name: ingredient?.name ?? '',
      unit: ingredient?.unit ?? 'und',
      quantity: mode === 'adjust' ? null : 0,
      threshold: ingredient?.lowStockThreshold ?? 5,
      cost: ingredient?.unitCost ?? 0,
      price: null,
      reason: 'ADJUST',
    };
    this.sheet().nativeElement.showModal();
  }

  close(): void {
    if (!this.saving()) this.sheet().nativeElement.close();
  }

  submit(): void {
    if (this.saving()) return;
    const row = this.selected();
    const f = this.form;
    const name = f.name.trim();
    const mode = this.dialog();
    if (mode !== 'adjust' && mode !== 'delete' && !name) {
      this.formError.set('Escribe el nombre del artículo.');
      return;
    }
    let action: Observable<unknown>;
    let message: string;
    if (mode === 'adjust' && row) {
      const qty = f.quantity;
      if (
        qty == null ||
        !Number.isFinite(qty) ||
        qty < 0 ||
        qty === row.stockQuantity ||
        (row.kind === 'Plato' && !Number.isInteger(qty)) ||
        (f.reason === 'RESTOCK' && qty < row.stockQuantity)
      ) {
        this.formError.set('Revisa la cantidad final y el motivo del cambio.');
        return;
      }
      action =
        row.kind === 'Ingrediente'
          ? this.inventory.adjustIngredient(row.id, qty, f.reason)
          : this.inventory.adjust({ productId: row.id, quantity: qty, reason: f.reason });
      message = 'Existencias actualizadas';
    } else if (mode === 'ingredient') {
      const payload = {
        name,
        unit: f.unit.trim() || 'und',
        lowStockThreshold: f.threshold,
        unitCost: f.cost,
      };
      action = row
        ? this.inventory.updateIngredient(row.id, payload)
        : this.inventory.createIngredient({ ...payload, stockQuantity: f.quantity, trackStock: true });
      message = row ? 'Ingrediente actualizado' : 'Ingrediente creado';
    } else if (mode === 'product') {
      if (f.price == null) return;
      action = this.productsApi.create({
        name,
        categoryId: null,
        price: f.price,
        costPrice: f.cost,
        available: true,
        stockQuantity: f.quantity,
        lowStockThreshold: f.threshold,
        trackStock: true,
      });
      message = 'Plato creado';
    } else if (mode === 'delete' && row) {
      action = this.inventory.deleteIngredient(row.id);
      message = 'Ingrediente eliminado';
    } else return;
    this.saving.set(true);
    this.formError.set('');
    action.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.close();
        this.toast.success(message, row?.name ?? name);
        this.advice.set([]);
        this.reviewedAt.set('');
        if (!row) this.chooseSummary('Todos');
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(err.error?.message ?? 'No se pudo guardar el cambio. Intenta nuevamente.');
      },
    });
  }

  review(question: string): void {
    if (!question.trim() || this.reviewing()) return;
    this.reviewing.set(true);
    this.advice.set([]);
    this.reviewedAt.set('');
    forkJoin({ recipes: this.inventory.capacities(), low: this.inventory.lowStockIngredients() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ recipes, low }) => {
          this.advice.set(adviseInventory(question, recipes, low));
          this.reviewedAt.set(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
          this.reviewing.set(false);
        },
        error: () => {
          this.advice.set(['No se pudo consultar el inventario. Intenta nuevamente.']);
          this.reviewing.set(false);
        },
      });
  }
}
