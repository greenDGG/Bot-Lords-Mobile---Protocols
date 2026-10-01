import './data/techs.json'; // hace que tsc copie techs.json a dist
import * as fs from 'fs';
import * as path from 'path';

export interface ResearchStatTech {
  id: number;
  name: string;
  level: number;
  value: number;
}

export interface ResearchStat {
  key: string;
  name: string;
  unit: string;
  total: number;
  count: number;
  techs: ResearchStatTech[];
}

interface TechEntry {
  name: string;
  effect: { id: number; name: string; unit: string; values: number[] };
}

const TECHS: Record<string, TechEntry> = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'techs.json'), 'utf-8'));
    return (raw && raw.techs) || {};
  } catch {
    return {};
  }
})();

/**
 * Stats acumulados de una cuenta: agrupa por efecto (nombre + unidad) y suma el
 * valor del nivel actual de cada investigación ya investigada.
 * Los desbloqueos (valor 0) se descartan.
 */
export function computeResearchStats(techLevels: number[]): ResearchStat[] {
  const map = new Map<string, ResearchStat>();
  if (!Array.isArray(techLevels)) return [];
  for (let id = 1; id <= techLevels.length; id++) {
    const level = techLevels[id - 1] || 0;
    if (level <= 0) continue;
    const t = TECHS[String(id)];
    if (!t || !t.effect || !Array.isArray(t.effect.values) || t.effect.values.length === 0) continue;
    const idx = Math.min(level, t.effect.values.length) - 1;
    const value = t.effect.values[idx];
    if (!value) continue;
    const unit = t.effect.unit || '';
    const name = t.effect.name || `Efecto ${t.effect.id}`;
    const key = `${name}|${unit}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { key, name, unit, total: 0, count: 0, techs: [] };
      map.set(key, entry);
    }
    entry.total += value;
    entry.count += 1;
    entry.techs.push({ id, name: t.name, level, value });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
