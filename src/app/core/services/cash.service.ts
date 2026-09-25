import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Order, Page } from '../models/models';

export interface CashToday {
  date: string;
  expectedCash: number;
  expectedCard: number;
  expectedTransfer: number;
  expectedTotal: number;
  deliveredOrders: number;
  unpaidDelivered: number;
  /** Pedidos entregados del día sin método de pago registrado. */
  unpaidOrders: Order[];
  /** Pedidos del día ya cobrados (qué se cobró y por cuánto). */
  paidOrders: Order[];
  closing: CashClosing | null;
}

export interface CashClosing {
  id: number;
  businessDate: string;
  expectedCash: number;
  countedCash: number;
  difference: number;
  notes: string | null;
  closedBy: number | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class CashService {
  constructor(private api: ApiService) {}

  today(): Observable<CashToday> {
    return this.api.get<CashToday>('/cash/today');
  }

  close(countedCash: number, notes?: string | null): Observable<CashClosing> {
    return this.api.post<CashClosing>('/cash/close', { countedCash, notes: notes ?? null });
  }

  history(page = 0, size = 30): Observable<Page<CashClosing>> {
    return this.api.get<Page<CashClosing>>(`/cash/closings?page=${page}&size=${size}`);
  }
}
