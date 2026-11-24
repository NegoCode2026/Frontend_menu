import { describe, expect, it } from 'vitest';
import { csvCell } from './csv-cell';

describe('CSV de ventas', () => {
  it('conserva comillas, comas y saltos de línea en una sola celda', () => {
    expect(csvCell('Mesa "A",\npiso 2')).toBe('"Mesa ""A"",\npiso 2"');
  });
  it('exporta los prefijos especiales como texto y conserva el tipo numérico', () => {
    for (const text of ['+57 300', '  =Total', '@Cliente', '－Saldo', '\tMesa']) {
      expect(csvCell(text)).toBe('"' + "'" + text + '"');
    }
    expect(csvCell(-12)).toBe('"-12"');
    expect(csvCell(null)).toBe('""');
  });
});
