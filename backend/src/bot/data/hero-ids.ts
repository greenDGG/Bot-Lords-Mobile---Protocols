export const HERO_IDS: Record<number, string> = {
  0x0001: 'Guardian',
  0x0003: 'Sabio de Viento',
  0x0004: 'Reina De La Nieve',
  0x0005: 'Prima Donna',
  0x0006: 'Incineradora',
  0x0009: 'Arquera Letal',
  0x000d: 'Rayo Escarlata',
  0x0010: 'Tasgo Dinamita',
  0x0011: 'Cuervo Nocturno',
  0x0012: 'Matademonios',
  0x0014: 'Escudero del Mar',
  0x0017: 'Rastreadora',
  0x001d: 'Caballera Rosa',
};

export function heroName(id: number): string {
  return HERO_IDS[id] || `Hero ${id}`;
}
