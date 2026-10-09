import { Component, effect, inject, input, signal, computed, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MenuService } from '../../core/services/menu.service';
import { OrderService } from '../../core/services/order.service';
import { TableService } from '../../core/services/table.service';
import { InvoiceService } from '../../core/services/invoice.service';
import {
  CartItem,
  ModifierGroup,
  ModifierOption,
  Order,
  OrderStatus,
  OrderType,
  PublicMenu,
  SelectedModifier,
} from '../../core/models/models';
import { PwaBannerComponent } from '../../shared/pwa-banner/pwa-banner.component';

interface DishModalItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  categoryName?: string;
  /** Grupos de opciones del plato: vacio si no tiene. */
  modifierGroups?: ModifierGroup[];
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
  /** Opciones elegidas del plato abierto, por id de opcion. */
  readonly dishDetailModifiers = signal<Map<number, SelectedModifier>>(new Map());

  /** Grupos del plato abierto, si tiene. */
  readonly dishDetailGroups = computed<ModifierGroup[]>(
    () => this.selectedDish()?.modifierGroups ?? [],
  );

  /** Suma de los deltas: solo para mostrar el precio estimado. */
  readonly dishDetailModifiersTotal = computed(() => {
    let total = 0;
    this.dishDetailModifiers().forEach((m) => (total += m.priceDelta));
    return total;
  });

  /** Precio unitario estimado, con las opciones ya sumadas. */
  readonly dishDetailUnitPrice = computed(
    () => (this.selectedDish()?.price ?? 0) + this.dishDetailModifiersTotal(),
  );

  /** Un grupo obligatorio sin elegir impide anadir al carrito. */
  readonly dishDetailMissingRequired = computed(() =>
    this.dishDetailGroups()
      .filter((g) => g.required)
      .filter((g) => !this.hasSelectionFor(g.id))
      .map((g) => g.name),
  );

  private hasSelectionFor(groupId: number): boolean {
    const group = this.dishDetailGroups().find((g) => g.id === groupId);
    if (!group) return false;
    let chosen = 0;
    this.dishDetailModifiers().forEach((m) => {
      if (group.options.some((o) => o.id === m.modifierId)) chosen++;
    });
    return chosen >= Math.max(1, group.minSelections);
  }

  /** Alterna una opcion respetando min/max del grupo. */
  toggleModifier(group: ModifierGroup, option: ModifierOption): void {
    const next = new Map(this.dishDetailModifiers());
    if (next.has(option.id)) {
      next.delete(option.id);
    } else {
      const chosenInGroup = group.options.filter((o) => next.has(o.id)).length;
      if (chosenInGroup >= group.maxSelections) return;
      next.set(option.id, {
        modifierId: option.id,
        quantity: 1,
        name: option.name,
        groupName: group.name,
        priceDelta: option.priceDelta,
      });
    }
    this.dishDetailModifiers.set(next);
  }

  isModifierSelected(optionId: number): boolean {
    return this.dishDetailModifiers().has(optionId);
  }

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

  /** Pedidos visibles aquí: con QR de mesa, solo los de ESA mesa. En un
   *  dispositivo compartido no se muestra lo de otras mesas: cada quien
   *  ve únicamente el estado de su propio pedido. */
  readonly visibleTrackedOrders = computed(() => {
    const all = this.trackedOrders();
    if (!this.tableLocked()) return all;
    const mineLabel = this.lockedTableLabel().trim().toLowerCase();
    const mineNum = TableService.normalizeNumber(this.lockedTableLabel());
    return all.filter((o) => {
      const raw = (o.tableNumber ?? '').trim().toLowerCase();
      if (raw && raw === mineLabel) return true;
      const n = TableService.normalizeNumber(o.tableNumber);
      return mineNum !== null && n !== null && n === mineNum;
    });
  });

  /** Pedidos con seguimiento vivo: visibles y no finalizados. Al entregarse
   *  o cancelarse desaparecen para que la siguiente mesa no vea nada. */
  readonly activeTrackedOrders = computed(() =>
    this.visibleTrackedOrders().filter((o) => !this.isOrderFinal(o.status))
  );
  private trackingTimer: ReturnType<typeof setInterval> | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  // Order Type: DINE_IN, DELIVERY, TAKEAWAY
  readonly orderType = signal<OrderType>('DINE_IN');
  readonly selectedTablePreset = signal<string>('1');

  /** ?mesa= crudo del QR: se valida contra las mesas registradas al cargar el menú. */
  readonly pendingMesa = signal<string | null>(null);
  /** Mesa del QR que NO existe: bloquea el menú hasta escanear un QR válido. */
  readonly invalidTable = signal<string | null>(null);

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
    // El ?mesa= del QR se valida contra las mesas registradas cuando
    // llega el menú: si no existe, se avisa y se sigue con el flujo normal.
    this.route.queryParamMap.subscribe((params) => {
      const mesa = params.get('mesa') || params.get('table') || params.get('m');
      if (mesa) {
        this.pendingMesa.set(mesa);
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
          this.applyPendingMesa();
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

  /** Aplica el ?mesa= del QR una vez conocido el menú (valida que exista). */
  private applyPendingMesa(): void {
    const mesa = this.pendingMesa();
    this.pendingMesa.set(null);
    if (!mesa) return;
    if (!this.knownTable(mesa)) {
      this.invalidTable.set(mesa.trim());
      this.tableLocked.set(false);
      return;
    }
    this.invalidTable.set(null);
    this.tableLocked.set(true);
    this.orderType.set('DINE_IN');
    this.selectedTablePreset.set(mesa);
    this.orderForm.patchValue({ tableNumber: this.lockedTableLabel() });
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
  openDishModal(
    product: {
      id: number;
      name: string;
      description: string | null;
      price: number;
      imageUrl: string | null;
      modifierGroups?: ModifierGroup[];
    },
    categoryName?: string,
  ): void {
    this.selectedDish.set({
      ...product,
      categoryName,
    });
    this.dishDetailQuantity.set(1);
    this.dishDetailNotes.set('');
    this.dishDetailModifiers.set(new Map());
  }

  closeDishModal(): void {
    this.selectedDish.set(null);
    this.dishDetailModifiers.set(new Map());
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
    // Si falta un grupo obligatorio, el servidor lo rechazaria con 400. Se avisa
    // aqui para no tener que vaciar el carrito por un error de validacion.
    if (this.dishDetailMissingRequired().length > 0) return;

    const modifiers = [...this.dishDetailModifiers().values()];
    this.addToCart(dish, this.dishDetailQuantity(), this.dishDetailNotes().trim(), modifiers);
    this.closeDishModal();
  }

  /**
   * Solo se envían ids y cantidad: el precio lo resuelve el servidor. Mandar el
   * delta desde aquí permitiríafalse que cualquiera decidiera lo que paga.
   */
  private toOrderModifiers(item: CartItem): Array<{ modifierId: number; quantity: number }> {
    return (item.modifiers ?? []).map((m) => ({ modifierId: m.modifierId, quantity: m.quantity }));
  }

  /** Total estimado del carrito, con las opciones ya sumadas. */
  readonly cartEstimatedTotal = computed(() =>
    this.cart().reduce((acc, item) => {
      const unit = item.unitPrice + (item.modifiersTotal ?? 0);
      return acc + unit * item.quantity;
    }, 0),
  );

  // Cart operations
  addToCart(
    product: {
      id: number;
      name: string;
      price: number;
      imageUrl: string | null;
      categoryName?: string;
      modifierGroups?: ModifierGroup[];
    },
    quantity = 1,
    notes = '',
    modifiers: SelectedModifier[] = []
  ): void {
    if (this.isClosed()) return;
    this.cart.update((items) => {
      // Un mismo plato con opciones distintas son dos líneas del carrito.
      const sameOptions = (a: CartItem) =>
        (a.modifiers ?? []).map((m) => m.modifierId).sort().join(',') ===
        modifiers.map((m) => m.modifierId).sort().join(',');
      const existingIndex = items.findIndex(
        (i) => i.productId === product.id && i.notes === notes && sameOptions(i),
      );
      if (existingIndex !== -1) {
        const updated = [...items];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }
      const modifiersTotal = modifiers.reduce((acc, m) => acc + m.priceDelta, 0);
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
          modifiers: modifiers.length > 0 ? modifiers : undefined,
          modifiersTotal,
        },
      ];
    });
  }

  /**
   * Localiza la línea exacta. Con el mismo plato y opciones distintas hay varias
   * líneas, así que productId + notas ya no bastan: sin el id de opción se
   * habría descontado o borrado la línea equivocada.
   */
  private sameLine(i: CartItem, productId: number, notes?: string, modifierIds: number[] = []): boolean {
    const ids = (i.modifiers ?? []).map((m) => m.modifierId).sort().join(',');
    return (
      i.productId === productId &&
      i.notes === notes &&
      ids === [...modifierIds].sort().join(',')
    );
  }

  removeFromCart(productId: number, notes?: string, modifierIds: number[] = []): void {
    this.cart.update((items) => {
      const existing = items.find((i) => this.sameLine(i, productId, notes, modifierIds));
      if (!existing) return items;
      if (existing.quantity <= 1) {
        return items.filter((i) => !this.sameLine(i, productId, notes, modifierIds));
      }
      return items.map((i) =>
        this.sameLine(i, productId, notes, modifierIds) ? { ...i, quantity: i.quantity - 1 } : i,
      );
    });
  }

  deleteCartItem(productId: number, notes?: string, modifierIds: number[] = []): void {
    this.cart.update((items) => items.filter((i) => !this.sameLine(i, productId, notes, modifierIds)));
  }

  /** Ids de las opciones de una línea, para pasarlos al eliminar. */
  modifierIdsOf(item: CartItem): number[] {
    return (item.modifiers ?? []).map((m) => m.modifierId);
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

  /** Mesas registradas para el picker (o lista base si aún no hay). */
  availableTables(): string[] {
    const registered = this.menu()?.tables;
    if (Array.isArray(registered) && registered.length > 0) return registered;
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '15'];
  }

  /** ¿La etiqueta es una mesa registrada? Sin registro no se valida. */
  knownTable(label: string | null | undefined): boolean {
    const registered = this.menu()?.tables;
    if (!Array.isArray(registered) || registered.length === 0) return true;
    const norm = (label ?? '').trim();
    if (!norm) return false;
    const num = TableService.normalizeNumber(norm);
    return registered.some((t) => {
      if (t.toLowerCase() === norm.toLowerCase()) return true;
      const tn = TableService.normalizeNumber(t);
      return num !== null && tn !== null && num === tn;
    });
  }
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
    if (locked && !this.knownTable(tableLabel)) {
      this.submittingOrder.set(false);
      this.orderErrorMessage.set(`La ${tableLabel} no existe en este restaurante. Escanea el QR de tu mesa.`);
      return;
    }
    if (!locked && this.orderType() === 'DINE_IN') {
      const typed = (this.orderForm.value.tableNumber ?? '').trim();
      if (typed && !this.knownTable(typed)) {
        this.submittingOrder.set(false);
        this.orderErrorMessage.set(`La mesa "${typed}" no existe. Elige una de la lista.`);
        return;
      }
    }
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
            modifiers: this.toOrderModifiers(item),
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
            modifiers: this.toOrderModifiers(item),
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
        this.invalidTable.set(null);
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
    this.trackedOrders.set(stored);
    const visible = this.activeTrackedOrders();
    const target = order ?? visible[0] ?? this.orderSuccess();
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
    const first = this.activeTrackedOrders()[0];
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
