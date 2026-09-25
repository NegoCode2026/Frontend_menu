import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { Category, Ingredient, Product, RecipeItem } from '../../../core/models/models';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { FileService, UploadResult } from '../../../core/services/file.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-products',
  imports: [FormsModule, ReactiveFormsModule, BusinessMobileNavComponent],
  templateUrl: './products.component.html',
})
export class ProductsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly productService = inject(ProductService);
  private readonly inventoryApi = inject(InventoryService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  readonly user = this.auth.user;

  readonly categories = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);
  readonly pageSize = 50;

  // Filtros (móvil y desktop comparten señales)
  readonly searchQuery = signal('');
  readonly categoryFilter = signal<number | 'ALL'>('ALL');
  readonly onlyPaused = signal(false);
  readonly openMenuId = signal<number | null>(null);
  readonly menuSlug = signal<string | null>(null);
  readonly isOpen = signal(true);

  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.categoryFilter();
    return this.products().filter((p) => {
      if (!p) return false;
      const matchesCat = cat === 'ALL' || p.categoryId === cat;
      const matchesQ =
        !q ||
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  });

  /** Vista desktop: página cargada + filtros + solo agotados. */
  readonly visibleProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.categoryFilter();
    const pausedOnly = this.onlyPaused();
    return this.products().filter((p) => {
      if (!p) return false;
      if (pausedOnly && p.available) return false;
      if (cat !== 'ALL' && p.categoryId !== cat) return false;
      if (!q) return true;
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
  });

  readonly pausedCount = computed(() => this.products().filter((p) => p && !p.available).length);

  readonly availableCount = computed(() => this.products().filter((p) => p && p.available).length);

  /** Tono gastronómico apagado para portadas sin foto (estable por id). */
  private readonly coverTones = ['#D9B36A', '#B85C32', '#8A9B7C', '#C08A76'];

  coverTone(product: Product): string {
    const id = product.id ?? 0;
    return this.coverTones[Math.abs(id) % this.coverTones.length];
  }

  toggleMenu(id: number | null): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  logout(): void {
    this.auth.forceLogout();
  }

  readonly form: FormGroup = this.fb.group({
    categoryId: [null],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    description: [''],
    price: [null, [Validators.required, Validators.min(0)]],
    available: [true],
    costPrice: [null, Validators.min(0)],
    trackStock: [false],
    stockQuantity: [null, Validators.min(0)],
    lowStockThreshold: [5, Validators.min(0)],
  });

  ngOnInit(): void {
    this.categoryService.list(0, 100).subscribe({
      next: (result) => {
        this.categories.set(result.content);
        this.reload();
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

  reload(page = this.page()): void {
    this.loading.set(true);
    this.productService.list(undefined, page, this.pageSize).subscribe({
      next: (result) => {
        this.products.set(result.content);
        this.page.set(result.number);
        this.totalPages.set(result.totalPages);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  previousPage(): void {
    if (this.page() > 0) this.reload(this.page() - 1);
  }

  nextPage(): void {
    if (this.page() + 1 < this.totalPages()) this.reload(this.page() + 1);
  }

  startCreate(): void {
    this.editingId.set(-1);
    this.form.reset({
      categoryId: null,
      name: '',
      description: '',
      price: null,
      available: true,
      costPrice: null,
      trackStock: false,
      stockQuantity: null,
      lowStockThreshold: 5,
    });
    this.formRecipeLines.set([]);
    this.formSelIng.set(null);
    this.formSelQty.set(null);
    this.loadFormIngredients();
    this.previewUrl.set(null);
  }

  startEdit(product: Product): void {
    this.editingId.set(product.id);
    this.form.patchValue({
      categoryId: product.categoryId,
      name: product.name,
      description: product.description ?? '',
      price: product.price,
      available: product.available,
      costPrice: product.costPrice ?? null,
      trackStock: product.trackStock ?? false,
      stockQuantity: product.stockQuantity ?? null,
      lowStockThreshold: product.lowStockThreshold ?? 5,
    });
    this.formRecipeLines.set([]);
    this.formSelIng.set(null);
    this.formSelQty.set(null);
    this.productService.getRecipe(product.id).subscribe({
      next: (lines) => {
        const base = (lines ?? []).map((l) => ({
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          unit: l.unit,
          unitCost: 0,
          quantity: l.quantity,
        }));
        this.formRecipeLines.set(base);
        this.loadFormIngredients();
      },
      error: () => {
        this.formRecipeLines.set([]);
        this.loadFormIngredients();
      },
    });
    this.previewUrl.set(product.imageUrl);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.errorMessage.set(null);
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.fileService.upload(file).subscribe({
      next: (result: UploadResult) => {
        // Guardamos la URL firmada para la preview y para enviar al backend.
        // El backend en toStoredValue() extrae el fileId limpio para almacenar en BD.
        this.previewUrl.set(result.url);
        this.uploading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message ?? 'No se pudo subir la imagen');
        this.uploading.set(false);
      },
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);

    const request = {
      ...this.form.value,
      imageUrl: this.previewUrl(),
    };
    const isCreate = this.editingId() === -1;
    const operation = isCreate
      ? this.productService.create(request)
      : this.productService.update(this.editingId()!, request);

    operation.subscribe({
      next: (saved) => {
        // La receta se guarda justo después (en crear, el plato ya tiene id).
        const lines = this.formRecipeLines().map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity }));
        this.productService.setRecipe(saved.id, lines).subscribe({
          next: () => this.finishSubmit(),
          error: () => {
            this.finishSubmit();
            this.errorMessage.set('Plato guardado, pero la receta no se pudo guardar. Ábrelo y reintenta.');
          },
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudo guardar el producto');
      },
    });
  }

  private finishSubmit(): void {
    this.saving.set(false);
    this.cancelEdit();
    this.reload();
  }

  toggleAvailable(product: Product): void {
    this.productService
      .update(product.id, {
        categoryId: product.categoryId,
        name: product.name,
        price: product.price,
        description: product.description,
        // CRÍTICO: se debe incluir imageUrl para no borrarla en la BD
        imageUrl: product.imageUrl,
        available: !product.available,
        position: product.position,
      })
      .subscribe({ next: () => this.reload() });
  }

  async remove(product: Product): Promise<void> {
    const ok = await this.confirm.ask({
      title: `¿Eliminar "${product.name}"?`,
      message: 'Se quitará del menú público. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.productService.delete(product.id).subscribe({
      next: () => {
        this.toast.success('Plato eliminado', product.name);
        this.reload();
      },
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }

  categoryName(categoryId: number | null): string {
    if (categoryId == null) return 'Sin categoría';
    return this.categories().find((c) => c.id === categoryId)?.name ?? '—';
  }

  // --- Receta del plato (ingredientes que se descuentan al vender) ---
  // Funciona creando o editando: las líneas viven en memoria y se guardan
  // junto al plato (crear: plato primero, receta después).
  readonly formRecipeLines = signal<Array<{ ingredientId: number; ingredientName: string; unit: string; unitCost: number; quantity: number }>>([]);
  readonly formRecipeIngredients = signal<Ingredient[]>([]);
  readonly formSelIng = signal<number | null>(null);
  readonly formSelQty = signal<number | null>(null);

  readonly formRecipeCost = computed(() =>
    this.formRecipeLines().reduce((sum, l) => sum + (l.unitCost || 0) * (l.quantity || 0), 0)
  );

  readonly formMarginPreview = computed(() => {
    const price = Number(this.form.get('price')?.value) || 0;
    const cost = this.formRecipeCost();
    if (!price) return null;
    return { profit: price - cost, pct: Math.round(((price - cost) / price) * 100) };
  });

  private loadFormIngredients(): void {
    this.inventoryApi.ingredients().subscribe({
      next: (list) => {
        this.formRecipeIngredients.set(list ?? []);
        // Enriquece líneas ya cargadas con costo vigente
        this.formRecipeLines.update((ls) =>
          ls.map((l) => {
            const ing = (list ?? []).find((i) => i.id === l.ingredientId);
            return ing ? { ...l, ingredientName: ing.name, unit: ing.unit, unitCost: ing.unitCost ?? 0 } : l;
          })
        );
      },
      error: () => this.formRecipeIngredients.set([]),
    });
  }

  addFormLine(): void {
    const ingredientId = this.formSelIng();
    const qty = this.formSelQty();
    if (ingredientId == null || qty == null || qty <= 0) return;
    if (this.formRecipeLines().some((l) => l.ingredientId === ingredientId)) return;
    const ing = this.formRecipeIngredients().find((i) => i.id === ingredientId);
    this.formRecipeLines.update((lines) => [
      ...lines,
      {
        ingredientId,
        ingredientName: ing?.name ?? '',
        unit: ing?.unit ?? 'und',
        unitCost: ing?.unitCost ?? 0,
        quantity: qty,
      },
    ]);
    this.formSelIng.set(null);
    this.formSelQty.set(null);
  }

  removeFormLine(ingredientId: number): void {
    this.formRecipeLines.update((lines) => lines.filter((l) => l.ingredientId !== ingredientId));
  }

  useRecipeCost(): void {
    this.form.get('costPrice')?.setValue(Math.round(this.formRecipeCost()));
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }
}