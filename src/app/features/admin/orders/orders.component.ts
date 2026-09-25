import { Component, HostListener, inject, signal, OnInit, computed, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { ProductService } from '../../../core/services/product.service';
import { AuthService } from '../../../core/services/auth.service';
import { StaffNotifyService, StaffNotifyKind } from '../../../core/services/staff-notify.service';
import { ToastService } from '../../../shared/ui/toast.service';
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
  private readonly toast = inject(ToastService);
  readonly staffNotify = inject(StaffNotifyService);
  /** Panel "Avisos" (preferencias opt-in del trabajador en este dispositivo). */
  readonly notifyOpen = signal(false);
  /** Cambios hechos por mí: no me auto-aviso cuando vuelven por el canal en vivo. */
  private readonly localChangeAt = new Map<number, number>();
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
  /** Posición fija del menú de fila (evita que el scroll de la tabla lo recorte). */
  readonly menuPos = signal<{ top: number; left: number } | null>(null);
  readonly menuOrder = computed(() => {
    const id = this.openMenuId();
    if (id == null) return null;
    return this.orders().find((o) => o && o.id === id) ?? null;
  });
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
  readonly formDiscount = signal<number | null>(null);
  readonly formTip = signal<number | null>(null);
  readonly formItems = signal<CreateOrderItemRequest[]>([]);
  readonly availableProducts = signal<Product[]>([]);
  readonly manualProductQuery = signal('');
  readonly manualProductsLoading = signal(false);
  readonly manualSaving = signal(false);
  readonly manualError = signal<string | null>(null);

  readonly manualOrderTypes: Array<{ value: OrderType; label: string }> = [
    { value: 'DINE_IN', label: 'Mesa' },
    { value: 'DELIVERY', label: 'Domicilio' },
    { value: 'TAKEAWAY', label: 'Para llevar' },
  ];

  readonly filteredManualProducts = computed(() => {
    const query = this.manualProductQuery().trim().toLowerCase();
    return this.availableProducts().filter((product) => {
      if (!product.available) return false;
      if (!query) return true;
      return `${product.name} ${product.description ?? ''}`.toLowerCase().includes(query);
    });
  });

  readonly manualItemCount = computed(() =>
    this.formItems().reduce((total, item) => total + item.quantity, 0)
  );

  readonly manualDestinationLabel = computed(() => {
    if (this.formOrderType() === 'DELIVERY') {
      return this.formDeliveryAddress().trim() || 'Dirección por confirmar';
    }
    if (this.formOrderType() === 'TAKEAWAY') return 'Para llevar';
    const table = this.formTable().trim();
    if (!table) return 'Mesa por confirmar';
    return /^mesa\s/i.test(table) ? table : `Mesa ${table}`;
  });

  readonly formTotal = computed(() => {
    const products = this.availableProducts();
    const subtotal = this.formItems().reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      return sum + (product?.price ?? 0) * item.quantity;
    }, 0);
    const discount = Math.min(Math.max(this.formDiscount() ?? 0, 0), subtotal);
    return subtotal - discount + Math.max(this.formTip() ?? 0, 0);
  });

  openCreateOrderModal(): void {
    this.editingOrder.set(null);
    this.formCustomerName.set('');
    this.formCustomerPhone.set('');
    this.formTable.set('');
    this.formDeliveryAddress.set('');
    this.formOrderType.set('DINE_IN');
    this.formNotes.set('');
    this.formDiscount.set(null);
    this.formTip.set(null);
    this.formItems.set([]);
    this.manualProductQuery.set('');
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
    this.formDiscount.set(order.discountAmount ?? null);
    this.formTip.set(order.tipAmount ?? null);
    this.formItems.set(
      (order.items ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes ?? '' }))
    );
    this.manualProductQuery.set('');
    this.manualError.set(null);
    this.loadManualProducts();
    this.manualModal.set('EDIT');
  }

  closeManualModal(): void {
    this.manualModal.set(null);
    this.editingOrder.set(null);
    this.manualError.set(null);
  }

  @HostListener('document:keydown.escape')
  closeTopModalOnEscape(): void {
    if (this.notifyOpen()) {
      this.closeNotifyPanel();
      return;
    }
    if (this.openMenuId() !== null) {
      this.closeRowMenu();
      return;
    }
    if (this.manualModal()) {
      this.closeManualModal();
      return;
    }
    if (this.selectedTicketOrder()) this.closeTicketModal();
  }

  @HostListener('window:resize')
  closeMenuOnResize(): void {
    if (this.openMenuId() !== null) this.closeRowMenu();
  }

  @HostListener('window:scroll')
  closeMenuOnScroll(): void {
    if (this.openMenuId() !== null) this.closeRowMenu();
  }

  closeManualModalFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeManualModal();
  }

  private loadManualProducts(): void {
    this.manualProductsLoading.set(true);
    this.productService.list(undefined, 0, 200).subscribe({
      next: (page) => {
        this.availableProducts.set(page?.content ?? []);
        this.manualProductsLoading.set(false);
      },
      error: () => {
        this.availableProducts.set([]);
        this.manualProductsLoading.set(false);
      },
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

  setManualDiscount(value: string): void {
    const parsed = Number(value);
    this.formDiscount.set(value.trim() === '' || !Number.isFinite(parsed) ? null : parsed);
  }

  setManualTip(value: string): void {
    const parsed = Number(value);
    this.formTip.set(value.trim() === '' || !Number.isFinite(parsed) ? null : parsed);
  }

  orderTypeLabel(type?: OrderType): string {
    return ORDER_TYPE_LABELS[type ?? 'DINE_IN'] ?? 'Mesa';
  }

  /** Destino mostrado en tarjetas y ticket: la dirección para domicilio, la mesa en el resto. */
  destinationLabel(order: Order): string {
    if (order?.orderType === 'DELIVERY') {
      return order.deliveryAddress || order.tableNumber || 'Dirección no indicada';
    }
    const table = order.tableNumber?.trim();
    if (!table) return 'Mesa';
    return /^mesa\s/i.test(table) ? table : `Mesa ${table}`;
  }

  customerNameForDisplay(order: Order): string | null {
    const name = (order?.customerName ?? '').trim();
    if (!name) return null;
    const normalizeDestination = (value: string): string =>
      value.trim().toLocaleLowerCase('es-CO').replace(/^mesa\s+/, '');
    const normalizedName = normalizeDestination(name);
    const normalizedDestination = normalizeDestination(this.destinationLabel(order));
    const fallbackNames = new Set(['mostrador', 'domicilio', 'para llevar']);
    return fallbackNames.has(normalizedName) || normalizedName === normalizedDestination ? null : name;
  }

  statusLabel(status: OrderStatus): string {
    return ORDER_STATUS_LABELS[status] ?? status;
  }

  saveManualOrder(): void {
    const items = this.formItems().filter((i) => i.quantity > 0);
    if (items.length === 0) {
      this.manualError.set('Agrega al menos un producto al pedido.');
      return;
    }

    const table = this.formTable().trim();
    const deliveryAddress = this.formDeliveryAddress().trim();
    if (this.formOrderType() === 'DINE_IN' && !table) {
      this.manualError.set('Escribe el número de mesa para continuar.');
      return;
    }
    if (this.formOrderType() === 'DELIVERY' && !deliveryAddress) {
      this.manualError.set('Escribe la dirección del domicilio para continuar.');
      return;
    }

    // El nombre no es un dato obligatorio en el flujo de mesa: si no existe,
    // el destino identifica el pedido y el backend recibe un fallback seguro.
    const fallbackName = this.formOrderType() === 'DELIVERY' ? 'Domicilio' : table || 'Mostrador';
    const customerName = this.formCustomerName().trim() || fallbackName;

    this.manualSaving.set(true);
    this.manualError.set(null);

    const createBase = {
      customerName,
      customerPhone: this.formCustomerPhone().trim() || undefined,
      orderType: this.formOrderType(),
      notes: this.formNotes().trim() || undefined,
      discountAmount: this.formDiscount() ?? null,
      tipAmount: this.formTip() ?? null,
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

    if (editing != null && editing.id != null) {
      const payload: UpdateOrderRequest = {
        customerName: createBase.customerName,
        customerPhone: createBase.customerPhone,
        orderType: createBase.orderType,
        notes: createBase.notes,
        items,
      };
      if (table) payload.tableNumber = table;
      if (deliveryAddress) payload.deliveryAddress = deliveryAddress;
      this.orderService.updateMine(editing.id, payload).subscribe({ next: finish, error: fail });
    } else {
      this.orderService
        .createMine({
          ...createBase,
          tableNumber: table || undefined,
          deliveryAddress: deliveryAddress || undefined,
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

  /** Menú de acciones por fila: posición fija para que no lo recorte el scroll de la tabla. */
  openRowMenu(event: MouseEvent, id: number): void {
    event.stopPropagation();
    if (this.openMenuId() === id) {
      this.closeRowMenu();
      return;
    }
    const anchor = event.currentTarget as HTMLElement | null;
    const rect = anchor?.getBoundingClientRect();
    const MENU_W = 208;
    const MENU_H = 260;
    const margin = 8;
    let left = (rect?.right ?? window.innerWidth - margin) - MENU_W;
    let top = (rect?.bottom ?? 0) + 6;
    left = Math.max(margin, Math.min(left, window.innerWidth - MENU_W - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - MENU_H - margin));
    this.menuPos.set({ top, left });
    this.openMenuId.set(id);
  }

  closeRowMenu(): void {
    this.openMenuId.set(null);
    this.menuPos.set(null);
  }

  toggleMenu(id: number | null): void {
    if (id === null) {
      this.closeRowMenu();
      return;
    }
    this.openMenuId.update((current) => (current === id ? null : id));
    if (this.openMenuId() === null) this.menuPos.set(null);
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
    this.staffNotify.init(this.auth.user()?.id);
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

  /** Evento del canal en vivo: inserta/actualiza y avisa según preferencia del trabajador. */
  private applyLiveOrder(order: Order): void {
    if (order?.id == null) return;
    const isNew = !this.seenIds.has(order.id);
    this.seenIds.add(order.id);
    const prev = this.orders().find((o) => o && o.id === order.id) ?? null;
    this.orders.update((list) => {
      const idx = list.findIndex((o) => o && o.id === order.id);
      if (idx !== -1) {
        const copy = [...list];
        copy[idx] = order;
        return copy;
      }
      return [order, ...list];
    });
    if (this.isSelfChange(order.id)) return;
    const kind = this.eventKind(order, prev, isNew);
    if (kind === 'NEW') {
      this.alertCount.set(1);
      this.showAlert.set(true);
      setTimeout(() => this.showAlert.set(false), 6_000);
      if (this.soundEnabled()) {
        this.playKitchenNotificationSound();
      }
    } else if (kind === 'READY' && this.soundEnabled()) {
      this.playKitchenNotificationSound();
    }
    if (kind) this.staffAlert(kind, order);
  }

  /** Clasifica un evento en un tipo de aviso (null = no avisar). */
  private eventKind(order: Order, prev: Order | null, isNew: boolean): StaffNotifyKind | null {
    if (prev && !prev.paymentMethod && order.paymentMethod) return 'PAID';
    if (isNew && order.status === 'PENDING') return 'NEW';
    if (prev && prev.status !== order.status) {
      switch (order.status) {
        case 'READY':
          return 'READY';
        case 'DELIVERED':
          return 'DELIVERED';
        case 'CANCELLED':
          return 'CANCELLED';
        default:
          return null;
      }
    }
    return null;
  }

  /** Aviso dentro de la app + navegador (si el trabajador lo activó). */
  private staffAlert(kind: StaffNotifyKind, order: Order): void {
    if (!this.staffNotify.wants(kind)) return;
    const dest = this.destinationLabel(order);
    const total = this.formatCurrency(order.totalAmount);
    const count = `${(order.items ?? []).length} platos`;
    let title = '';
    let body = '';
    switch (kind) {
      case 'NEW':
        title = `Nuevo pedido #${order.orderNumber}`;
        body = `${dest} · ${count} · ${total}`;
        break;
      case 'READY':
        title = `¡Listo #${order.orderNumber}!`;
        body = `${dest} · ${count}`;
        break;
      case 'DELIVERED':
        title = `Servido #${order.orderNumber}`;
        body = `${dest} · pasó a caja · ${total}`;
        break;
      case 'PAID':
        title = `Cobrado #${order.orderNumber}`;
        body = `${this.paymentLabel(order.paymentMethod)} · ${total}`;
        break;
      case 'CANCELLED':
        title = `Cancelado #${order.orderNumber}`;
        body = dest;
        break;
    }
    if (kind === 'NEW') {
      this.toast.info(title, body);
    } else if (kind === 'CANCELLED') {
      this.toast.warning(title, body);
    } else {
      this.toast.success(title, body);
    }
    this.staffNotify.pushBrowser(title, body);
  }

  /** Marca un cambio hecho por mí para no auto-avisarmelo al volver por el canal. */
  private markLocalChange(orderId: number): void {
    this.localChangeAt.set(orderId, Date.now());
  }

  private isSelfChange(orderId: number): boolean {
    const at = this.localChangeAt.get(orderId);
    if (at == null) return false;
    if (Date.now() - at > 10_000) {
      this.localChangeAt.delete(orderId);
      return false;
    }
    return true;
  }

  toggleNotifyPanel(event: MouseEvent): void {
    event.stopPropagation();
    this.notifyOpen.update((v) => !v);
  }

  closeNotifyPanel(): void {
    this.notifyOpen.set(false);
  }

  async enableBrowserPush(): Promise<void> {
    const granted = await this.staffNotify.enableBrowser();
    if (granted) {
      this.toast.success('Avisos activados', 'Te llegarán aunque la pestaña esté en fondo.');
    } else {
      this.toast.warning('Sin permiso', 'El navegador bloqueó los avisos: actívalos en el candado de la barra.');
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

        // Cambios de estado detectados por polling (respaldo del WebSocket):
        // avisa según la preferencia de cada trabajador.
        const prevById = new Map<number, Order>(current.map((o) => [o.id, o]));
        for (const fresh of updatedList) {
          const prev = prevById.get(fresh.id);
          if (!prev || this.isSelfChange(fresh.id)) continue;
          const changedKind = this.eventKind(fresh, prev, false);
          if (changedKind && changedKind !== 'NEW') this.staffAlert(changedKind, fresh);
        }

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
    this.markLocalChange(order.id);
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
    this.markLocalChange(order.id);
    this.orderService.payOrder(order.id, method).subscribe({
      next: (updated) => {
        this.orders.update((list) => list.map((o) => (o && o.id === order.id ? updated : o)));
        if (this.selectedTicketOrder()?.id === order.id) {
          this.selectedTicketOrder.set(updated);
        }
        this.toast.success('Cobro registrado', `${this.destinationLabel(order)} · ${this.formatCurrency(order.totalAmount)}`);
      },
      error: (err) => this.toast.error('No se pudo cobrar', err?.error?.message ?? 'Inténtalo de nuevo.'),
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
      this.toast.warning('Sin teléfono', 'Este pedido no tiene un número registrado para avisar por WhatsApp.');
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

    const customer = this.customerNameForDisplay(order);
    const greeting = customer ? `¡Hola *${customer}*!` : '¡Hola!';
    const message = `${greeting} 👋\n\n🎉 *¡Tu pedido ${order.orderNumber} ya está listo!* 🍽️\n${destinationLine}\n\nPuedes pasar a retirarlo o ya va en camino.\n¡Gracias por tu compra! 😊`;

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
