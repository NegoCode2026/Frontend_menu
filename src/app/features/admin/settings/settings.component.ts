import { Component, inject, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { Plan, Restaurant, Subscription } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

declare const ePayco: any;

@Component({
  selector: 'app-settings',
  imports: [DatePipe, ReactiveFormsModule, BusinessMobileNavComponent],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  logout(): void {
    this.auth.forceLogout();
  }

  readonly activeTab = signal<'general' | 'billing'>('general');
  readonly restaurant = signal<Restaurant | null>(null);
  readonly menuSlug = signal<string | null>(null);
  readonly isOpen = signal(true);

  readonly generalForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    phone: [''],
    address: [''],
  });
  readonly savingGeneral = signal(false);
  readonly generalMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  readonly plans = signal<Plan[]>([]);
  readonly subscription = signal<Subscription | null>(null);
  readonly loading = signal(true);
  readonly subscribing = signal(false);
  readonly message = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  ngOnInit(): void {
    this.subscriptionService.listPlans().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.subscriptionService.getMine().subscribe({
      next: (subscription) => this.subscription.set(subscription),
      error: () => undefined,
    });

    this.restaurantService.getMine().subscribe({
      next: (r) => {
        this.restaurant.set(r);
        this.menuSlug.set(r.slug);
        this.isOpen.set(r.open);
        this.generalForm.patchValue({
          name: r.name,
          description: r.description ?? '',
          phone: r.phone ?? '',
          address: r.address ?? '',
        });
      },
      error: () => undefined,
    });
  }

  saveGeneral(): void {
    if (this.generalForm.invalid || this.savingGeneral()) return;
    const current = this.restaurant();
    if (!current) return;
    this.savingGeneral.set(true);
    this.generalMessage.set(null);
    const v = this.generalForm.value;
    this.restaurantService.updateMine({
      name: v.name,
      slug: current.slug,
      logoUrl: current.logoUrl ?? null,
      description: v.description || null,
      phone: v.phone || null,
      address: v.address || null,
      whatsapp: current.whatsapp ?? null,
      instagram: current.instagram ?? null,
      facebook: current.facebook ?? null,
      taxId: current.taxId ?? null,
      estimatedPrepTime: current.estimatedPrepTime ?? null,
    }).subscribe({
      next: () => {
        this.savingGeneral.set(false);
        this.generalMessage.set({ type: 'success', text: 'Datos actualizados correctamente' });
      },
      error: (err) => {
        this.savingGeneral.set(false);
        this.generalMessage.set({ type: 'error', text: err.error?.message ?? 'No se pudo guardar' });
      },
    });
  }

  subscribe(code: string): void {
    if (this.subscribing()) return;
    this.subscribing.set(true);
    this.message.set(null);

    this.subscriptionService.subscribe(code).subscribe({
      next: (result) => {
        this.subscription.set(result.subscription);
        if (result.checkoutSessionId) {
          this.openEpaycoCheckout(result.checkoutSessionId);
          return;
        }
        this.subscribing.set(false);
        this.message.set({ type: 'success', text: 'Plan activado correctamente' });
      },
      error: (err) => {
        this.subscribing.set(false);
        this.message.set({ type: 'error', text: err.error?.message ?? 'No se pudo activar el plan' });
      },
    });
  }

  private openEpaycoCheckout(sessionId: string): void {
    if (!isPlatformBrowser(this.platformId) || typeof ePayco === 'undefined') {
      this.subscribing.set(false);
      this.message.set({ type: 'error', text: 'No se pudo cargar el checkout de pagos' });
      return;
    }

    const checkout = ePayco.checkout.configure({
      sessionId,
      type: 'onpage',
      test: true,
    });

    checkout.setHooks({
      onCreated: (_data: any) => {
        this.message.set({ type: 'success', text: 'Checkout de pago abierto' });
      },
      onResponse: (_response: any) => {
        this.message.set({ type: 'success', text: 'Pago procesado correctamente' });
      },
      onErrors: (_error: any) => {
        this.message.set({ type: 'error', text: 'Error al procesar el pago' });
      },
      onClosed: (_errors: any) => {
        this.subscribing.set(false);
        this.subscriptionService.getMine().subscribe({
          next: (subscription) => this.subscription.set(subscription),
          error: () => undefined,
        });
      },
    });

    checkout.open();
  }

  cancel(): void {
    if (this.subscribing()) return;
    this.subscribing.set(true);
    this.message.set(null);

    this.subscriptionService.cancel().subscribe({
      next: (subscription) => {
        this.subscription.set(subscription);
        this.subscribing.set(false);
        this.message.set({ type: 'success', text: 'Suscripción cancelada' });
      },
      error: (err) => {
        this.subscribing.set(false);
        this.message.set({ type: 'error', text: err.error?.message ?? 'No se pudo cancelar la suscripción' });
      },
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  nextChargeLine(): string | null {
    const sub = this.subscription();
    if (!sub?.endsAt) return null;
    try {
      const date = new Date(sub.endsAt);
      if (Number.isNaN(date.getTime())) return null;
      const label = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
      return `Próximo cobro · ${label}`.toUpperCase();
    } catch {
      return null;
    }
  }

  scrollToPlans(): void {
    document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Comprobante real de la suscripción vigente (plan, precio y periodo). */
  downloadReceipt(): void {
    const sub = this.subscription();
    if (!sub) return;
    const name = this.restaurant()?.name ?? 'Mi restaurante';
    const period = `Desde ${sub.startsAt} · Hasta ${sub.endsAt ?? '—'}`;
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante ${sub.plan.name}</title></head><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#1c1917"><p style="font-size:11px;letter-spacing:2px;color:#78716c">TAVITA · ${name}</p><h1>Comprobante de suscripción</h1><p><strong>Plan:</strong> ${sub.plan.name}</p><p><strong>Valor:</strong> ${this.formatCurrency(sub.plan.priceMonthly)} / mes</p><p><strong>Periodo:</strong> ${period}</p><p><strong>Estado:</strong> ${sub.status}</p></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprobante-${sub.plan.code ?? 'plan'}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
