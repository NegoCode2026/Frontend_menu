import { Injectable } from '@angular/core';
import { Observable, of, Subject, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { CreateOrderRequest, Order, OrderStats, OrderStatus, UpdateOrderRequest } from '../models/models';
import { INITIAL_SAMPLE_ORDERS, DEMO_PUBLIC_MENU } from '../data/demo-menu.data';

const ORDERS_STORAGE_KEY = 'tavita_orders_cache';
const TRACKED_ORDERS_KEY = 'tavita_tracked_orders';

type TrackedOrdersMap = { [slug: string]: Order[] };

@Injectable({ providedIn: 'root' })
export class OrderService {
  private newOrderTrigger$ = new Subject<Order>();
  readonly onNewOrder$ = this.newOrderTrigger$.asObservable();

  /**
   * El fallback local (localStorage + pedidos de demostración) solo se usa en
   * desarrollo: en producción un pedido que no llega al backend NO debe ser
   * fabricado localmente, para no "sonar" en el tablero sin existir.
   */
  private readonly demoMode = !environment.production;

  constructor(private api: ApiService) {}

  private getStoredOrders(): Order[] {
    try {
      const data = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Ignore localStorage read errors
    }
    return INITIAL_SAMPLE_ORDERS;
  }

  private saveStoredOrders(orders: Order[]): void {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } catch {
      // Ignore localStorage write errors
    }
  }

  /** Guarda el pedido colocado en ESTA sesión/navegador para poder rastrearlo
   *  desde el menú público sin volver a buscarlo. Se conservan hasta 5 por restaurante. */
  saveTrackedOrder(slug: string, order: Order): void {
    try {
      const map = this.readTracked();
      map[slug] = [order, ...(map[slug] ?? [])];
      const seen = new Set<number>();
      map[slug] = map[slug]
        .filter((o) => (o?.id != null && !seen.has(o.id) ? (seen.add(o.id), true) : false))
        .slice(0, 5);
      localStorage.setItem(TRACKED_ORDERS_KEY, JSON.stringify(map));
    } catch {
      // Ignore localStorage write errors
    }
  }

  listTrackedOrders(slug: string): Order[] {
    try {
      return this.readTracked()[slug] ?? [];
    } catch {
      return [];
    }
  }

  private readTracked(): TrackedOrdersMap {
    try {
      const raw = localStorage.getItem(TRACKED_ORDERS_KEY);
      return raw ? (JSON.parse(raw) as TrackedOrdersMap) : {};
    } catch {
      return {};
    }
  }

  /** Consulta en tiempo real el estado de un pedido por su código de seguimiento (sin autenticación). */
  trackOrder(trackingCode: string): Observable<Order> {
    return this.api.get<Order>(`/public/orders/track/${encodeURIComponent(trackingCode)}`).pipe(
      catchError((err) => {
        if (!this.demoMode) {
          return throwError(() => err);
        }
        const map = this.readTracked();
        for (const slug of Object.keys(map)) {
          const found = map[slug].find((o) => o.trackingCode === trackingCode);
          if (found) return of(found);
        }
        return throwError(() => err);
      })
    );
  }

  createPublicOrder(slug: string, payload: CreateOrderRequest): Observable<Order> {
    return this.api.post<Order>(`/public/orders/${slug}`, payload).pipe(
      tap((order) => {
        const stored = this.getStoredOrders();
        this.saveStoredOrders([order, ...stored]);
        this.newOrderTrigger$.next(order);
      }),
      catchError((err) => {
        if (!this.demoMode) {
          return throwError(() => err);
        }
        // Find product names and calculate total
        let total = 0;
        const items = payload.items.map((item, idx) => {
          let name = 'Plato #' + item.productId;
          let price = 25000;
          for (const cat of DEMO_PUBLIC_MENU.categories) {
            const found = cat.products.find((p) => p.id === item.productId);
            if (found) {
              name = found.name;
              price = found.price;
              break;
            }
          }
          const subtotal = price * item.quantity;
          total += subtotal;
          return {
            id: Date.now() + idx,
            productId: item.productId,
            productName: name,
            unitPrice: price,
            quantity: item.quantity,
            subtotal,
            notes: item.notes ?? null,
          };
        });

        const newOrder: Order = {
          id: Date.now(),
          restaurantId: 1,
          orderNumber: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
          trackingCode: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `demo-${Date.now()}`,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone ?? null,
          tableNumber: payload.tableNumber ?? (payload.orderType === 'DELIVERY' ? 'Domicilio' : 'Mesa'),
          deliveryAddress: payload.deliveryAddress ?? null,
          orderType: payload.orderType ?? 'DINE_IN',
          notes: payload.notes ?? null,
          status: 'PENDING',
          totalAmount: total,
          estimatedPrepTime: DEMO_PUBLIC_MENU.restaurant.estimatedPrepTime || '20-30 min',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items,
        };

        const current = this.getStoredOrders();
        const updated = [newOrder, ...current];
        this.saveStoredOrders(updated);
        this.newOrderTrigger$.next(newOrder);

        return of(newOrder);
      })
    );
  }

  listMine(status?: OrderStatus, raw = false, since?: string): Observable<Order[]> {
    const params: string[] = [];
    if (status) params.push(`status=${status}`);
    if (since) params.push(`since=${encodeURIComponent(since)}`);
    const path = params.length > 0 ? `/orders?${params.join('&')}` : '/orders';
    const req = this.api.get<Order[]>(path);
    if (raw) return req;
    return req.pipe(
      catchError((err) => {
        if (!this.demoMode) {
          return throwError(() => err);
        }
        const orders = this.getStoredOrders();
        if (status) {
          return of(orders.filter((o) => o.status === status));
        }
        return of(orders);
      })
    );
  }

  stats(): Observable<OrderStats> {
    return this.api.get<OrderStats>('/orders/stats');
  }

  createMine(payload: CreateOrderRequest): Observable<Order> {
    return this.api.post<Order>('/orders', payload);
  }

  updateMine(id: number, payload: UpdateOrderRequest): Observable<Order> {
    return this.api.patch<Order>(`/orders/${id}`, payload);
  }

  getMine(id: number): Observable<Order> {
    return this.api.get<Order>(`/orders/${id}`).pipe(
      catchError((err) => {
        if (!this.demoMode) {
          return throwError(() => err);
        }
        const orders = this.getStoredOrders();
        const found = orders.find((o) => o.id === id) || INITIAL_SAMPLE_ORDERS[0];
        return of(found);
      })
    );
  }

  updateStatusMine(id: number, status: OrderStatus): Observable<Order> {
    return this.api.patch<Order>(`/orders/${id}/status`, { status }).pipe(
      catchError((err) => {
        if (!this.demoMode) {
          return throwError(() => err);
        }
        const orders = this.getStoredOrders();
        const foundIndex = orders.findIndex((o) => o.id === id);
        if (foundIndex !== -1) {
          const updated: Order = {
            ...orders[foundIndex],
            status,
            updatedAt: new Date().toISOString(),
          };
          orders[foundIndex] = updated;
          this.saveStoredOrders(orders);
          return of(updated);
        }
        throw new Error('Order not found');
      })
    );
  }

  simulateNewOrder(): Order {
    const sampleNames = ['Laura Martínez', 'Diego Morales', 'Felipe Castro', 'Camila Osorio', 'Juan Pablo Rincón'];
    const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const randomTable = `Mesa ${Math.floor(1 + Math.random() * 12)}`;
    
    // Pick 2 random products from demo menu
    const allProducts = DEMO_PUBLIC_MENU.categories.flatMap((c) => c.products);
    const p1 = allProducts[Math.floor(Math.random() * allProducts.length)];
    const p2 = allProducts[Math.floor(Math.random() * allProducts.length)];

    const sub1 = p1.price;
    const sub2 = p2.price * 2;
    const total = sub1 + sub2;

    const newOrder: Order = {
      id: Date.now(),
      restaurantId: 1,
      orderNumber: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: randomName,
      customerPhone: '+57310' + Math.floor(1000000 + Math.random() * 9000000),
      tableNumber: randomTable,
      orderType: 'DINE_IN',
      notes: 'Pedido de prueba en tiempo real',
      status: 'PENDING',
      totalAmount: total,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        {
          id: Date.now() + 1,
          productId: p1.id,
          productName: p1.name,
          unitPrice: p1.price,
          quantity: 1,
          subtotal: sub1,
          notes: 'Término medio',
        },
        {
          id: Date.now() + 2,
          productId: p2.id,
          productName: p2.name,
          unitPrice: p2.price,
          quantity: 2,
          subtotal: sub2,
          notes: null,
        },
      ],
    };

    const current = this.getStoredOrders();
    this.saveStoredOrders([newOrder, ...current]);
    this.newOrderTrigger$.next(newOrder);
    return newOrder;
  }

  notifyWhatsApp(orderId: number): Observable<boolean> {
    return this.api.post<boolean>(`/orders/${orderId}/notify-whatsapp`, {}).pipe(
      catchError(() => of(true))
    );
  }
}

