import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { TenantBackendService } from './tenant-backend.service';
import { CreateManualOrderRequest, CreateOrderRequest, Order, OrderStatus, PaymentMethod, UpdateOrderRequest } from '../models/models';

const TRACKED_ORDERS_KEY = 'tavita_tracked_orders';

type TrackedOrdersMap = { [slug: string]: Order[] };

@Injectable({ providedIn: 'root' })
export class OrderService {
  private newOrderTrigger$ = new Subject<Order>();
  readonly onNewOrder$ = this.newOrderTrigger$.asObservable();

  constructor(
    private api: ApiService,
    private tenants: TenantBackendService,
  ) {}

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
    return this.api.get<Order>(`/public/orders/track/${encodeURIComponent(trackingCode)}`);
  }

  createPublicOrder(slug: string, payload: CreateOrderRequest): Observable<Order> {
    // Multi-docker: espera el registry remoto y fija el docker del slug
    // para que pedido e imágenes vayan a la misma máquina.
    return this.tenants.ensureLoaded().pipe(
      switchMap(() => {
        this.tenants.pinFor(slug);
        return this.api.post<Order>(`/public/orders/${slug}`, payload);
      }),
      tap((order) => {
        this.newOrderTrigger$.next(order);
      })
    );
  }

  listMine(status?: OrderStatus, since?: string): Observable<Order[]> {
    const params: string[] = [];
    if (status) params.push(`status=${status}`);
    if (since) params.push(`since=${encodeURIComponent(since)}`);
    const path = params.length > 0 ? `/orders?${params.join('&')}` : '/orders';
    return this.api.get<Order[]>(path);
  }

  createMine(payload: CreateManualOrderRequest): Observable<Order> {
    return this.api.post<Order>('/orders', payload);
  }

  updateMine(id: number, payload: UpdateOrderRequest): Observable<Order> {
    return this.api.patch<Order>(`/orders/${id}`, payload);
  }

  getMine(id: number): Observable<Order> {
    return this.api.get<Order>(`/orders/${id}`);
  }

  updateStatusMine(id: number, status: OrderStatus): Observable<Order> {
    return this.api.patch<Order>(`/orders/${id}/status`, { status });
  }

  /** Cobra un pedido entregado (método de pago). */
  payOrder(id: number, paymentMethod: PaymentMethod): Observable<Order> {
    return this.api.post<Order>(`/orders/${id}/pay`, { paymentMethod });
  }

  notifyWhatsApp(orderId: number): Observable<boolean> {
    return this.api.post<boolean>(`/orders/${orderId}/notify-whatsapp`, {});
  }
}
