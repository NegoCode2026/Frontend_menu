import { describe, expect, it } from 'vitest';
import { adviseMenu } from './menu-advisor';
import { adviseInventory, RecipeCapacity } from './inventory-advisor';
import type { PublicMenu } from '../../core/models/models';

const product = (id: number, name: string, price: number, available = true) => ({
  id,
  name,
  price,
  available,
  description: null,
  imageUrl: null,
});
const menu = {
  categories: [
    {
      name: 'Platos',
      products: [
        product(1, 'Pollo', 24000),
        product(2, 'Res', 39000),
        product(3, 'Pasta', 5000, false),
      ],
    },
    { name: 'Bebidas', products: [product(4, 'Limonada', 6000)] },
  ],
} as PublicMenu;
const recipe: RecipeCapacity = {
  productId: 1,
  productName: 'Arroz con pollo',
  ingredientId: 3,
  ingredientName: 'Pollo',
  stock: 1500,
  unit: 'g',
  perServing: 250,
  servings: 6,
  tracked: true,
  threshold: 400,
};

describe('Carta', () => {
  it('arma un combo disponible dentro del presupuesto colombiano', () => {
    const result = adviseMenu('Plato y bebida por $35.000', menu);
    expect(result.choices.map((x) => x.total)).toEqual([30000]);
    expect(result.choices[0].dishes.map((x) => x.id)).toEqual([1, 4]);
  });
  it('reconoce miles y presupuestos insuficientes', () => {
    expect(adviseMenu('Plato con bebida por 20 mil', menu).choices).toHaveLength(0);
  });
  it('evita sugerencias sobre alérgenos', () =>
    expect(adviseMenu('Tengo alergia', menu).choices).toHaveLength(0));
});
describe('Inventario', () => {
  it('explica porciones compartidas sin sumarlas', () => {
    const lines = adviseInventory(
      'Revisar antes de abrir',
      [recipe, { ...recipe, productId: 2, productName: 'Brochetas' }],
      [],
    );
    expect(lines[0]).toContain('6 porciones');
    expect(lines[0]).toContain('Comparte existencias con Brochetas');
  });
  it('reconoce recetas sin seguimiento', () => {
    const line = adviseInventory(
      'Platos sin receta',
      [{ ...recipe, ingredientId: null, tracked: null, servings: null }],
      [],
    );
    expect(line[0]).toContain('sin receta registrada');
  });
  it('consulta los mínimos registrados', () => {
    expect(
      adviseInventory(
        'Ingredientes por reponer',
        [],
        [{ name: 'Sal', unit: 'g', stockQuantity: 2 }],
      )[0],
    ).toContain('2 g');
  });
});
