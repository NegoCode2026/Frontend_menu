/** Conserva los valores numéricos y exporta el texto de los clientes como texto literal. */
export function csvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  const literal = typeof value === 'string' && /^(?:[\t\r\n]|\s*[=+@\-＝＋＠－])/u.test(raw)
    ? "'" + raw : raw;
  return '"' + literal.replace(/"/g, '""') + '"';
}
