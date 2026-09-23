import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AdjustStockRequest, Page, Product, StockMovement } from '../models/models';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  constructor(private api: ApiService) {}

  /** Alerta: productos con stock bajo o agotado. */
  lowStock(): Observable<Product[]> {
    return this.api.get<Product[]>('/inventory/low-stock');
  }

  /** Kardex paginado (?productId). */
  movements(productId?: number, page = 0, size = 50): Observable<Page<StockMovement>> {
    const params = [`page=${page}`, `size=${size}`];
    if (productId) params.push(`productId=${productId}`);
    return this.api.get<Page<StockMovement>>(`/inventory/movements?${params.join('&')}`);
  }

  /** Ajuste manual a existencia absoluta. */
  adjust(request: AdjustStockRequest): Observable<Product> {
    return this.api.post<Product>('/inventory/adjust', request);
  }
}
