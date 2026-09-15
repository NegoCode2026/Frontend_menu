import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly restaurantService = inject(RestaurantService);
  private readonly categoryService = inject(CategoryService);
  private readonly productService = inject(ProductService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly restaurantName = signal<string | null>(null);
  readonly menuSlug = signal<string | null>(null);
  readonly categoryCount = signal(0);
  readonly productCount = signal(0);
  readonly availableCount = signal(0);
  readonly planName = signal<string | null>(null);
  readonly planEndsAt = signal<string | null>(null);
  readonly planStatus = signal<string | null>(null);
  readonly loading = signal(true);

  /** Tiempo restante de la suscripción: texto legible (días o fecha de vencimiento). */
  readonly planRemaining = computed(() => {
    const status = this.planStatus();
    if (!status) return null;
    if (status !== 'ACTIVE') {
      return status === 'CANCELED' || status === 'PENDING_CANCEL' ? 'Cancelado' : 'Sin plan activo';
    }
    const endsAt = this.planEndsAt();
    if (!endsAt) return null;
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms < 0) return 'Vencido';
    const days = Math.ceil(ms / 86400000);
    if (days <= 1) return 'Vence hoy';
    if (days <= 30) return `Quedan ${days} días`;
    const date = new Date(endsAt);
    return `Vence el ${date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  });

  private readonly router = inject(Router);

  ngOnInit(): void {
    if (this.user()?.role === 'SUPER_ADMIN') {
      this.router.navigate(['/admin/super-admin/dashboard']);
      return;
    }

    this.restaurantService.getMine().subscribe({
      next: (r) => {
        this.restaurantName.set(r.name);
        this.menuSlug.set(r.slug);
      },
    });

    this.categoryService.list(0, 100).subscribe({
      next: (categories) => this.categoryCount.set(categories.totalElements),
    });

    this.productService.list(undefined, 0, 100).subscribe({
      next: (products) => {
        this.productCount.set(products.totalElements);
        this.availableCount.set(products.content.filter((p) => p.available).length);
      },
    });

    this.subscriptionService.getMine().subscribe({
      next: (s) => {
        this.planName.set(s.plan.name);
        this.planEndsAt.set(s.endsAt);
        this.planStatus.set(s.status);
      },
      error: () => undefined,
      complete: () => this.loading.set(false),
    });
  }
}