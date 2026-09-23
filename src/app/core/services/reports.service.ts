import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ProfitsResponse } from '../models/models';

export type ProfitPeriod = 'day' | 'week' | 'month';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private api: ApiService) {}

  /** Utilidades día/semana/mes (?period&date=YYYY-MM-DD). */
  profits(period: ProfitPeriod = 'day', date?: string): Observable<ProfitsResponse> {
    const params = [`period=${period}`];
    if (date) params.push(`date=${date}`);
    return this.api.get<ProfitsResponse>(`/reports/profits?${params.join('&')}`).pipe(
      catchError(() =>
        of({
          period,
          from: date ?? '',
          to: date ?? '',
          revenue: 0,
          cost: 0,
          profit: 0,
          orders: 0,
          days: [],
        })
      )
    );
  }
}
