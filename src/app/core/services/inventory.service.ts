import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AdjustStockRequest, Ingredient, IngredientRequest, Page, Product, StockMovement } from '../models/models';

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

  /** Ingredientes del restaurante. */
  ingredients(): Observable<Ingredient[]> {
    return this.api.get<Ingredient[]>('/inventory/ingredients');
  }

  lowStockIngredients(): Observable<Ingredient[]> {
    return this.api.get<Ingredient[]>('/inventory/ingredients/low-stock');
  }

  createIngredient(request: IngredientRequest): Observable<Ingredient> {
    return this.api.post<Ingredient>('/inventory/ingredients', request);
  }

  updateIngredient(id: number, request: IngredientRequest): Observable<Ingredient> {
    return this.api.put<Ingredient>(`/inventory/ingredients/${id}`, request);
  }

  deleteIngredient(id: number): Observable<void> {
    return this.api.delete<void>(`/inventory/ingredients/${id}`);
  }

  adjustIngredient(id: number, quantity: number, reason?: string | null): Observable<Ingredient> {
    return this.api.post<Ingredient>(`/inventory/ingredients/${id}/adjust`, { quantity, reason: reason ?? null });
  }
}
