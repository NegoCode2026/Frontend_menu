import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdminStats } from '../../../core/models/models';

@Component({
  selector: 'app-super-admin-dashboard',
  imports: [RouterLink],
  templateUrl: './super-admin-dashboard.component.html',
})
export class SuperAdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly stats = signal<AdminStats | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    this.adminService.getStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(
          err.status === 401 || err.status === 403
            ? 'Tu sesión no tiene permisos de Super Admin. Vuelve a iniciar sesión con la cuenta correcta.'
            : 'No se pudieron cargar las métricas. Verifica tu conexión e inténtalo de nuevo.'
        );
      },
    });
  }

  retry(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.ngOnInit();
  }
}
