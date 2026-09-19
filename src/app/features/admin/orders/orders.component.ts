import { Component, inject, signal, OnInit, computed, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { Order, OrderStatus } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-orders',
  imports: [RouterLink, BusinessMobileNavComponent],
  templateUrl: './orders.component.html',
})
export class OrdersComponent implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
  private orderSub?: Subscription;
  private pollingTimer?: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>;
  private pollCount = 0;
  private pollCountdownTimer?: ReturnType<typeof setInterval>;

  // Aggressive polling: 3s for the first 60s, then 12s
  private readonly FAST_POLL_MS = 3_000;
  private readonly SLOW_POLL_MS = 12_000;
  private readonly FAST_POLL_DURATION_S = 60;

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // View settings
  readonly viewMode = signal<'KANBAN' | 'LIST'>('LIST');
  readonly searchQuery = signal('');
  readonly statusFilter = signal<OrderStatus | 'ALL'>('ALL');
  readonly soundEnabled = signal(true);
  readonly openMenuId = signal<number | null>(null);
  readonly menuSlug = signal<string | null>(null);
  readonly isOpen = signal(true);

  // Selected order for Ticket / Detail Modal
  readonly selectedTicketOrder = signal<Order | null>(null);

  // New order alert banner
  readonly showAlert = signal(false);
  readonly alertCount = signal(0);

  // Session expired warning
  readonly sessionExpired = signal(false);

  // Live filtered orders
  readonly filteredOrders = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();

    return this.orders().filter((order) => {
      if (!order) return false;
      if (status !== 'ALL' && order.status !== status) {
        return false;
      }
      if (!query) return true;

      const matchNum = (order.orderNumber ?? '').toLowerCase().includes(query);
      const matchName = (order.customerName ?? '').toLowerCase().includes(query);
      const matchTable = (order.tableNumber || '').toLowerCase().includes(query);
      const matchPhone = (order.customerPhone || '').toLowerCase().includes(query);

      return matchNum || matchName || matchTable || matchPhone;
    });
  });

  /** Conteo para la pestaña "En preparación" (pedidos aceptados en cocina). */
  readonly confirmedCount = computed(() => this.orders().filter((o) => o && o.status === 'CONFIRMED').length);

  /** Conteo para la pestaña "Listos" (pedidos servidos). */
  readonly readyCount = computed(() => this.orders().filter((o) => o && o.status === 'DELIVERED').length);

  /** Etiqueta y píldora de estado para lectura rápida en cocina. */
  statusMeta(status: OrderStatus): { label: string; pill: string; dot: string } {
    switch (status) {
      case 'PENDING':
        return { label: 'Pendiente', pill: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' };
      case 'CONFIRMED':
      case 'IN_PREPARATION':
        return { label: 'En preparación', pill: 'bg-[#F9DFC2] text-[#B85C32] ring-[#EAC9A8]', dot: 'bg-[#D97745]' };
      case 'READY':
      case 'DELIVERED':
        return { label: 'Listo', pill: 'bg-[#E7F6EC] text-[#16A34A] ring-[#BFE6CC]', dot: 'bg-[#16A34A]' };
      default:
        return { label: 'Cancelado', pill: 'bg-stone-100 text-stone-500 ring-stone-200', dot: 'bg-stone-400' };
    }
  }

  /** Minutos desde la creación (null si fecha inválida). */
  minutesSince(isoString: string | null | undefined): number | null {
    try {
      if (!isoString) return null;
      const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
      return Number.isNaN(mins) ? null : Math.max(0, mins);
    } catch {
      return null;
    }
  }

  toggleMenu(id: number | null): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  /** Exporta los pedidos filtrados a CSV (compatible con Excel). */
  exportCsv(): void {
    const rows = this.filteredOrders();
    const cell = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      'Pedido,Fecha,Cliente,Mesa,Detalle,Total,Estado',
      ...rows.map((o) =>
        [
          cell(o.orderNumber),
          cell(o.createdAt),
          cell(o.customerName),
          cell(o.tableNumber ?? ''),
          cell(this.orderItemsSummary(o)),
          cell(o.totalAmount ?? 0),
          cell(o.status),
        ].join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /** Detalle compacto "2x Nombre · 1x Otro" para la tabla. */
  orderItemsSummary(order: Order): string {
    const items = order.items ?? [];
    if (items.length === 0) return 'Sin detalle';
    return items.map((i) => `${i.quantity}x ${i.productName}`).join(' · ');
  }

  /** Minutos desde la creación (null si fecha inválida). */
  orderMinutes(order: Order): number | null {
    try {
      if (!order.createdAt) return null;
      const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
      return Number.isNaN(mins) ? null : Math.max(0, mins);
    } catch {
      return null;
    }
  }

  /** Pedido no finalizado con 30+ minutos: requiere atención. */
  isLate(order: Order): boolean {
    const mins = this.orderMinutes(order);
    return mins !== null && mins >= 30 && order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  }

  // Kanban Columns
  readonly pendingOrders = computed(() =>
    this.filteredOrders().filter((o) => o.status === 'PENDING')
  );

  readonly inProgressOrders = computed(() =>
    this.filteredOrders().filter((o) => o.status === 'CONFIRMED')
  );

  readonly deliveredOrders = computed(() =>
    this.filteredOrders().filter((o) => o.status === 'DELIVERED')
  );

  readonly cancelledOrders = computed(() =>
    this.filteredOrders().filter((o) => o.status === 'CANCELLED')
  );

  // Stats Counters
  readonly totalActiveCount = computed(() =>
    this.orders().filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length
  );

  readonly totalRevenueToday = computed(() =>
    this.orders()
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + o.totalAmount, 0)
  );

  ngOnInit(): void {
    this.fetchOrders();
    this.restaurantService.getMine().subscribe({
      next: (r) => {
        this.menuSlug.set(r.slug);
        this.isOpen.set(r.open);
      },
      error: () => undefined,
    });

    // Listen to real-time incoming orders
    this.orderSub = this.orderService.onNewOrder$.subscribe((newOrder) => {
      this.orders.update((list) => {
        const existing = list.findIndex((o) => o.id === newOrder.id);
        if (existing !== -1) {
          const updated = [...list];
          updated[existing] = newOrder;
          return updated;
        }
        return [newOrder, ...list];
      });

      if (this.soundEnabled()) {
        this.playKitchenNotificationSound();
      }
    });

    // Polling: starts fast (3s) then slows down (12s) after 60s
    this.startPolling();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    this.orderSub?.unsubscribe();
    this.stopPolling();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  fetchOrders(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.orderService.listMine().subscribe({
      next: (data) => {
        this.orders.set(Array.isArray(data) ? data : []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  // --- Polling: detect new orders from other devices & fire alarm ---

  private startPolling(): void {
    this.pollCount = 0;
    this.pollForNewOrders(); // Immediate first poll
    this.scheduleNextPoll();

    // Countdown to switch from fast → slow polling
    this.pollCountdownTimer = setInterval(() => {
      if (this.pollCount >= this.FAST_POLL_DURATION_S) {
        this.stopPolling();
        this.startSlowPolling();
      }
    }, 1_000);
  }

  private scheduleNextPoll(): void {
    this.pollingTimer = setTimeout(() => {
      this.pollForNewOrders();
      this.scheduleNextPoll();
    }, this.FAST_POLL_MS);
  }

  private startSlowPolling(): void {
    this.pollCountdownTimer = undefined;
    this.pollingTimer = setInterval(() => this.pollForNewOrders(), this.SLOW_POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer as ReturnType<typeof setTimeout>);
      clearInterval(this.pollingTimer as ReturnType<typeof setInterval>);
      this.pollingTimer = undefined;
    }
    if (this.pollCountdownTimer) {
      clearInterval(this.pollCountdownTimer);
      this.pollCountdownTimer = undefined;
    }
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopPolling();
    } else {
      this.pollCount = 0;
      this.stopPolling();
      this.startPolling(); // Restart fast polling when page becomes visible again
    }
  };

  dismissAlert(): void {
    this.showAlert.set(false);
  }

  logout(): void {
    this.auth.forceLogout();
  }

  retryAfterReLogin(): void {
    this.sessionExpired.set(false);
    this.fetchOrders();
    this.startPolling();
  }

  private pollForNewOrders(): void {
    if (this.loading()) return;
    this.orderService.listMine(undefined, true).subscribe({
      next: (latest) => {
        this.sessionExpired.set(false);
        const current = this.orders();
        const currentIds = new Set(current.map((o) => o.id));
        const newOrders = latest.filter((o) => !currentIds.has(o.id));

        this.orders.set(latest);

        if (newOrders.length > 0) {
          this.alertCount.set(newOrders.length);
          this.showAlert.set(true);
          setTimeout(() => this.showAlert.set(false), 6_000);

          if (this.soundEnabled()) {
            this.playKitchenNotificationSound();
          }
        }
      },
      error: (err) => {
        if (err?.status === 401) {
          this.sessionExpired.set(true);
          this.stopPolling(); // Stop polling until user re-logs in
        }
      }
    });
  }

  updateStatus(order: Order, newStatus: OrderStatus): void {
    if (order.id == null) return;
    // Optimistic update
    this.orders.update((list) =>
      list.map((o) => (o && o.id === order.id ? { ...o, status: newStatus, updatedAt: new Date().toISOString() } : o))
    );

    if (this.selectedTicketOrder()?.id === order.id) {
      this.selectedTicketOrder.update((o) => (o ? { ...o, status: newStatus } : null));
    }

    this.orderService.updateStatusMine(order.id, newStatus).subscribe({
      next: () => {
        if (newStatus === 'DELIVERED' && order.customerPhone) {
          this.sendWhatsAppReadyNotification(order, true);
        }
      },
      error: (err) => {
        console.error('Error updating order status:', err);
      },
    });
  }

  sendWhatsAppReadyNotification(order: Order, openDirectly = false): void {
    if (!order.customerPhone) {
      alert('Este pedido no tiene un número de teléfono registrado.');
      return;
    }

    // Invocar endpoint del servidor backend
    this.orderService.notifyWhatsApp(order.id).subscribe();

    let cleanPhone = order.customerPhone.replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = '57' + cleanPhone;
    }

    const message = `¡Hola *${order.customerName}*! 👋\n\n🎉 *¡Tu pedido ${order.orderNumber} ya está listo!* 🍽️\n📍 *Destino/Mesa:* ${order.tableNumber || 'Mesa'}\n\nPuedes pasar a retirarlo o ya va en camino.\n¡Gracias por tu compra! 😊`;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    if (openDirectly) {
      window.open(waUrl, '_blank');
    }
  }

  openTicketModal(order: Order): void {
    this.selectedTicketOrder.set(order);
  }

  closeTicketModal(): void {
    this.selectedTicketOrder.set(null);
  }

  printTicket(): void {
    window.print();
  }

  simulateIncomingOrder(): void {
    const order = this.orderService.simulateNewOrder();
    this.openTicketModal(order);
  }

  toggleSound(): void {
    this.soundEnabled.update((s) => !s);
  }

  // Synthesized Web Audio chime for kitchen alerts (~5 seconds)
  private playKitchenNotificationSound(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const CHIME_INTERVAL_MS = 800;
      const TOTAL_DURATION_MS = 5000;
      const CHIMES = Math.ceil(TOTAL_DURATION_MS / CHIME_INTERVAL_MS);

      const playChime = (index: number) => {
        const t = ctx.currentTime;

        // First tone: D5
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, t);

        // Second tone: A5 (rises up for kitchen bell feel)
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(440.00, t);
        osc2.frequency.setValueAtTime(659.25, t + 0.06);

        const gain = ctx.createGain();
        // Slightly louder on first two chimes for attention
        const peakVol = index < 2 ? 0.35 : 0.25;
        gain.gain.setValueAtTime(peakVol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.35);
        osc2.stop(t + 0.35);
      };

      for (let i = 0; i < CHIMES; i++) {
        setTimeout(() => playChime(i), i * CHIME_INTERVAL_MS);
      }

      // Close the AudioContext after all chimes finish
      setTimeout(() => ctx.close(), TOTAL_DURATION_MS + 200);
    } catch {
      // Audio context might be restricted before interaction
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('es-CO');
    } catch {
      return '';
    }
  }

  formatTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  getTimeElapsed(isoString: string): string {
    try {
      const start = new Date(isoString).getTime();
      const now = Date.now();
      const mins = Math.floor((now - start) / 60000);
      if (mins < 1) return 'Hace un momento';
      if (mins === 1) return 'Hace 1 min';
      return `Hace ${mins} min`;
    } catch {
      return '';
    }
  }
}
