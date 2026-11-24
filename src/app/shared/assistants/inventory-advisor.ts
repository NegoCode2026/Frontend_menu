import { normalize, trainIntents } from './intent';

export interface RecipeCapacity {
  productId: number;
  productName: string;
  ingredientId: number | null;
  ingredientName: string | null;
  unit: string | null;
  stock: number | null;
  threshold: number | null;
  perServing: number | null;
  servings: number | null;
  tracked: boolean | null;
}
interface Ingredient {
  name: string;
  stockQuantity: number;
  unit: string;
}
const intent = trainIntents({
  stock: [
    'ingredientes por reponer',
    'stock bajo',
    'qué comprar',
    'compras y faltantes',
    'ingredientes bajo el mínimo',
  ],
  portions: [
    'cuántas porciones quedan',
    'revisar antes de abrir',
    'platos en riesgo',
    'cuántos platos puedo preparar',
    'rendimiento de recetas',
  ],
  missing: [
    'qué platos sin receta',
    'recetas incompletas',
    'faltan recetas',
    'sin seguimiento',
    'datos faltantes',
  ],
});
export function adviseInventory(
  question: string,
  rows: RecipeCapacity[],
  low: Ingredient[],
): string[] {
  const q = normalize(question);
  const groups = new Map<number, RecipeCapacity[]>();
  const uses = new Map<number, Set<string>>();
  for (const row of rows) {
    const group = groups.get(row.productId) ?? [];
    group.push(row);
    groups.set(row.productId, group);
    if (row.ingredientId !== null) {
      const dishes = uses.get(row.ingredientId) ?? new Set<string>();
      dishes.add(row.productName);
      uses.set(row.ingredientId, dishes);
    }
  }
  const hasName = (name: string | null) => name && q.includes(normalize(name));
  const focused = [...groups.values()].filter((group) =>
    group.some((r) => hasName(r.productName) || hasName(r.ingredientName)),
  );
  const scope = focused.length ? focused : [...groups.values()];
  const kind = intent(question) ?? (focused.length ? 'portions' : null);
  if (kind === 'stock') {
    const named = low.filter((i) => hasName(i.name));
    const filtered = named.length
      ? named
      : focused.length
        ? low.filter((i) => focused.some((g) => g.some((r) => r.ingredientName === i.name)))
        : low;
    return filtered.length
      ? filtered.map(
          (i) => `${i.name}: quedan ${i.stockQuantity} ${i.unit}; está en el mínimo o por debajo.`,
        )
      : ['Sin ingredientes bajo el mínimo para esta consulta.'];
  }
  if (kind === 'missing') {
    const incomplete = scope.filter((group) => group.some((r) => !r.tracked));
    return incomplete.length
      ? incomplete.map(
          (g) =>
            `${g[0].productName}: ${g[0].ingredientId === null ? 'sin receta registrada' : 'hay ingredientes sin seguimiento'}.`,
        )
      : ['Todos los platos consultados tienen recetas con seguimiento.'];
  }
  if (kind !== 'portions')
    return ['Puedo revisar existencias bajas, porciones por plato y recetas sin seguimiento.'];
  const capacities = scope
    .flatMap((group) => {
      if (group.some((r) => r.servings === null)) return [];
      const limit = group.reduce((a, b) => (a.servings! <= b.servings! ? a : b));
      const shared = [...(uses.get(limit.ingredientId!) ?? [])].filter(
        (name) => name !== limit.productName,
      );
      return [
        {
          n: limit.servings!,
          text: `${limit.productName}: hasta ${limit.servings} porciones. ${limit.ingredientName}: ${limit.stock} ${limit.unit}, ${limit.perServing} por porción.${shared.length ? ' Comparte existencias con ' + shared.join(', ') + '.' : ''}`,
        },
      ];
    })
    .sort((a, b) => a.n - b.n);
  const output = capacities.slice(0, 10).map((c) => c.text);
  if (scope.length > capacities.length)
    output.push(
      `Sin capacidad verificable para ${scope.length - capacities.length} plato(s). Revisa las recetas y el seguimiento.`,
    );
  return output.length ? output : ['Aún no hay platos disponibles con recetas para esta consulta.'];
}
