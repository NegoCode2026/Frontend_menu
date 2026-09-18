import { Injectable } from '@angular/core';

export interface RestaurantTable {
  id: string;
  number: string;
  seats: number;
  createdAt: string;
}

const keyFor = (restaurantId: string | number | null | undefined): string =>
  `tavita_tables_${restaurantId ?? 'default'}`;

/** Registro local de mesas por restaurante (sin backend de mesas).
 *  La ocupación se deriva en vivo de los pedidos activos. */
@Injectable({ providedIn: 'root' })
export class TableService {
  list(restaurantId: string | number | null | undefined): RestaurantTable[] {
    try {
      const raw = localStorage.getItem(keyFor(restaurantId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as RestaurantTable[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  add(restaurantId: string | number | null | undefined, number: string, seats: number): RestaurantTable {
    const table: RestaurantTable = {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      number: number.trim(),
      seats: Math.min(20, Math.max(1, Math.floor(seats) || 2)),
      createdAt: new Date().toISOString(),
    };
    const current = this.list(restaurantId);
    try {
      localStorage.setItem(keyFor(restaurantId), JSON.stringify([...current, table]));
    } catch {}
    return table;
  }

  remove(restaurantId: string | number | null | undefined, id: string): void {
    try {
      localStorage.setItem(
        keyFor(restaurantId),
        JSON.stringify(this.list(restaurantId).filter((t) => t.id !== id))
      );
    } catch {}
  }

  /** Normaliza etiquetas ("Mesa 01", "01", "Mesa 1") al número de mesa. */
  static normalizeNumber(label: string | null | undefined): number | null {
    if (!label) return null;
    const digits = label.replace(/\D/g, '');
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isNaN(n) ? null : n;
  }
}
