import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { FileService, UploadResult } from '../../../core/services/file.service';
import { AuthService } from '../../../core/services/auth.service';
import { Category, Product } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule, BusinessMobileNavComponent],
  templateUrl: './products.component.html',
})
export class ProductsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly productService = inject(ProductService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
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
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudo guardar el producto');
      },
    });
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

  remove(product: Product): void {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return;
    this.productService.delete(product.id).subscribe({
      next: () => this.reload(),
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }

  categoryName(categoryId: number): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? '—';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }
}