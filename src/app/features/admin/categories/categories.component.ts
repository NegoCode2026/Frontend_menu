import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CategoryService } from '../../../core/services/category.service';
import { Category, CategoryRequest } from '../../../core/models/models';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

/**
 * Gestión de categorías del menú.
 *
 * <p>El backend tenía el CRUD completo (`/api/categories` POST/PUT/DELETE) pero
 * ningún componente lo invocaba, y el formulario de producto no tenía selector:
 * todo plato nuevo se guardaba en "Sin categoría" y el menú público quedaba
 * desagrupado.
 */
@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, RouterLink, BusinessMobileNavComponent],
  templateUrl: './categories.component.html',
})
export class CategoriesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(2000)]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.categoryService.list(0, 100).subscribe({
      next: (page) => {
        this.categories.set(page.content ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar las categorías', err?.error?.message);
      },
    });
  }

  startEdit(category: Category): void {
    this.editingId.set(category.id);
    this.form.setValue({
      name: category.name ?? '',
      description: category.description ?? '',
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', description: '' });
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue() as CategoryRequest;
    const editing = this.editingId();

    const request$ = editing === null
      ? this.categoryService.create(value)
      : this.categoryService.update(editing, value);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.toast.success(editing === null ? 'Categoría creada' : 'Categoría actualizada');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('No se pudo guardar la categoría', err?.error?.message);
      },
    });
  }

  async remove(category: Category): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar categoría',
      message: `Se eliminará "${category.name}". Sus productos también se borran: la base de datos los elimina en cascada.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;

    this.categoryService.delete(category.id).subscribe({
      next: () => {
        this.toast.success('Categoría eliminada');
        this.load();
      },
      error: (err) => this.toast.error('No se pudo eliminar la categoría', err?.error?.message),
    });
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
        next: () => {
          this.toast.success(category.active ? 'Categoría ocultada' : 'Categoría visible');
          this.load();
        },
        error: (err) =>
          this.toast.error('No se pudo cambiar la visibilidad', err?.error?.message),
      });
  }
}