/**
 * Reparto de un total de recursos entre varias cuentas (supply en batch).
 *
 * Regla (definida por el usuario): parte justa = total / nº de cuentas; lo que
 * una cuenta no pueda dar (capacidad < su parte) se reasigna a las que sí
 * tienen capacidad sobrante. Si la suma de capacidades >= total se cumple el
 * total exacto; si no, cada cuenta da lo que tiene (total truncado).
 *
 * Todo enteros (los recursos del 2014 son u32) y jamás se reparte por encima
 * de la capacidad de una cuenta.
 */

/**
 * @param total cantidad total a repartir (> 0)
 * @param caps  capacidad máxima de cada cuenta (>= 0), mismo orden que la salida
 * @returns     porción de cada cuenta; Σ = min(total, Σ caps)
 */
export function distributeTotal(total: number, caps: number[]): number[] {
  const n = caps.length;
  const given = new Array<number>(n).fill(0);
  if (total <= 0 || n === 0) return given;

  const totalCap = caps.reduce((a, c) => a + Math.max(0, c), 0);
  if (totalCap <= total) return caps.map(c => Math.max(0, c));

  // Parte justa (piso) + lo que sobra por capacidad de cada una
  const base = Math.floor(total / n);
  let left = total;
  for (let i = 0; i < n && left > 0; i++) {
    const give = Math.min(base, caps[i], left);
    given[i] = give;
    left -= give;
  }

  // Reasignación: lo que una no pudo dar pasa a las que siguen con capacidad
  while (left > 0) {
    const eligible: number[] = [];
    for (let i = 0; i < n; i++) if (given[i] < caps[i]) eligible.push(i);
    if (eligible.length === 0) break;
    const share = Math.ceil(left / eligible.length);
    for (const i of eligible) {
      if (left <= 0) break;
      const give = Math.min(share, caps[i] - given[i], left);
      given[i] += give;
      left -= give;
    }
  }

  return given;
}
