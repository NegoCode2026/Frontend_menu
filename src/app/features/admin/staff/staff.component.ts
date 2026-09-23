import { Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { AuthService } from '../../../core/services/auth.service';
import { Order, OrderStatus } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

/**
 * Tablero del turno para meseros/caja: pedidos en vivo por WebSocket
 * (con re-sincronización al reconectar), sonido de cocina y botones
 * grandes por rol. Sin polling agresivo: el socket avisa.
 */
@Component({
  selector: 'app-staff',
  imports: [BusinessMobileNavComponent],
  templateUrl: './staff.component.html',
})
export class StaffComponent implements OnInit, OnDestroy {
  private readonly ordersApi = inject(OrderService);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
  readonly live = this.realtime.connected;

  private wsSub?: Subscription;
  private readonly seenIds = new Set<number>();

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly filter = signal<'ACTIVE' | 'READY' | 'ALL'>('ACTIVE');
  readonly soundOn = signal(true);
  readonly flashId = signal<number | null>(null);

  readonly role = computed(() => {
    const raw = this.user()?.role ?? '';
    return raw.startsWith('ROLE_') ? raw.substring(5) : raw;
  });

  readonly isCashier = computed(() => this.role() === 'CASHIER' || this.role() === 'RESTAURANT_ADMIN');
  readonly isAdmin = computed(() => this.role() === 'RESTAURANT_ADMIN');

  readonly visible = computed(() => {
    const list = this.orders();
    switch (this.filter()) {
      case 'READY':
        return list.filter((o) => o.status === 'READY');
      case 'ALL':
        return list;
      default:
        return list.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    }
  });

  readonly activeCount = computed(
    () => this.orders().filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length
  );
  readonly readyCount = computed(() => this.orders().filter((o) => o.status === 'READY').length);

  ngOnInit(): void {
    this.fetchAll();
    try {
      this.wsSub = this.realtime.connect().subscribe({
        next: (event) => this.applyEvent(event.order, event.type === 'CREATED'),
        error: () => undefined,
      });
    } catch {
      // Sin restaurante en sesión: el guard ya redirige al login
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.realtime.disconnect();
  }

  fetchAll(): void {
    this.loading.set(true);
    this.ordersApi.listMine().subscribe({
      next: (list) => {
        const arr = Array.isArray(list) ? list : [];
        this.orders.set(arr);
        arr.forEach((o) => this.seenIds.add(o.id));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Evento WS: inserta/actualiza + chime si es pedido nuevo. */
  private applyEvent(order: Order, isNew: boolean): void {
    const firstTime = !this.seenIds.has(order.id);
    this.seenIds.add(order.id);
    this.orders.update((list) => {
      const idx = list.findIndex((o) => o.id === order.id);
      if (idx !== -1) {
        const copy = [...list];
        copy[idx] = order;
        return copy;
      }
      return [order, ...list];
    });
    if ((isNew || firstTime) && order.status === 'PENDING') {
      this.flashId.set(order.id);
      setTimeout(() => this.flashId.set(null), 8000);
      if (this.soundOn()) this.chime();
    }
  }

  advance(order: Order, status: OrderStatus): void {
    if (order.id == null) return;
    this.orders.update((list) => list.map((o) => (o.id === order.id ? { ...o, status } : o)));
    this.ordersApi.updateStatusMine(order.id, status).subscribe({
      next: (updated) =>
        this.orders.update((list) => list.map((o) => (o.id === updated.id ? updated : o))),
      error: () => this.fetchAll(),
    });
  }

  itemsSummary(order: Order): string {
    return (order.items ?? []).map((i) => `${i.quantity}x ${i.productName}`).join(' · ') || 'Sin detalle';
  }

  minutes(iso: string): string {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (Number.isNaN(mins)) return '';
    if (mins < 1) return 'ahora';
    return `hace ${mins} min`;
  }

  toggleSound(): void {
    this.soundOn.update((s) => !s);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value ?? 0);
  }

  private chime(): void {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      [587.33, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.3);
      });
      setTimeout(() => ctx.close(), 1000);
    } catch {}
  }
}
