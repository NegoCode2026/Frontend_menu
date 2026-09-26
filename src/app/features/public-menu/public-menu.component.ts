import { Component, effect, inject, input, signal, computed, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MenuService } from '../../core/services/menu.service';
import { OrderService } from '../../core/services/order.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { CartItem, Order, OrderStatus, OrderType, PublicMenu } from '../../core/models/models';
import { PwaBannerComponent } from '../../shared/pwa-banner/pwa-banner.component';

interface DishModalItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  categoryName?: string;
}

@Component({
  selector: 'app-public-menu',
  imports: [ReactiveFormsModule, RouterLink, PwaBannerComponent],
  templateUrl: './public-menu.component.html',
})
export class PublicMenuComponent implements OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly orderService = inject(OrderService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly slug = input<string>('');

  readonly menu = signal<PublicMenu | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly activeCategory = signal<number | null>(null);

  // Search signals
  readonly searchQuery = signal('');

  // Dish detail modal
  readonly selectedDish = signal<DishModalItem | null>(null);
  readonly dishDetailQuantity = signal(1);
  readonly dishDetailNotes = signal('');

  // Cart & Ordering
  readonly cart = signal<CartItem[]>([]);
  readonly showCartModal = signal(false);
  readonly submittingOrder = signal(false);
  readonly orderSuccess = signal<Order | null>(null);
  readonly orderErrorMessage = signal<string | null>(null);

  // Invoice view / download modal
  readonly showInvoiceModal = signal(false);
  readonly invoiceOrder = signal<Order | null>(null);

  // Seguimiento del pedido de esta sesión
  readonly trackingOpen = signal(false);
  readonly trackingLoading = signal(false);
  readonly trackingOrder = signal<Order | null>(null);
  readonly trackedOrders = signal<Order[]>([]);
  private trackingTimer: ReturnType<typeof setInterval> | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  // Order Type: DINE_IN, DELIVERY, TAKEAWAY
  readonly orderType = signal<OrderType>('DINE_IN');
  readonly selectedTablePreset = signal<string>('1');

  /** true cuando el QR viene de una mesa específica (?mesa=N): la mesa y el
   *  tipo de pedido quedan bloqueados para el cliente. */
  readonly tableLocked = signal(false);

  /** WhatsApp del restaurante, si existe (sin números de prueba). */
  readonly contactPhone = computed(() => {
    const r = this.menu()?.restaurant;
    const phone = r?.whatsapp || r?.phone || '';
    return phone.replace(/\D/g, '');
  });

  readonly orderForm: FormGroup = this.fb.group({
    customerName: ['', [Validators.required, Validators.maxLength(120)]],
    customerPhone: ['', [Validators.maxLength(30)]],
    tableNumber: ['Mesa 1', [Validators.maxLength(40)]],
    deliveryAddress: [''],
    notes: [''],
  });

  readonly cartTotalCount = computed(() =>
    this.cart().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly cartTotalAmount = computed(() =>
    this.cart().reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  );

  /** Propina voluntaria del cliente (% del subtotal). */
  readonly tipPercent = signal<0 | 5 | 10>(0);
  readonly tipAmount = computed(() => Math.round(this.cartTotalAmount() * (this.tipPercent() / 100)));
  readonly cartTotalWithTip = computed(() => this.cartTotalAmount() + this.tipAmount());

  setTip(pct: 0 | 5 | 10): void {
    this.tipPercent.set(pct);
  }

  /** El dueño puede cerrar el restaurante: se bloquea todo pedido. */
  readonly isClosed = computed(() => this.menu()?.restaurant.open === false);

  /** Tiempo estimado de preparación configurado por el restaurante */
  readonly estimatedPrepTime = computed(
    () => this.menu()?.restaurant.estimatedPrepTime || '20-30 min'
  );

  // Filtered categories & products based on search
  readonly filteredCategories = computed(() => {
    const currentMenu = this.menu();
    if (!currentMenu) return [];

    const query = this.searchQuery().trim().toLowerCase();

    return currentMenu.categories
      .map((category) => {
        const filteredProducts = category.products.filter((product) => {
          if (!product) return false;
          return (
            !query ||
            (product.name ?? '').toLowerCase().includes(query) ||
            (product.description && product.description.toLowerCase().includes(query))
          );
        });

        return {
          ...category,
          products: filteredProducts,
        };
      })
      .filter((cat) => cat.products.length > 0);
  });

  constructor() {
    // Check query params for table / mesa preset and search dish
    this.route.queryParamMap.subscribe((params) => {
      const mesa = params.get('mesa') || params.get('table') || params.get('m');
      if (mesa) {
        this.tableLocked.set(true);
        this.orderType.set('DINE_IN');
        this.selectedTablePreset.set(mesa);
        this.orderForm.patchValue({ tableNumber: `Mesa ${mesa}` });
      }

      const q = params.get('q');
      if (q) {
        this.searchQuery.set(q);
      }
    });

    effect(() => {
      const slugVal = this.slug().trim() || 'negobistro-gourmet';
      this.loading.set(true);
      this.errorMessage.set(null);

      this.menuService.getPublicMenu(slugVal).subscribe({
        next: (menuData) => {
          this.menu.set(menuData);
          if (menuData.categories.length > 0) {
            this.activeCategory.set(menuData.categories[0].id);
          }
          const restaurantSlug = menuData.restaurant?.slug || slugVal;
          this.trackedOrders.set(this.orderService.listTrackedOrders(restaurantSlug));
          this.startStatusPolling();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('No se pudo cargar el menú.');
          this.loading.set(false);
        },
      });
    });
  }

  setCategory(id: number): void {
    this.activeCategory.set(id);
    // Smooth scroll to category anchor
    const el = document.getElementById(`category-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  focusSearch(): void {
    document.getElementById('menu-search')?.focus({ preventScroll: false });
    document.getElementById('menu-search')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  // Dish modal
  openDishModal(product: { id: number; name: string; description: string | null; price: number; imageUrl: string | null }, categoryName?: string): void {
    this.selectedDish.set({
      ...product,
      categoryName,
    });
    this.dishDetailQuantity.set(1);
    this.dishDetailNotes.set('');
  }

  closeDishModal(): void {
    this.selectedDish.set(null);
  }

  increaseDetailQuantity(): void {
    this.dishDetailQuantity.update((q) => q + 1);
  }

  decreaseDetailQuantity(): void {
    this.dishDetailQuantity.update((q) => (q > 1 ? q - 1 : 1));
  }

  addDetailToCart(): void {
    const dish = this.selectedDish();
    if (!dish) return;

    this.addToCart(dish, this.dishDetailQuantity(), this.dishDetailNotes().trim());
    this.closeDishModal();
  }

  // Cart operations
  addToCart(
    product: { id: number; name: string; price: number; imageUrl: string | null; categoryName?: string },
    quantity = 1,
    notes = ''
  ): void {
    if (this.isClosed()) return;
    this.cart.update((items) => {
      const existingIndex = items.findIndex((i) => i.productId === product.id && i.notes === notes);
      if (existingIndex !== -1) {
        const updated = [...items];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }
      return [
        ...items,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: product.price,
          imageUrl: product.imageUrl,
          quantity,
          notes: notes || undefined,
          categoryName: product.categoryName,
        },
      ];
    });
  }

  removeFromCart(productId: number, notes?: string): void {
    this.cart.update((items) => {
      const existing = items.find((i) => i.productId === productId && i.notes === notes);
      if (!existing) return items;
      if (existing.quantity <= 1) {
        return items.filter((i) => !(i.productId === productId && i.notes === notes));
      }
      return items.map((i) => (i.productId === productId && i.notes === notes ? { ...i, quantity: i.quantity - 1 } : i));
    });
  }

  deleteCartItem(productId: number, notes?: string): void {
    this.cart.update((items) => items.filter((i) => !(i.productId === productId && i.notes === notes)));
  }

  getItemQuantity(productId: number): number {
    return this.cart()
      .filter((i) => i.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }

  openCart(): void {
    if (this.cart().length > 0) {
      this.orderErrorMessage.set(null);
      this.showCartModal.set(true);
    }
  }

  closeCart(): void {
    this.showCartModal.set(false);
  }

  setOrderType(type: OrderType): void {
    if (this.tableLocked()) {
      this.orderType.set('DINE_IN');
      return;
    }
    if (type === 'DINE_IN') {
      this.orderForm.patchValue({ tableNumber: `Mesa ${this.selectedTablePreset()}` });
    } else if (type === 'DELIVERY') {
      this.orderForm.patchValue({ tableNumber: 'Domicilio' });
    } else {
      this.orderForm.patchValue({ tableNumber: 'Para Llevar' });
    }
    this.orderType.set(type);
  }

  selectTable(num: string): void {
    if (this.tableLocked()) return;
    this.selectedTablePreset.set(num);
    this.orderForm.patchValue({ tableNumber: `Mesa ${num}` });
  }

  /** Etiqueta de la mesa del QR (?mesa=): evita "Mesa Mesa 4" si el QR ya la trae. */
  lockedTableLabel(): string {
    const raw = (this.selectedTablePreset() ?? '').trim();
    if (!raw) return 'Mesa';
    return /^mesa\s*/i.test(raw) ? raw.replace(/^mesa\s*/i, 'Mesa ') : `Mesa ${raw}`;
  }

  submitOrder(): void {
    const locked = this.tableLocked();
    if (this.isClosed() || this.cart().length === 0 || this.submittingOrder()) return;
    if (!locked && this.orderForm.invalid) return;

    this.submittingOrder.set(true);
    this.orderErrorMessage.set(null);

    const tableLabel = this.lockedTableLabel();
    const payload = locked
      ? {
          // QR de mesa: un toque y listo. Sin preguntas: la mesa identifica el pedido.
          customerName: tableLabel,
          customerPhone: undefined,
          tableNumber: tableLabel,
          orderType: 'DINE_IN' as OrderType,
          deliveryAddress: undefined,
          notes: undefined,
          tipAmount: null,
          items: this.cart().map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes,
          })),
        }
      : {
          customerName: this.orderForm.value.customerName,
          customerPhone: this.orderForm.value.customerPhone,
          tableNumber: this.orderForm.value.tableNumber ?? '',
          orderType: this.orderType(),
          deliveryAddress: this.orderForm.value.deliveryAddress,
          notes: this.orderForm.value.notes,
          tipAmount: this.tipAmount() || null,
          items: this.cart().map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes,
          })),
        };

    const targetSlug = this.slug().trim() || this.menu()?.restaurant.slug || '';
    if (!targetSlug) {
      this.submittingOrder.set(false);
      this.orderErrorMessage.set('No se pudo identificar el restaurante. Recarga la página.');
      return;
    }

    this.orderService.createPublicOrder(targetSlug, payload).subscribe({
      next: (order) => {
        this.submittingOrder.set(false);
        this.showCartModal.set(false);
        this.cart.set([]);
        this.tipPercent.set(0);
        this.orderSuccess.set(order);
        this.orderService.saveTrackedOrder(targetSlug, order);
        this.trackedOrders.set(this.orderService.listTrackedOrders(targetSlug));
      },
      error: (err) => {
        this.submittingOrder.set(false);
        this.orderErrorMessage.set(err.error?.message ?? 'No se pudo enviar el pedido. Intenta nuevamente.');
      },
    });
  }

  sendOrderByWhatsApp(): void {
    if (this.isClosed() || this.cart().length === 0) return;
    const restaurant = this.menu()?.restaurant;
    const phone = restaurant?.whatsapp || restaurant?.phone || '';
    if (!phone) return;
    const formVal = this.orderForm.value;
    const name = formVal.customerName || 'Cliente';
    const typeLabel = this.orderType() === 'DINE_IN' ? `📍 Mesa: ${formVal.tableNumber}` : this.orderType() === 'DELIVERY' ? `🛵 Domicilio: ${formVal.deliveryAddress || 'Dirección no indicada'}` : '🛍️ Para Llevar';
    const prepTime = this.estimatedPrepTime();

    let message = `¡Hola *${restaurant?.name || 'Restaurante'}*! 🍽️\n\n`;
    message += `Deseo realizar el siguiente pedido:\n`;
    message += `👤 *Cliente:* ${name}\n`;
    message += `${typeLabel}\n`;
    message += `⏱️ *Tiempo estimado de preparación:* ${prepTime}\n`;
    if (formVal.customerPhone) {
      message += `📞 *Teléfono:* ${formVal.customerPhone}\n`;
    }
    if (formVal.notes) {
      message += `📝 *Observaciones:* ${formVal.notes}\n`;
    }
    message += `\n*Detalle del Pedido:*\n`;

    this.cart().forEach((item, index) => {
      message += `${index + 1}. *${item.quantity}x ${item.productName}* - ${this.formatCurrency(item.unitPrice * item.quantity)}\n`;
      if (item.notes) {
        message += `   _Nota: ${item.notes}_\n`;
      }
    });

    message += `\n💰 *Total a Pagar:* *${this.formatCurrency(this.cartTotalWithTip())}*\n\n`;
    message += `_Enviado desde el Menú Digital Tavita_ 🚀`;

    const cleanPhone = phone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    
    // Also save to system in background so the kitchen receives it
    this.submitOrderSilently();
    
    window.open(waUrl, '_blank');
  }

  private submitOrderSilently(): void {
    const payload = {
      customerName: this.orderForm.value.customerName || 'Cliente WhatsApp',
      customerPhone: this.orderForm.value.customerPhone,
      tableNumber: this.tableLocked()
        ? this.lockedTableLabel()
        : (this.orderForm.value.tableNumber || 'WhatsApp'),
      orderType: this.orderType(),
      deliveryAddress: this.orderForm.value.deliveryAddress,
      notes: this.orderForm.value.notes,
      tipAmount: this.tipAmount() || null,
      items: this.cart().map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
      })),
    };
    const targetSlug = this.slug().trim() || this.menu()?.restaurant.slug || '';
    if (!targetSlug) return;
    this.orderService.createPublicOrder(targetSlug, payload).subscribe({
      next: (savedOrder) => {
        this.orderSuccess.set(savedOrder);
        this.cart.set([]);
        this.showCartModal.set(false);
        this.orderService.saveTrackedOrder(targetSlug, savedOrder);
        this.trackedOrders.set(this.orderService.listTrackedOrders(targetSlug));
      },
    });
  }

  closeSuccessModal(): void {
    this.orderSuccess.set(null);
  }

  // --- Seguimiento del pedido en tiempo real ---

  openTracking(order?: Order): void {
    const slug = this.slug().trim() || this.menu()?.restaurant.slug || '';
    const stored = this.orderService.listTrackedOrders(slug);
    const target = order ?? stored[0] ?? this.orderSuccess();
    this.trackedOrders.set(stored);
    this.trackingOrder.set(target ?? null);
    this.trackingOpen.set(true);
    this.stopTrackingPolling();
    this.refreshTracking();
    this.startTrackingPolling();
  }

  refreshTracking(): void {
    const current = this.trackingOrder();
    if (!current?.trackingCode) {
      this.trackingLoading.set(false);
      return;
    }
    this.trackingLoading.set(true);
    this.orderService.trackOrder(current.trackingCode).subscribe({
      next: (fresh) => {
        const status = fresh.status;
        this.trackingOrder.set(fresh);
        this.trackedOrders.update((list) => {
          const idx = list.findIndex((o) => o.id === fresh.id);
          if (idx !== -1) {
            const copy = [...list];
            copy[idx] = fresh;
            return copy;
          }
          return [fresh, ...list];
        });
        this.trackingLoading.set(false);
        if (status === 'DELIVERED' || status === 'CANCELLED') {
          this.stopTrackingPolling();
        }
      },
      error: () => this.trackingLoading.set(false),
    });
  }

  private startTrackingPolling(): void {
    this.stopTrackingPolling();
    this.trackingTimer = setInterval(() => this.refreshTracking(), 4000);
  }

  private stopTrackingPolling(): void {
    if (this.trackingTimer) {
      clearInterval(this.trackingTimer);
      this.trackingTimer = null;
    }
  }

  /** Polling de fondo: mantiene actualizado el estado mostrado en la píldora
   *  flotante sin tener abierta la vista de seguimiento. */
  private startStatusPolling(): void {
    this.stopStatusPolling();
    this.statusTimer = setInterval(() => this.refreshFirstTracked(), 6000);
  }

  private stopStatusPolling(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }

  private refreshFirstTracked(): void {
    if (this.trackingOpen() || this.orderSuccess()) return;
    const first = this.trackedOrders()[0];
    if (!first?.trackingCode) return;
    this.orderService.trackOrder(first.trackingCode).subscribe({
      next: (fresh) => {
        this.trackedOrders.update((list) => {
          const idx = list.findIndex((o) => o.id === fresh.id);
          if (idx !== -1) {
            const copy = [...list];
            copy[idx] = fresh;
            return copy;
          }
          return [fresh, ...list];
        });
      },
      error: () => undefined,
    });
  }

  closeTracking(): void {
    this.stopTrackingPolling();
    this.trackingOpen.set(false);
    this.trackingOrder.set(null);
  }

  selectTrackedOrder(order: Order): void {
    this.trackingOrder.set(order);
    this.refreshTracking();
    this.startTrackingPolling();
  }

  isOrderFinal(status: OrderStatus | null | undefined): boolean {
    return status === 'DELIVERED' || status === 'CANCELLED';
  }

  trackingStepLabel(status: OrderStatus | null | undefined): string {
    switch (status) {
      case 'PENDING': return 'Pendiente de confirmación';
      case 'CONFIRMED': return 'Confirmado';
      case 'IN_PREPARATION': return 'En cocina';
      case 'READY': return 'Listo para entrega';
      case 'DELIVERED': return 'Entregado';
      case 'CANCELLED': return 'Cancelado';
      default: return 'Pendiente';
    }
  }

  /** Índice del paso actual dentro de la línea: Recibido → Cocina → Listo → Entregado. */
  trackingStepIndex(status: OrderStatus | null | undefined): number {
    switch (status) {
      case 'PENDING': return 0;
      case 'CONFIRMED': return 1;
      case 'IN_PREPARATION': return 1;
      case 'READY': return 2;
      case 'DELIVERED': return 3;
      default: return 0;
    }
  }

  ngOnDestroy(): void {
    this.stopTrackingPolling();
    this.stopStatusPolling();
  }

  // Invoice Actions
  private getInvoiceRestaurantInfo() {
    const r = this.menu()?.restaurant;
    return {
      name: r?.name || 'Restaurante Gourmet',
      slug: r?.slug || 'restaurante',
      logoUrl: r?.logoUrl,
      phone: r?.phone,
      whatsapp: r?.whatsapp,
      address: r?.address,
      taxId: r?.taxId ?? null,
      estimatedPrepTime: this.estimatedPrepTime(),
    };
  }

  openInvoiceModal(order?: Order): void {
    const targetOrder = order || this.orderSuccess();
    if (targetOrder) {
      this.invoiceOrder.set(targetOrder);
      this.showInvoiceModal.set(true);
    }
  }

  closeInvoiceModal(): void {
    this.showInvoiceModal.set(false);
  }

  downloadInvoice(order?: Order): void {
    const targetOrder = order || this.invoiceOrder() || this.orderSuccess();
    if (targetOrder) {
      this.invoiceService.downloadInvoice(targetOrder, this.getInvoiceRestaurantInfo());
    }
  }

  printInvoice(order?: Order): void {
    const targetOrder = order || this.invoiceOrder() || this.orderSuccess();
    if (targetOrder) {
      this.invoiceService.printInvoice(targetOrder, this.getInvoiceRestaurantInfo());
    }
  }

  calculateEstimatedReadyTime(createdAtIso?: string): string {
    if (!createdAtIso) return '';
    return this.invoiceService.calculateReadyTime(createdAtIso, this.estimatedPrepTime());
  }

  formatDate(isoString: string): string {
    return this.invoiceService.formatDateTime(isoString);
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = 'none';
      if (target.parentElement) {
        target.parentElement.innerHTML = '<div class="w-full h-full rounded-2xl bg-stone-100 flex items-center justify-center text-3xl shadow-sm border border-stone-200 text-stone-300 select-none">🍽️</div>';
      }
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }
}
