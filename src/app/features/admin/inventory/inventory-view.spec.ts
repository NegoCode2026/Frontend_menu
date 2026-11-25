import { expect, it } from 'vitest';
import { pageCount, searchText, stockRows } from './inventory-view';
import type { Ingredient, Product, Page } from '../../../core/models/models';

it('prioriza lo agotado y separa las existencias sin control incluso cuando dos artículos comparten ID', () => {
  const item = {
    id: 1,
    name: 'Café',
    stockQuantity: 0.5,
    lowStockThreshold: 0.5,
    trackStock: true,
    unit: 'kg',
  };
  const rows = stockRows(
    [item as Ingredient],
    [
      { ...item, name: 'Tinto', stockQuantity: 0 } as Product,
      { ...item, id: 2, name: 'Té', stockQuantity: 0, trackStock: false } as Product,
    ],
  );
  expect(rows.map((r) => [r.kind, r.state])).toEqual([
    ['Plato', 'Agotado'],
    ['Ingrediente', 'Por reponer'],
    ['Plato', 'Sin control'],
  ]);
  expect(searchText(' CAFÉ ')).toBe('cafe');
});

it('lee ambos formatos de paginación del API', () => {
  const page: Page<never> = { content: [], size: 100, number: 0, totalPages: 3, totalElements: 280 };
  expect(pageCount(page)).toBe(3);
  expect(pageCount({ ...page, page: { totalPages: 2 } })).toBe(2);
});
