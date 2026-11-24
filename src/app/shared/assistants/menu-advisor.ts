import { normalize, trainIntents } from './intent';
import type { PublicMenu } from '../../core/models/models';

type Dish = PublicMenu['categories'][number]['products'][number];
export interface Choice {
  dishes: Dish[];
  total: number;
}
const intent = trainIntents({
  combo: [
    'plato y bebida',
    'combo con jugo',
    'combinación con limonada',
    'almuerzo más bebida',
    'comer y tomar',
    'incluya una bebida',
  ],
  budget: [
    'opciones económicas',
    'platos baratos',
    'presupuesto máximo',
    'qué alcanza con pesos',
    'precio menor',
    'económico',
    'opciones por menos de',
  ],
  find: ['buscar plato', 'busco algo con pollo', 'recomienda hamburguesa', 'buscar en la carta'],
});

export function adviseMenu(
  question: string,
  menu: PublicMenu,
): { text: string; choices: Choice[] } {
  const q = normalize(question);
  const result = (text: string, choices: Choice[] = []) => ({ text, choices });
  if (/alerg|celiac|gluten|intoleran|sin lactosa|trazas/.test(q))
    return result('Consulta al restaurante sobre alérgenos y preparación.');
  const money = q.match(/(?:\$\s*)?(\d{1,3}(?:[., ]\d{3})+|\d+)(?:\s*(mil)\b)?/);
  const limit = money ? Number(money[1].replace(/[., ]/g, '')) * (money[2] ? 1000 : 1) : Infinity;
  const catalog = menu.categories.flatMap((c) =>
    c.products
      .filter((p) => p.available)
      .map((p) => ({
        dish: p,
        drink: /bebida|jugo|refresco|limonada|gaseosa|cerveza|coctel|cafe|agua/.test(
          normalize(c.name + ' ' + p.name),
        ),
      })),
  );
  const kind = intent(question);
  const words = q.match(/[a-z]{3,}/g) ?? [];
  const named = catalog.filter(({ dish }) =>
    words.some(
      (w) =>
        ![
          'con',
          'una',
          'del',
          'los',
          'las',
          'que',
          'para',
          'por',
          'mas',
          'sin',
          'plato',
          'bebida',
          'menu',
        ].includes(w) && normalize(dish.name).split(/\W+/).includes(w),
    ),
  );
  let choices: Choice[];
  if (kind === 'combo' || /\b(combo|bebida incluida|con bebida)\b/.test(q)) {
    const drinks = catalog.filter((x) => x.drink).sort((a, b) => a.dish.price - b.dish.price);
    const drink = named.find((x) => x.drink)?.dish ?? drinks[0]?.dish;
    const mains = named.some((x) => !x.drink) ? named : catalog;
    choices = drink
      ? mains
          .filter((x) => !x.drink)
          .map(({ dish }) => ({ dishes: [dish, drink], total: dish.price + drink.price }))
      : [];
  } else {
    if (!named.length && !money && kind !== 'budget')
      return result(
        'Prueba con el nombre de un plato, un presupuesto o una combinación con bebida.',
      );
    choices = (named.length ? named : catalog).map(({ dish }) => ({
      dishes: [dish],
      total: dish.price,
    }));
  }
  choices = choices
    .filter((c) => c.total <= limit)
    .sort((a, b) => a.total - b.total)
    .slice(0, 3);
  return result(
    choices.length
      ? 'Opciones disponibles en la carta'
      : 'No encontré opciones disponibles con esos criterios.',
    choices,
  );
}
