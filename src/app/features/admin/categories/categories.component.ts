import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { Category } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, BusinessMobileNavComponent],
  templateUrl: './categories.component.html',
})
export class CategoriesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly productService = inject(ProductService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);
  readonly pageSize = 50;

  readonly openMenuId = signal<number | null>(null);
  readonly menuSlug = signal<string | null>(null);
  readonly isOpen = signal(true);
  readonly productCounts = signal<Record<number, number>>({});

  private readonly tileTones = ['#F9DFC2', '#D9E8D4', '#F3E6C8'];

  tileTone(index: number): string {
    return this.tileTones[index % this.tileTones.length];
  }

  toggleMenu(id: number | null): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  countFor(categoryId: number): number | null {
    return this.productCounts()[categoryId] ?? null;
  }

  // Filtro solo para el clon móvil (el desktop muestra la tabla completa)
  readonly activeFilter = signal<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  readonly filteredCategories = computed(() => {
    const f = this.activeFilter();
    return this.categories().filter((c) => {
      if (!c) return false;
      if (f === 'ACTIVE') return c.active;
      if (f === 'INACTIVE') return !c.active;
      return true;
    });
  });

  readonly activeCount = computed(() => this.categories().filter((c) => c && c.active).length);

  logout(): void {
    this.auth.forceLogout();
  }

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    position: [0],
  });

  ngOnInit(): void {
    this.reload();
    this.restaurantService.getMine().subscribe({
      next: (r) => {
        this.menuSlug.set(r.slug);
        this.isOpen.set(r.open);
      },
      error: () => undefined,
    });
  }

  startCreate(): void {
    this.editingId.set(-1);
    this.form.reset({ name: '', description: '', position: this.totalElements() + 1 });
  }

  reload(page = this.page()): void {
    this.loading.set(true);
    this.categoryService.list(page, this.pageSize).subscribe({
      next: (result) => {
        const content = result?.content ?? [];
        this.categories.set(content);
        this.page.set(result?.number ?? 0);
        this.totalPages.set(result?.totalPages ?? 0);
        this.totalElements.set(result?.totalElements ?? 0);
        this.loading.set(false);
        this.loadCounts(content.map((c) => c.id));
      },
      error: () => this.loading.set(false),
    });
  }

  private loadCounts(ids: number[]): void {
    if (ids.length === 0) {
      this.productCounts.set({});
      return;
    }
    const counts: Record<number, number> = {};
    let done = 0;
    for (const id of ids) {
      this.productService.list(id, 0, 1).subscribe({
        next: (result) => {
          counts[id] = result?.totalElements ?? 0;
          if (++done === ids.length) this.productCounts.set(counts);
        },
        error: () => {
          if (++done === ids.length) this.productCounts.set(counts);
        },
      });
    }
  }

  toggleActive(category: Category): void {
    this.categoryService
      .update(category.id, {
        name: category.name,
        description: category.description,
        position: category.position,
        active: !category.active,
      })
      .subscribe({
        next: () => this.reload(),
        error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo actualizar'),
      });
  }

  previousPage(): void {
    if (this.page() > 0) this.reload(this.page() - 1);
  }

  nextPage(): void {
    if (this.page() + 1 < this.totalPages()) this.reload(this.page() + 1);
  }

  startEdit(category: Category): void {
    this.editingId.set(category.id);
    this.form.patchValue({
      name: category.name,
      description: category.description ?? '',
      position: category.position,
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', description: '', position: 0 });
    this.errorMessage.set(null);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);

    const request = this.form.value;
    const isCreate = this.editingId() === -1;
    const operation = isCreate
      ? this.categoryService.create(request)
      : this.categoryService.update(this.editingId()!, request);

    operation.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudo guardar la categoría');
      },
    });
  }

  remove(category: Category): void {
    if (!confirm(`¿Eliminar la categoría "${category.name}" y sus productos?`)) return;
    this.categoryService.delete(category.id).subscribe({
      next: () => this.reload(),
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }

  move(category: Category, delta: number): void {
    const index = this.categories().indexOf(category);
    const target = this.categories()[index + delta];
    if (!target) return;

    const first = this.categoryService.update(category.id, { name: category.name, position: target.position });
    const second = this.categoryService.update(target.id, { name: target.name, position: category.position });
    first.subscribe({ next: () => second.subscribe({ next: () => this.reload() }) });
  }
}