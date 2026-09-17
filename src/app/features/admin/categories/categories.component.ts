import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../core/services/category.service';
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

  // Filtro solo para el clon móvil (el desktop muestra la tabla completa)
  readonly activeFilter = signal<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  readonly filteredCategories = computed(() => {
    const f = this.activeFilter();
    return this.categories().filter((c) => {
      if (f === 'ACTIVE') return c.active;
      if (f === 'INACTIVE') return !c.active;
      return true;
    });
  });

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
  }

  startCreate(): void {
    this.editingId.set(-1);
    this.form.reset({ name: '', description: '', position: this.totalElements() + 1 });
  }

  reload(page = this.page()): void {
    this.loading.set(true);
    this.categoryService.list(page, this.pageSize).subscribe({
      next: (result) => {
        this.categories.set(result.content);
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