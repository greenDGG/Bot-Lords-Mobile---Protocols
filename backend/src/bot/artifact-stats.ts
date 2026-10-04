import { ARTIFACT_DEFS, artifactEffectsAt, buildSetViews } from './data/artifacts-db';
import { ArtifactEffectView } from './models/artifacts.types';
import type { ArtifactsData } from './models/artifacts.types';

export interface ArtifactStatItem {
  artifactId: number;
  name: string;
  /** Nivel del artefacto (undefined en los bonus de set). */
  level?: number;
  /** Estrellas del artefacto (undefined en los bonus de set). */
  star?: number;
  value: number;
}

export interface ArtifactStat {
  key: string;
  name: string;
  unit: string;
  total: number;
  count: number;
  artifacts: ArtifactStatItem[];
}

/**
 * Stats del jugador por artefactos: cada artefacto poseído aporta los
 * efectos TOTALES de su nivel actual con su multiplicador de estrellas
 * (RelicsEnhance: ★0 ×1.0 … ★5 ×1.5, Bendecido ×2.0), y los sets aportan
 * sus tiers activos (collect / 3 estrellas / Bendecido, acumulativos).
 *
 * Las claves usan el mismo formato `${name}|${unit}` que investigación,
 * trajes, construcciones, talentos y monstruitos, así todos se suman en la
 * misma fila del panel de stats (source 'artifact').
 */
export function computeArtifactStats(data: ArtifactsData | undefined): ArtifactStat[] {
  const map = new Map<string, ArtifactStat>();

  const add = (eff: ArtifactEffectView, item: ArtifactStatItem): void => {
    if (!eff.value) return;
    const key = `${eff.name}|${eff.unit}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { key, name: eff.name, unit: eff.unit, total: 0, count: 0, artifacts: [] };
      map.set(key, entry);
    }
    entry.total += eff.value;
    entry.count += 1;
    entry.artifacts.push(item);
  };

  if (!data || !data.list || !data.list.length) return [];

  for (const a of data.list) {
    const def = ARTIFACT_DEFS[a.artifactId];
    if (!def) continue;
    const level = Math.min(Math.max(a.level, 0), def.levels.length);
    if (level <= 0) continue;
    const star = Math.min(Math.max(a.star, 0), 6);
    for (const eff of artifactEffectsAt(def, level, star)) {
      add(eff, {
        artifactId: a.artifactId,
        name: def.name || `Artefacto #${a.artifactId}`,
        level,
        star,
        value: eff.value,
      });
    }
  }

  for (const set of buildSetViews(data)) {
    for (const tier of set.tiers) {
      if (!tier.met) continue;
      for (const eff of tier.effects) {
        add(eff, { artifactId: set.id, name: set.name, value: eff.value });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
