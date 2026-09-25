import { Component, HostListener, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashService, CashToday } from '../../../core/services/cash.service';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { Order, PaymentMethod } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-cash',
  imports: [FormsModule, BusinessMobileNavComponent],
  templateUrl: './cash.component.html',
})
export class CashComponent implements OnInit {
  private readonly cashApi = inject(CashService);
  private readonly orderApi = inject(OrderService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;

  readonly today = signal<CashToday | null>(null);
  readonly loading = signal(true);
  readonly counted = signal<number | null>(null);
  readonly notes = signal('');
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly okMessage = signal<string | null>(null);
  /** La sesión murió (401): hay que volver a entrar, no reintentar. */
  readonly sessionExpired = signal(false);
  /** Fallo de red o respuesta inesperada: reintentar suele resolverlo. */
  readonly connectionError = signal(false);

  // --- Cobro de pedidos entregados sin pagar ---
  readonly payingOrder = signal<Order | null>(null);
  readonly payMethod = signal<PaymentMethod>('CASH');
  readonly paySaving = signal(false);

  readonly paymentMethods: Array<{ value: PaymentMethod; label: string; hint: string }> = [
    { value: 'CASH', label: 'Efectivo', hint: 'Billetes que entraron a caja' },
    { value: 'CARD', label: 'Tarjeta', hint: 'Débito o crédito' },
    { value: 'TRANSFER', label: 'Transferencia', hint: 'Nequi, Daviplata o banco' },
  ];

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.connectionError.set(false);
    this.cashApi.today().subscribe({
      next: (t) => {
        if (!t || typeof t !== 'object') {
          // Respuesta con forma inesperada (p. ej. página del proxy tras un
          // despliegue o un corte a mitad de camino): no reventar, avisar.
          this.loading.set(false);
          this.connectionError.set(true);
          this.errorMessage.set('El servidor respondió algo inesperado. Reintenta en un momento.');
          return;
        }
        this.sessionExpired.set(false);
        this.today.set(t);
        if (t.closing) {
          this.counted.set(t.closing.countedCash);
          this.notes.set(t.closing.notes ?? '');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 401) {
          this.sessionExpired.set(true);
          this.errorMessage.set(null);
          return;
        }
        if (!err || err.status === 0) {
          this.connectionError.set(true);
          this.errorMessage.set('No se pudo conectar con el servidor. Revisa tu internet o espera a que despierte e inténtalo de nuevo.');
          return;
        }
        this.errorMessage.set(err?.error?.message ?? 'No se pudo cargar la caja');
      },
    });
  }

  goLogin(): void {
    this.auth.redirectToLogin();
  }

  difference(): number {
    const t = this.today();
    if (!t || this.counted() == null) return 0;
    return (this.counted() ?? 0) - (t.expectedCash ?? 0);
  }

  /** Pedidos entregados del día que todavía no registran pago. */
  unpaidOrders(): Order[] {
    const list = this.today()?.unpaidOrders;
    return Array.isArray(list) ? list : [];
  }

  /** Historial del día: qué se cobró y por cuánto (lo más reciente primero). */
  paidOrders(): Order[] {
    const list = this.today()?.paidOrders;
    return Array.isArray(list) ? list : [];
  }

  paidTotal(): number {
    return this.paidOrders().reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);
  }

  methodMeta(method: PaymentMethod | null | undefined): { pill: string; icon: string; label: string } {
    switch (method) {
      case 'CASH':
        return { pill: 'bg-amber-100 text-amber-800', icon: '💵', label: 'Efectivo' };
      case 'CARD':
        return { pill: 'bg-sky-100 text-sky-800', icon: '💳', label: 'Tarjeta' };
      case 'TRANSFER':
        return { pill: 'bg-violet-100 text-violet-800', icon: '📲', label: 'Transf.' };
      default:
        return { pill: 'bg-stone-100 text-stone-500', icon: '🧾', label: 'Sin método' };
    }
  }

  /** Hora del cobro (paidAt; si falta, última actualización). */
  paidTime(order: Order): string {
    try {
      const iso = order.paidAt ?? order.updatedAt;
      if (!iso) return '';
      return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  /** Mesa, dirección o modalidad: identifica el pedido sin pedir nombre. */
  destinationLabel(order: Order): string {
    if (order?.orderType === 'DELIVERY') return order.deliveryAddress || 'Domicilio';
    const table = order.tableNumber?.trim();
    if (!table) return order.orderType === 'TAKEAWAY' ? 'Para llevar' : 'Mostrador';
    return /^mesa\s/i.test(table) ? table : `Mesa ${table}`;
  }

  itemsSummary(order: Order): string {
    const items = order?.items ?? [];
    if (items.length === 0) return 'Sin platos registrados';
    return items.map((item) => `${item.quantity}× ${item.productName}`).join(' · ');
  }

  openPay(order: Order): void {
    if (this.paySaving()) return;
    this.errorMessage.set(null);
    this.payMethod.set('CASH');
    this.payingOrder.set(order);
  }

  closePay(): void {
    if (this.paySaving()) return;
    this.payingOrder.set(null);
  }

  @HostListener('document:keydown.escape')
  closePayOnEscape(): void {
    this.closePay();
  }

  confirmPay(): void {
    const order = this.payingOrder();
    if (!order || this.paySaving()) return;

    this.paySaving.set(true);
    this.errorMessage.set(null);
    this.orderApi.payOrder(order.id, this.payMethod()).subscribe({
      next: () => {
        this.paySaving.set(false);
        this.payingOrder.set(null);
        this.okMessage.set(`Pago de ${this.destinationLabel(order)} registrado`);
        this.reload();
      },
      error: (err) => {
        this.paySaving.set(false);
        if (err?.status === 401) {
          this.sessionExpired.set(true);
          return;
        }
        this.errorMessage.set(err.error?.message ?? 'No se pudo registrar el pago');
      },
    });
  }

  close(): void {
    if (this.counted() == null || this.counted()! < 0 || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.okMessage.set(null);
    this.cashApi.close(this.counted()!, this.notes() || null).subscribe({
      next: () => {
        this.saving.set(false);
        this.okMessage.set('Caja cerrada correctamente');
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        if (err?.status === 401) {
          this.sessionExpired.set(true);
          return;
        }
        this.errorMessage.set(err.error?.message ?? 'No se pudo cerrar la caja');
      },
    });
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value ?? 0);
  }
}
