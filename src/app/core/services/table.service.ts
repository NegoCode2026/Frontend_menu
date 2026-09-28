import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface RestaurantTable {
  id: string | number;
  number: string;
  seats: number;
  createdAt: string;
}

const keyFor = (restaurantId: string | number | null | undefined): string =>
  `tavita_tables_${restaurantId ?? 'default'}`;

/** Registro de mesas con respaldo backend en /api/tables y fallback en localStorage. */
@Injectable({ providedIn: 'root' })
export class TableService {
  constructor(private api: ApiService) {}

  listApi(): Observable<RestaurantTable[]> {
    return this.api.get<RestaurantTable[]>('/tables').pipe(
      tap((tables) => {
        try {
          if (Array.isArray(tables)) {
            localStorage.setItem('tavita_tables_cache', JSON.stringify(tables));
          }
        } catch {}
      }),
      catchError(() => of(this.listLocal(null)))
    );
  }

  listLocal(restaurantId: string | number | null | undefined): RestaurantTable[] {
    try {
      const raw = localStorage.getItem(keyFor(restaurantId)) || localStorage.getItem('tavita_tables_cache');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as RestaurantTable[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  list(restaurantId: string | number | null | undefined): RestaurantTable[] {
    return this.listLocal(restaurantId);
  }

  addApi(number: string, seats: number): Observable<RestaurantTable> {
    return this.api.post<RestaurantTable>('/tables', { number: number.trim(), seats });
  }

  add(restaurantId: string | number | null | undefined, number: string, seats: number): RestaurantTable {
    const table: RestaurantTable = {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      number: number.trim(),
      seats: Math.min(20, Math.max(1, Math.floor(seats) || 2)),
      createdAt: new Date().toISOString(),
    };
    const current = this.listLocal(restaurantId);
    try {
      localStorage.setItem(keyFor(restaurantId), JSON.stringify([...current, table]));
    } catch {}
    return table;
  }

  removeApi(id: string | number): Observable<void> {
    return this.api.delete<void>(`/tables/${id}`);
  }

  remove(restaurantId: string | number | null | undefined, id: string | number): void {
    try {
      localStorage.setItem(
        keyFor(restaurantId),
        JSON.stringify(this.listLocal(restaurantId).filter((t) => String(t.id) !== String(id)))
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
