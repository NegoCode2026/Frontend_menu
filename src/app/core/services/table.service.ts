import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { ApiService } from './api.service';

export interface RestaurantTable {
  id: number | string;
  number: string;
  seats: number;
  createdAt: string;
}

interface LegacyTable {
  id?: unknown;
  number?: unknown;
  seats?: unknown;
  createdAt?: unknown;
}

const LEGACY_PREFIX = 'tavita_tables_';

/** Llaves de cachés locales ya eliminados: no las lee ningún código,
 *  se barren para no dejar basura en el navegador. */
const STALE_KEYS = [
  'tavita_orders_cache',
  'tavita_categories_cache',
  'tavita_products_cache',
  'tavita_restaurant_me',
];

/**
 * Mesas del salón: viven en el backend (compartidas por todo el equipo).
 * La ocupación se deriva en vivo de los pedidos activos en el componente.
 */
@Injectable({ providedIn: 'root' })
export class TableService {
  constructor(private api: ApiService) {}

  list(): Observable<RestaurantTable[]> {
    return this.api.get<RestaurantTable[]>('/tables');
  }

  create(number: string, seats: number): Observable<RestaurantTable> {
    return this.api.post<RestaurantTable>('/tables', { number: number.trim(), seats });
  }

  remove(id: number | string): Observable<void> {
    return this.api.delete<void>(`/tables/${id}`);
  }

  migrateLegacy(restaurantId: number | null | undefined, existing: RestaurantTable[]): Observable<RestaurantTable[]> {
    if (restaurantId == null) return of(existing);
    const key = LEGACY_PREFIX + restaurantId;
    let local: LegacyTable[];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (!Array.isArray(parsed) || !parsed.length) return of(existing);
      local = parsed;
    } catch { return of(existing); }
    const known = new Set(existing.map(t => t.number));
    const missing = new Map<string, number>();
    for (const row of local) {
      const number = typeof row?.number === 'string' ? row.number.trim() : '';
      if (number && !known.has(number)) missing.set(number, typeof row.seats === 'number' ? row.seats : 2);
    }
    const requests = [...missing].map(([number, seats]) => this.create(number, seats).pipe(catchError(() => of(null))));
    return (requests.length ? forkJoin(requests) : of([])).pipe(map(results => {
      const merged = [...existing, ...results.filter((t): t is RestaurantTable => t !== null)];
      const confirmed = new Set(merged.map(t => t.number));
      try {
        const latest: LegacyTable[] = JSON.parse(localStorage.getItem(key) ?? '[]');
        const pending = latest.filter(row => typeof row?.number !== 'string' || !confirmed.has(row.number.trim()));
        if (pending.length) localStorage.setItem(key, JSON.stringify(pending));
        else localStorage.removeItem(key);
      } catch { /* El almacenamiento puede estar deshabilitado. */ }
      return merged;
    }));
  }

  /** Barre llaves de cachés ya eliminados del código (no se leen en ningún lado). */
  sweepStaleKeys(): void {
    try {
      STALE_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Ignorar errores de limpieza
    }
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
