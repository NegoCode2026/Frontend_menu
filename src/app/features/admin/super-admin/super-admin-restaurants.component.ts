import { Component, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { AdminService } from '../../../core/services/admin.service';
import { AdminRestaurant } from '../../../core/models/models';
import { AuthService } from '../../../core/services/auth.service';
import { SuperAdminMobileNavComponent } from './super-admin-mobile-nav.component';

@Component({
  selector: 'app-super-admin-restaurants',
  imports: [ReactiveFormsModule, DatePipe, RouterLink, SuperAdminMobileNavComponent],
  templateUrl: './super-admin-restaurants.component.html',
})
export class SuperAdminRestaurantsComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly search$ = new Subject<string>();

  readonly restaurants = signal<AdminRestaurant[]>([]);
  readonly loading = signal(true);
  readonly searchTerm = signal('');
  readonly activeFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly page = signal(0);
  readonly size = signal(20);
  readonly totalElements = signal(0);
  readonly totalPages = signal(1);
  readonly showModal = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    restaurantName: ['', [Validators.required, Validators.maxLength(120)]],
    slug: [
      '',
      [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Validators.maxLength(120)],
    ],
    adminName: ['', [Validators.required, Validators.maxLength(120)]],
    adminEmail: ['', [Validators.required, Validators.email]],
    adminPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
      ],
    ],
    planCode: ['NEGOCODE', Validators.required],
  });

  ngOnInit(): void {
    this.search$.pipe(debounceTime(400)).subscribe((term) => {
      this.searchTerm.set(term);
      this.page.set(0);
      this.loadRestaurants();
    });
    this.loadRestaurants();
  }

  onSearchInput(value: string): void {
    this.search$.next(value);
  }

  setActiveFilter(value: 'all' | 'active' | 'inactive'): void {
    this.activeFilter.set(value);
    this.page.set(0);
    this.loadRestaurants();
  }

  loadRestaurants(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.actionError.set(null);
    const active = this.activeFilter() === 'all' ? undefined : this.activeFilter() === 'active';
    this.adminService
      .listRestaurants({ page: this.page(), size: this.size(), search: this.searchTerm().trim() || undefined, active })
      .subscribe({
        next: (p) => {
          this.restaurants.set(p.content);
          this.totalElements.set(p.totalElements);
          this.totalPages.set(Math.max(1, p.totalPages));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadError.set(
            err.status === 401 || err.status === 403
              ? 'Tu sesión no tiene permisos de Super Admin. Vuelve a iniciar sesión con la cuenta correcta.'
              : 'No se pudieron cargar los restaurantes. Verifica tu conexión e inténtalo de nuevo.'
          );
        },
      });
  }

  nextPage(): void {
    if (this.page() + 1 < this.totalPages()) {
      this.page.update((v) => v + 1);
      this.loadRestaurants();
    }
  }

  prevPage(): void {
    if (this.page() > 0) {
      this.page.update((v) => v - 1);
      this.loadRestaurants();
    }
  }

  suggestSlug(): void {
    const name = this.form.get('restaurantName')?.value ?? '';
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug) this.form.get('slug')?.setValue(slug);
  }

  openCreateModal(): void {
    this.form.reset({ planCode: 'NEGOCODE' });
    this.errorMessage.set(null);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  @HostListener('document:keydown.escape')
  closeModalOnEscape(): void {
    if (this.showModal() && !this.submitting()) this.closeModal();
  }

  logout(): void {
    this.auth.forceLogout();
  }

  submitCreate(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set(null);

    this.adminService.createRestaurant(this.form.value).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showModal.set(false);
        this.page.set(0);
        this.loadRestaurants();
      },
      error: (err) => {
        this.submitting.set(false);
        const fieldErrors = err.error?.fieldErrors;
        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          const firstKey = Object.keys(fieldErrors)[0];
          this.errorMessage.set(fieldErrors[firstKey]);
        } else {
          this.errorMessage.set(err.error?.message ?? 'No se pudo crear el restaurante');
        }
      },
    });
  }

  toggleActive(restaurant: AdminRestaurant): void {
    const previous = restaurant.active;
    const newStatus = !previous;
    this.actionError.set(null);
    // Optimista con reversión si falla
    this.restaurants.update((list) =>
      list.map((item) => (item.id === restaurant.id ? { ...item, active: newStatus } : item))
    );
    this.adminService.toggleRestaurantActive(restaurant.id, newStatus).subscribe({
      error: (err) => {
        this.restaurants.update((list) =>
          list.map((item) => (item.id === restaurant.id ? { ...item, active: previous } : item))
        );
        this.actionError.set(err.error?.message ?? 'No se pudo cambiar el estado. Reintenta.');
      },
    });
  }
}
