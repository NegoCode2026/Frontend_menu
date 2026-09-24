import { Component, inject, signal, OnInit, computed, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { ProductService } from '../../../core/services/product.service';
import { AuthService } from '../../../core/services/auth.service';
import { CreateOrderItemRequest, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, Order, OrderStatus, OrderType, PaymentMethod, Product, UpdateOrderRequest } from '../../../core/models/models';
import { BusinessMobileNavComponent } from '../business-mobile-nav/business-mobile-nav.component';

@Component({
  selector: 'app-orders',
  imports: [RouterLink, BusinessMobileNavComponent],
  templateUrl: './orders.component.html',
})
export class OrdersComponent implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderService);
  private readonly realtime = inject(RealtimeService);
  private readonly productService = inject(ProductService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
  /** WebSocket staff: true cuando el canal en vivo está conectado. */
  readonly live = this.realtime.connected;
  private orderSub?: Subscription;
  private wsSub?: Subscription;
  private readonly seenIds = new Set<number>();
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

  // Sin conexión: la cocina sigue viendo lo cargado y las acciones se encolan
  readonly offline = signal(!this.isBrowserOnline());
  /** Ids con cambio de estado pendiente de envío. */
  readonly pendingIds = signal<number[]>([]);
  private outbox: Array<{ orderId: number; status: OrderStatus }> = [];

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
      const matchAddress = (order.deliveryAddress || '').toLowerCase().includes(query);
      const matchPhone = (order.customerPhone || '').toLowerCase().includes(query);

      return matchNum || matchName || matchTable || matchAddress || matchPhone;
    });
  });

  /** Conteo para la pestaña "En preparación" (pedidos aceptados en cocina). */
  readonly confirmedCount = computed(() => this.orders().filter((o) => o && o.status === 'CONFIRMED').length);

  /** Conteo para la pestaña "Listos" (pedidos listos para servir, servidos). */
  readonly readyCount = computed(() => this.orders().filter((o) => o && (o.status === 'READY' || o.status === 'DELIVERED')).length);

  // --- Pedido manual (crear / editar) ---
  readonly manualModal = signal<'CREATE' | 'EDIT' | null>(null);
  readonly editingOrder = signal<Order | null>(null);
  readonly formCustomerName = signal('');
  readonly formCustomerPhone = signal('');
  readonly formTable = signal('');
  readonly formDeliveryAddress = signal('');
  readonly formOrderType = signal<OrderType>('DINE_IN');
  readonly formNotes = signal('');
  readonly formItems = signal<CreateOrderItemRequest[]>([]);
  readonly availableProducts = signal<Product[]>([]);
  readonly manualSaving = signal(false);
  readonly manualError = signal<string | null>(null);

  readonly formTotal = computed(() => {
    const products = this.availableProducts();
    return this.formItems().reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      return sum + (product?.price ?? 0) * item.quantity;
    }, 0);
  });

  openCreateOrderModal(): void {
    this.editingOrder.set(null);
    this.formCustomerName.set('');
    this.formCustomerPhone.set('');
    this.formTable.set('');
    this.formDeliveryAddress.set('');
    this.formOrderType.set('DINE_IN');
    this.formNotes.set('');
    this.formItems.set([]);
    this.manualError.set(null);
    this.loadManualProducts();
    this.manualModal.set('CREATE');
  }

  openEditOrderModal(order: Order): void {
    this.editingOrder.set(order);
    this.formCustomerName.set(order.customerName);
    this.formCustomerPhone.set(order.customerPhone ?? '');
    this.formTable.set(order.tableNumber ?? '');
    this.formDeliveryAddress.set(order.deliveryAddress ?? '');
    this.formOrderType.set(order.orderType ?? 'DINE_IN');
    this.formNotes.set(order.notes ?? '');
    this.formItems.set(
      (order.items ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes ?? '' }))
    );
    this.manualError.set(null);
    this.loadManualProducts();
    this.manualModal.set('EDIT');
  }

  closeManualModal(): void {
    this.manualModal.set(null);
    this.editingOrder.set(null);
    this.manualError.set(null);
  }

  private loadManualProducts(): void {
    this.productService.list(undefined, 0, 200).subscribe({
      next: (page) => this.availableProducts.set(page?.content ?? []),
      error: () => this.availableProducts.set([]),
    });
  }

  manualItemProduct(productId: number): Product | undefined {
    return this.availableProducts().find((p) => p.id === productId);
  }

  addManualProduct(productId: number): void {
    this.formItems.update((items) => {
      const existing = items.find((i) => i.productId === productId);
      if (existing) {
        return items.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...items, { productId, quantity: 1, notes: '' }];
    });
  }

  changeManualQuantity(productId: number, delta: number): void {
    this.formItems.update((items) =>
      items
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  removeManualProduct(productId: number): void {
    this.formItems.update((items) => items.filter((i) => i.productId !== productId));
  }

  isManualItemSelected(productId: number): boolean {
    return this.formItems().some((i) => i.productId === productId);
  }

  orderTypeLabel(type?: OrderType): string {
    return ORDER_TYPE_LABELS[type ?? 'DINE_IN'] ?? 'Mesa';
  }

  /** Destino mostrado en tarjetas y ticket: la dirección para domicilio, la mesa en el resto. */
  destinationLabel(order: Order): string {
    if (order?.orderType === 'DELIVERY') {
      return order.deliveryAddress || order.tableNumber || 'Dirección no indicada';
    }
    return order.tableNumber || 'Mesa';
  }

  statusLabel(status: OrderStatus): string {
    return ORDER_STATUS_LABELS[status] ?? status;
  }

  saveManualOrder(): void {
    if (!this.formCustomerName().trim()) {
      this.manualError.set('Ingresa el nombre del cliente.');
      return;
    }
    const items = this.formItems().filter((i) => i.quantity > 0);
    if (items.length === 0) {
      this.manualError.set('Agrega al menos un producto al pedido.');
      return;
    }

    this.manualSaving.set(true);
    this.manualError.set(null);

    const createBase = {
      customerName: this.formCustomerName().trim(),
      customerPhone: this.formCustomerPhone().trim() || undefined,
      orderType: this.formOrderType(),
      notes: this.formNotes().trim() || undefined,
      items,
    };

    const editing = this.editingOrder();
    const finish = (order: Order) => {
      this.orders.update((list) => {
        const existing = list.findIndex((o) => o.id === order.id);
        if (existing !== -1) {
          const updated = [...list];
          updated[existing] = order;
          return updated;
        }
        return [order, ...list];
      });
      this.manualSaving.set(false);
      this.closeManualModal();
    };
    const fail = (err: unknown) => {
      this.manualSaving.set(false);
      this.manualError.set(typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : 'No se pudo guardar el pedido.');
    };
    const deliveryAddress = this.formDeliveryAddress().trim() || undefined;

    if (editing != null && editing.id != null) {
      const payload: UpdateOrderRequest = {
        customerName: createBase.customerName,
        customerPhone: createBase.customerPhone,
        orderType: createBase.orderType,
        notes: createBase.notes,
        items,
      };
      if (this.formTable().trim()) payload.tableNumber = this.formTable().trim();
      if (deliveryAddress) payload.deliveryAddress = deliveryAddress;
      this.orderService.updateMine(editing.id, payload).subscribe({ next: finish, error: fail });
    } else {
      const table = this.formTable().trim();
      this.orderService
        .createMine({
          ...createBase,
          tableNumber: table || undefined,
          deliveryAddress,
        })
        .subscribe({ next: finish, error: fail });
    }
  }

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
    this.filteredOrders().filter((o) => o.status === 'CONFIRMED' || o.status === 'IN_PREPARATION')
  );

  readonly deliveredOrders = computed(() =>
    this.filteredOrders().filter((o) => o.status === 'READY' || o.status === 'DELIVERED')
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
    // (respaldo por si el WebSocket se cae; el canal en vivo avisa al instante)
    this.startPolling();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);

    // Canal en vivo: el pedido del cliente entra sin esperar el polling
    try {
      this.wsSub = this.realtime.connect().subscribe({
        next: (event) => this.applyLiveOrder(event.order),
        error: () => undefined,
      });
    } catch {
      // Sin restaurante en sesión: el guard ya redirige al login
    }
  }

  ngOnDestroy(): void {
    this.orderSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.realtime.disconnect();
    this.stopPolling();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  private isBrowserOnline(): boolean {
    try {
      return typeof navigator === 'undefined' || navigator.onLine !== false;
    } catch {
      return true;
    }
  }

  private readonly onOnline = (): void => {
    this.offline.set(false);
    this.fetchOrders();
    this.flushOutbox();
    this.pollCount = 0;
    this.stopPolling();
    this.startPolling();
  };

  private readonly onOffline = (): void => {
    this.offline.set(true);
  };

  isPending(orderId: number | null | undefined): boolean {
    return orderId != null && this.pendingIds().includes(orderId);
  }

  fetchOrders(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.lastSyncIso = null;
    this.orderService.listMine().subscribe({
      next: (data) => {
        const arr = Array.isArray(data) ? data : [];
        this.orders.set(arr);
        arr.forEach((o) => {
          if (o?.id != null) this.seenIds.add(o.id);
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  /** Evento del canal en vivo: inserta/actualiza y alerta si es pedido nuevo. */
  private applyLiveOrder(order: Order): void {
    if (order?.id == null) return;
    const isNew = !this.seenIds.has(order.id);
    this.seenIds.add(order.id);
    this.orders.update((list) => {
      const idx = list.findIndex((o) => o && o.id === order.id);
      if (idx !== -1) {
        const copy = [...list];
        copy[idx] = order;
        return copy;
      }
      return [order, ...list];
    });
    if (isNew && order.status === 'PENDING') {
      this.alertCount.set(1);
      this.showAlert.set(true);
      setTimeout(() => this.showAlert.set(false), 6_000);
      if (this.soundEnabled()) {
        this.playKitchenNotificationSound();
      }
    }
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

  private lastSyncIso: string | null = null;
  private pollTicks = 0;
  private readonly FULL_REFRESH_TICKS = 5;

  private pollForNewOrders(): void {
    if (this.loading()) return;
    this.pollTicks += 1;

    // Cada N sondeos se hace recarga completa para reconciliar pedidos borrados/ajustes.
    const doFullRefresh = this.lastSyncIso === null || this.pollTicks % this.FULL_REFRESH_TICKS === 0;
    const since = doFullRefresh ? undefined : this.lastSyncIso ?? undefined;

    this.orderService.listMine(undefined, true, since).subscribe({
      next: (latest) => {
        this.sessionExpired.set(false);
        const wasOffline = this.offline();
        this.offline.set(false);
        this.lastSyncIso = new Date().toISOString();

        const current = this.orders();
        let newOrders: Order[] = [];
        let updatedList: Order[] = latest;

        if (since) {
          const byId = new Map<number, Order>(current.map((o) => [o.id, o]));
          newOrders = latest.filter((o) => !byId.has(o.id));
          for (const fresh of latest) byId.set(fresh.id, fresh);
          updatedList = [...byId.values()].sort((a, b) =>
            String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
          );
        } else {
          const currentIds = new Set(current.map((o) => o.id));
          newOrders = latest.filter((o) => !currentIds.has(o.id));
        }

        this.orders.set(updatedList);

        // Si volvió la conexión, reenvía lo encolado
        if (wasOffline) this.flushOutbox();

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
        } else if (err?.status === 0 || err?.status == null) {
          // Backend inalcanzable (túnel/Supabase caídos): se conserva lo
          // cargado, se avisa y el propio polling reintenta solo.
          this.offline.set(true);
        }
      }
    });
  }

  /** Reenvía cambios de estado encolados sin conexión, en orden. */
  private flushOutbox(): void {
    if (this.outbox.length === 0 || this.offline()) return;
    const batch = [...this.outbox];
    this.outbox = [];
    const sendNext = (): void => {
      const item = batch.shift();
      if (!item) return;
      this.orderService.updateStatusMine(item.orderId, item.status).subscribe({
        next: (updated) => {
          this.orders.update((list) => list.map((o) => (o && o.id === item.orderId ? updated : o)));
          this.pendingIds.update((ids) => ids.filter((id) => id !== item.orderId));
          sendNext();
        },
        error: (err) => {
          if (err?.status === 0 || err?.status == null) {
            this.outbox.unshift(item, ...batch);
            this.offline.set(true);
          } else {
            this.pendingIds.update((ids) => ids.filter((id) => id !== item.orderId));
            this.fetchOrders();
            sendNext();
          }
        },
      });
    };
    sendNext();
  }

  private markPending(orderId: number): void {
    this.pendingIds.update((ids) => (ids.includes(orderId) ? ids : [...ids, orderId]));
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
      next: (updated) => {
        this.offline.set(false);
        this.orders.update((list) =>
          list.map((o) => (o && o.id === order.id ? updated : o))
        );
        if (this.selectedTicketOrder()?.id === order.id) {
          this.selectedTicketOrder.set(updated);
        }
      },
      error: (err) => {
        if (err?.status === 401) {
          this.sessionExpired.set(true);
          this.stopPolling();
          return;
        }
        if (err?.status === 0 || err?.status == null) {
          // Sin conexión: se conserva el cambio optimista, se marca
          // pendiente y se reenvía solo al volver.
          this.offline.set(true);
          this.outbox = this.outbox.filter((q) => q.orderId !== order.id);
          this.outbox.push({ orderId: order.id, status: newStatus });
          this.markPending(order.id);
          return;
        }
        console.error('Error updating order status:', err);
        this.fetchOrders();
      },
    });
  }

  /** Cobra un pedido entregado. Solo cajero/admin (el guard de ruta lo limita). */
  payOrder(order: Order, method: PaymentMethod): void {
    if (order.id == null) return;
    this.orderService.payOrder(order.id, method).subscribe({
      next: (updated) => {
        this.orders.update((list) => list.map((o) => (o && o.id === order.id ? updated : o)));
        if (this.selectedTicketOrder()?.id === order.id) {
          this.selectedTicketOrder.set(updated);
        }
      },
      error: (err) => console.error('Error cobrando pedido:', err),
    });
  }

  paymentLabel(method: PaymentMethod | null | undefined): string {
    switch (method) {
      case 'CASH':
        return '💵 Efectivo';
      case 'CARD':
        return '💳 Tarjeta';
      case 'TRANSFER':
        return '📲 Transferencia';
      default:
        return 'Sin cobrar';
    }
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
    const destination = this.destinationLabel(order);
    const destinationLine =
      order.orderType === 'DELIVERY'
        ? `📍 *Dirección de entrega:* ${destination}`
        : `📍 *Destino/Mesa:* ${destination}`;

    const message = `¡Hola *${order.customerName}*! 👋\n\n🎉 *¡Tu pedido ${order.orderNumber} ya está listo!* 🍽️\n${destinationLine}\n\nPuedes pasar a retirarlo o ya va en camino.\n¡Gracias por tu compra! 😊`;

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
