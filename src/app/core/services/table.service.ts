import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';
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

  /**
   * Migración única desde el formato anterior (localStorage por navegador):
   * si el backend está vacío y hay mesas locales, las sube y limpia las
   * llaves viejas. Devuelve cuántas migró.
   */
  migrateLegacy(backendEmpty: boolean): Observable<number> {
    if (!backendEmpty) return of(0);
    const legacy = this.readLegacy();
    if (legacy.length === 0) return of(0);
    const creations = legacy.map((t) =>
      this.create(t.number, t.seats).pipe(catchError(() => of(null)))
    );
    return forkJoin(creations).pipe(
      tap(() => this.clearLegacy()),
      map((results) => results.filter((r) => r !== null).length)
    );
  }

  /** Lee las mesas del formato viejo (todas las llaves tavita_tables_*). */
  private readLegacy(): Array<{ number: string; seats: number }> {
    const out: Array<{ number: string; seats: number }> = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as LegacyTable[];
        if (!Array.isArray(parsed)) continue;
        for (const t of parsed) {
          const number = typeof t?.number === 'string' ? t.number.trim() : '';
          if (!number) continue;
          const seats = typeof t?.seats === 'number' && Number.isFinite(t.seats) ? t.seats : 2;
          out.push({ number, seats });
        }
      }
    } catch {
      // Sin almacenamiento: no hay nada que migrar
    }
    return out;
  }

  private clearLegacy(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LEGACY_PREFIX)) keys.push(key);
      }
      keys.forEach((k) => localStorage.removeItem(k));
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
