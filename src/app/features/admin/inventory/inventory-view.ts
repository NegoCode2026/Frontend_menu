import type { Ingredient, Page, Product } from '../../../core/models/models';

export type StockState = 'Agotado' | 'Por reponer' | 'Disponible' | 'Sin control';
type StockFields = Pick<Product, 'id' | 'name' | 'trackStock' | 'stockQuantity' | 'lowStockThreshold'>;
export type StockRow = StockFields & {
  kind: 'Ingrediente' | 'Plato';
  unit: string;
  price?: number;
  costPrice?: number;
  state: StockState;
};

function state(item: StockFields): StockState {
  if (!item.trackStock) return 'Sin control';
  if (item.stockQuantity <= 0) return 'Agotado';
  return item.stockQuantity <= item.lowStockThreshold ? 'Por reponer' : 'Disponible';
}

const priority: Record<StockState, number> = {
  Agotado: 0,
  'Por reponer': 1,
  Disponible: 2,
  'Sin control': 3,
};
const names = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export function stockRows(ingredients: Ingredient[], products: Product[]): StockRow[] {
  return [
    ...ingredients.map((item) => ({
      ...item,
      unit: item.unit,
      kind: 'Ingrediente' as const,
      state: state(item),
    })),
    ...products.map((item) => ({ ...item, unit: 'und', kind: 'Plato' as const, state: state(item) })),
  ].sort((a, b) => priority[a.state] - priority[b.state] || names.compare(a.name, b.name));
}

// Spring entrega los metadatos bajo "page" cuando usa VIA_DTO.
export function pageCount<T>(response: Page<T> & { page?: { totalPages: number } }): number {
  return response.page?.totalPages ?? response.totalPages ?? 1;
}

export function searchText(text: string): string {
  return text.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}
