import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { PermissionService, PERMISSION_LABELS } from '../../../core/services/permission.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { STAFF_ROLE_LABELS, User } from '../../../core/models/models';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, BusinessMobileNavComponent],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly permissionApi = inject(PermissionService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

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
    this.loadPerms();
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
        // Si se está viendo la vista por persona y aún no hay selección, tomamos la primera.
        if (this.permScope() === 'user' && this.permUserId() == null) {
          const first = this.permableUsers()[0];
          if (first) {
            this.permUserId.set(first.id);
            this.loadUserPerms(first.id);
          }
        }
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

  async remove(user: User): Promise<void> {
    const ok = await this.confirm.ask({
      title: `¿Eliminar a ${user.name}?`,
      message: 'Perderá el acceso al panel. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.userService.delete(user.id).subscribe({
      next: () => {
        this.toast.success('Usuario eliminado', user.name);
        this.reload();
      },
      error: (err) => this.errorMessage.set(err.error?.message ?? 'No se pudo eliminar'),
    });
  }

  // --- Permisos: por rol o por persona (solo admin) ---
  readonly showPermissions = signal(false);
  readonly permCatalog = signal<string[]>([]);
  readonly permMatrix = signal<Record<string, string[]>>({});
  readonly permScope = signal<'role' | 'user'>('role');
  readonly permRole = signal('RESTAURANT_USER');
  readonly permUserId = signal<number | null>(null);
  readonly userPerms = signal<string[]>([]);
  readonly userPermInherited = signal(true);
  readonly userPermLoading = signal(false);
  readonly permSaving = signal(false);
  readonly permLoading = signal(true);
  readonly permStatus = signal<'idle' | 'saved'>('idle');

  readonly permRoles = [
    { value: 'RESTAURANT_USER', label: 'Equipo' },
    { value: 'WAITER', label: 'Mesero' },
    { value: 'CASHIER', label: 'Cajero' },
  ];

  permissionLabel(p: string): string {
    return PERMISSION_LABELS[p] ?? p;
  }

  availablePermissions(): string[] {
    return this.permCatalog().length ? this.permCatalog() : Object.keys(PERMISSION_LABELS);
  }

  rolePerms(): string[] {
    return this.permMatrix()[this.permRole()] ?? [];
  }

  /** Personas cuyos permisos se pueden personalizar (el admin tiene todo siempre). */
  permableUsers(): User[] {
    const normalize = (role: string | null | undefined): string => {
      const raw = role ?? '';
      return raw.startsWith('ROLE_') ? raw.substring(5) : raw;
    };
    return this.users().filter((u) => {
      if (!u) return false;
      const role = normalize(u.role);
      return role !== 'RESTAURANT_ADMIN' && role !== 'SUPER_ADMIN';
    });
  }

  selectedUser(): User | null {
    const id = this.permUserId();
    if (id == null) return null;
    return this.users().find((u) => u?.id === id) ?? null;
  }

  selectedRoleLabel(): string {
    return this.permRoles.find((role) => role.value === this.permRole())?.label ?? 'Equipo';
  }

  /** Nombre de a quién aplica la lista de permisos que se está viendo. */
  targetLabel(): string {
    if (this.permScope() === 'user') {
      return this.selectedUser()?.name ?? 'Persona';
    }
    return this.selectedRoleLabel();
  }

  /** Permisos visibles: los del rol o los de la persona seleccionada. */
  activePerms(): string[] {
    return this.permScope() === 'user' ? this.userPerms() : this.rolePerms();
  }

  selectedPermissionCount(): number {
    return this.activePerms().length;
  }

  hasAllPermissions(): boolean {
    const catalog = this.availablePermissions();
    return catalog.length > 0 && catalog.every((permission) => this.hasPerm(permission));
  }

  selectPermissionRole(role: string): void {
    if (this.permSaving()) return;
    this.permRole.set(role);
    this.permStatus.set('idle');
    this.errorMessage.set(null);
  }

  /** Cambia entre permisos por rol y permisos por persona. */
  selectPermScope(scope: 'role' | 'user'): void {
    if (this.permSaving()) return;
    this.permScope.set(scope);
    this.permStatus.set('idle');
    this.errorMessage.set(null);
    if (scope === 'user' && this.permUserId() == null) {
      const first = this.permableUsers()[0];
      if (first) this.selectPermissionUser(first.id);
    }
  }

  /** Selecciona a la persona a la que se le darán los permisos. */
  selectPermissionUser(value: string | number): void {
    if (this.permSaving()) return;
    const id = Number(value);
    if (!Number.isFinite(id)) return;
    this.permUserId.set(id);
    this.permStatus.set('idle');
    this.errorMessage.set(null);
    this.loadUserPerms(id);
  }

  togglePermissions(): void {
    this.showPermissions.update((s) => !s);
    this.permStatus.set('idle');
    this.loadPerms();
  }

  /** Quita la personalización: la persona vuelve a los permisos de su rol. */
  resetUserToRole(): void {
    const userId = this.permUserId();
    if (userId == null || this.permSaving()) return;

    this.permSaving.set(true);
    this.permStatus.set('idle');
    this.errorMessage.set(null);
    this.permissionApi.clearUser(userId).subscribe({
      next: (saved) => {
        this.userPerms.set(saved?.permissions ?? []);
        this.userPermInherited.set(true);
        this.permSaving.set(false);
        this.permStatus.set('saved');
      },
      error: (err) => {
        this.permSaving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudieron restablecer los permisos');
      },
    });
  }

  setAllPermissions(enabled: boolean): void {
    const catalog = this.availablePermissions();
    if (enabled && catalog.length === 0) return;
    this.savePermissions(enabled ? [...catalog] : []);
  }

  /** Guarda el set completo en el alcance activo (rol o persona). */
  private savePermissions(permissions: string[]): void {
    if (this.permSaving()) return;

    this.permSaving.set(true);
    this.permStatus.set('idle');
    this.errorMessage.set(null);

    if (this.permScope() === 'user') {
      const userId = this.permUserId();
      if (userId == null) {
        this.permSaving.set(false);
        return;
      }
      this.permissionApi.setUser(userId, permissions).subscribe({
        next: (saved) => {
          this.userPerms.set(saved?.permissions ?? permissions);
          this.userPermInherited.set(saved?.inherited ?? false);
          this.permSaving.set(false);
          this.permStatus.set('saved');
        },
        error: (err) => {
          this.permSaving.set(false);
          this.errorMessage.set(err.error?.message ?? 'No se pudieron guardar los permisos');
        },
      });
      return;
    }

    const role = this.permRole();
    this.permissionApi.setRole(role, permissions).subscribe({
      next: (saved) => {
        this.permMatrix.update((matrix) => ({ ...matrix, [role]: saved ?? permissions }));
        this.permSaving.set(false);
        this.permStatus.set('saved');
      },
      error: (err) => {
        this.permSaving.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudo guardar permisos');
      },
    });
  }

  private loadPerms(): void {
    this.permLoading.set(true);
    if (this.permCatalog().length === 0) {
      this.permissionApi.catalog().subscribe({
        next: (catalog) => this.permCatalog.set(catalog ?? []),
        error: () => this.permLoading.set(false),
      });
    }
    this.permissionApi.matrix().subscribe({
      next: (matrix) => {
        this.permMatrix.set(matrix ?? {});
        this.permLoading.set(false);
      },
      error: () => this.permLoading.set(false),
    });
  }

  /** Carga los permisos de la persona seleccionada (personalización o herencia). */
  private loadUserPerms(userId: number): void {
    this.userPermLoading.set(true);
    this.permissionApi.user(userId).subscribe({
      next: (res) => {
        if (this.permUserId() !== userId) return; // cambió la selección mientras cargaba
        this.userPerms.set(res?.permissions ?? []);
        this.userPermInherited.set(res?.inherited ?? true);
        this.userPermLoading.set(false);
      },
      error: (err) => {
        if (this.permUserId() !== userId) return;
        this.userPermLoading.set(false);
        this.errorMessage.set(err.error?.message ?? 'No se pudieron cargar los permisos');
      },
    });
  }

  hasPerm(p: string): boolean {
    return this.activePerms().includes(p);
  }

  togglePerm(p: string): void {
    if (this.permSaving()) return;

    const current = new Set(this.activePerms());
    if (current.has(p)) current.delete(p);
    else current.add(p);

    this.savePermissions([...current]);
  }
}