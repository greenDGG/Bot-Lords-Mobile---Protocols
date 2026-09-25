export const MISSION_NAMES: Record<number, string> = {
  0x0101: 'Entrenar Soldados',
  0x0102: 'Investigación',
  0x0103: 'Misión 3',
  0x010e: 'Laberinto',
  0x0112: 'Fusionar Pactos',
  0x0113: 'Misión 6',
  0x0114: 'Misión 7',
  0x0117: 'Magnate del Reino',
  0x0109: 'Cazar Monstruos',
};

export function getMissionName(missionId: number): string {
  return MISSION_NAMES[missionId] || `Misión 0x${missionId.toString(16).padStart(4, '0')}`;
}
