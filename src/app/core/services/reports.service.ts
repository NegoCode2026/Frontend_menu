import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ProfitsResponse } from '../models/models';

export type ProfitPeriod = 'day' | 'week' | 'month';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private api: ApiService) {}

  /**
   * Utilidades día/semana/mes (?period&date=YYYY-MM-DD).
   *
   * Sin fallback a ceros: una consulta sin permiso (403) o caída de la API
   * mostraba "utilidad $0", indistinguible de un día sin ventas. Ahora el error
   * se propaga para que la pantalla lo muestre.
   */
  profits(period: ProfitPeriod = 'day', date?: string): Observable<ProfitsResponse> {
    const params = [`period=${period}`];
    if (date) params.push(`date=${date}`);
    return this.api.get<ProfitsResponse>(`/reports/profits?${params.join('&')}`);
  }
}