import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { STAFF_ROLE_LABELS, User } from '../../../core/models/models';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, BusinessMobileNavComponent],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly auth = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showCreate = signal(false);
  readonly openMenuId = signal<number | null>(null);
  readonly menuSlug = signal<string | null>(null);
  readonly isOpen = signal(true);
  readonly currentUserId = computed(() => this.auth.user()?.id ?? null);
  readonly user = this.auth.user;

  readonly activeCount = computed(() => this.users().filter((u) => u && u.active).length);

  initials(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  roleLabel(role: string | null | undefined): string {
    const raw = role ?? '';
    const clean = raw.startsWith('ROLE_') ? raw.substring(5) : raw;
    return STAFF_ROLE_LABELS[clean] ?? 'Equipo';
  }

  memberSince(isoString: string | null | undefined): string {
    try {
      if (!isoString) return '—';
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  toggleMenu(id: number | null): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  logout(): void {
    this.auth.forceLogout();
  }

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)],
    ],
    role: ['RESTAURANT_USER'],
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

  reload(): void {
    this.loading.set(true);
    this.userService.list().subscribe({
      next: (users) => {
        this.users.set(Array.isArray(users) ? users.filter((u) => !!u) : []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.showCreate.set(true);
    this.form.reset({ name: '', email: '', password: '', role: 'RESTAURANT_USER' });
    this.errorMessage.set(null);
  }

  closeCreate(): void {
    this.showCreate.set(false);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);

    this.userService.create(this.form.value).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeCreate();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudo crear el usuario');
      },
    });
  }

  toggleActive(user: User): void {
    this.userService.setActive(user.id, !user.active).subscribe({
      next: () => this.reload(),
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo cambiar el estado'),
    });
  }

  remove(user: User): void {
    if (!confirm(`¿Eliminar al usuario "${user.name}"?`)) return;
    this.userService.delete(user.id).subscribe({
      next: () => this.reload(),
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }
}