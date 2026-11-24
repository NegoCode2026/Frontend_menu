import type { Order } from '../models/models';

export type TrackingRef = Pick<Order, 'id' | 'trackingCode' | 'orderNumber' | 'status' | 'tableNumber'>;
export type TrackingView = TrackingRef & Partial<Pick<Order, 'items' | 'totalAmount' | 'timeline' | 'estimatedPrepTime'>>;

export function trackingRef({ id, trackingCode, orderNumber, status, tableNumber }: TrackingRef): TrackingRef {
  return { id, trackingCode, orderNumber, status, tableNumber };
}

/** Lee el formato anterior (pedidos completos) y conserva solo los campos de seguimiento. */
export function readTrackingRefs(raw: string | null): Record<string, TrackingRef[]> {
  const result: Record<string, TrackingRef[]> = Object.create(null);
  if (!raw) return result;
  const stored = JSON.parse(raw);
  for (const [slug, orders] of Object.entries(stored ?? {})) {
    if (!Array.isArray(orders)) continue;
    result[slug] = orders.filter(order => order && Number.isInteger(order.id) &&
      typeof order.trackingCode === 'string' && typeof order.orderNumber === 'string' &&
      order.status !== 'DELIVERED' && order.status !== 'CANCELLED').slice(0, 5).map(trackingRef);
  }
  return result;
}
