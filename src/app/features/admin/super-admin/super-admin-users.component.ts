import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { AdminService } from '../../../core/services/admin.service';
import { AdminUser } from '../../../core/models/models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-super-admin-users',
  imports: [DatePipe, RouterLink],
  templateUrl: './super-admin-users.component.html',
})
export class SuperAdminUsersComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly search$ = new Subject<string>();

  readonly currentUser = this.auth.user;
  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(true);
  readonly searchTerm = signal('');
  readonly roleFilter = signal<string>('all');
  readonly page = signal(0);
  readonly size = signal(20);
  readonly totalElements = signal(0);
  readonly totalPages = signal(1);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  ngOnInit(): void {
    this.search$.pipe(debounceTime(400)).subscribe((term) => {
      this.searchTerm.set(term);
      this.page.set(0);
      this.loadUsers();
    });
    this.loadUsers();
  }

  onSearchInput(value: string): void {
    this.search$.next(value);
  }

  setRoleFilter(role: string): void {
    this.roleFilter.set(role);
    this.page.set(0);
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.actionError.set(null);
    const role = this.roleFilter() === 'all' ? undefined : this.roleFilter();
    this.adminService
      .listUsers({ page: this.page(), size: this.size(), search: this.searchTerm().trim() || undefined, role })
      .subscribe({
        next: (p) => {
          // Normaliza rol con prefijo heredado
          const content = p.content.map((u) => ({
            ...u,
            role: u.role?.startsWith('ROLE_') ? u.role.substring(5) : u.role,
          }));
          this.users.set(content);
          this.totalElements.set(p.totalElements);
          this.totalPages.set(Math.max(1, p.totalPages));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadError.set(
            err.status === 401 || err.status === 403
              ? 'Tu sesión no tiene permisos de Super Admin. Vuelve a iniciar sesión con la cuenta correcta.'
              : 'No se pudieron cargar los usuarios. Verifica tu conexión e inténtalo de nuevo.'
          );
        },
      });
  }

  nextPage(): void {
    if (this.page() + 1 < this.totalPages()) {
      this.page.update((v) => v + 1);
      this.loadUsers();
    }
  }

  prevPage(): void {
    if (this.page() > 0) {
      this.page.update((v) => v - 1);
      this.loadUsers();
    }
  }

  toggleActive(user: AdminUser): void {
    if (this.currentUser()?.id === user.id && user.active) {
      this.actionError.set('No puedes desactivarte a ti mismo.');
      return;
    }
    const previous = user.active;
    const newStatus = !previous;
    this.actionError.set(null);
    this.users.update((list) =>
      list.map((item) => (item.id === user.id ? { ...item, active: newStatus } : item))
    );
    this.adminService.toggleUserActive(user.id, newStatus).subscribe({
      error: (err) => {
        this.users.update((list) =>
          list.map((item) => (item.id === user.id ? { ...item, active: previous } : item))
        );
        this.actionError.set(err.error?.message ?? 'No se pudo cambiar el estado. Reintenta.');
      },
    });
  }
}
