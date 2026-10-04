import type { BotInstance } from '../core/bot-instance';
import { ArtifactsData } from '../models/artifacts.types';
import { parse9771 } from '../parsers/artifacts.parser';
import { ARTIFACT_DEFS, artifactName, gradeName, starName } from '../data/artifacts-db';
import { computePlayerStats } from '../features/player-stats';

function summarize(list: ArtifactsData['list']): string {
  const grades = new Map<number, number>();
  for (const a of list) {
    const g = ARTIFACT_DEFS[a.artifactId]?.grade || 0;
    grades.set(g, (grades.get(g) || 0) + 1);
  }
  const byGrade = [...grades.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([g, n]) => `${n} ${gradeName(g)}`)
    .join(', ');
  return `${list.length} artefactos${byGrade ? ` (${byGrade})` : ''}`;
}

/** 9771 — artefactos poseídos de la cuenta (nivel + estrellas). */
export function handle9771(bot: BotInstance, body: Buffer): void {
  try {
    const list = parse9771(body);
    if (!list) {
      bot.bot.log(`[ARTEFACTOS] 9771 no parseado (len=${body.length}) head=${body.subarray(0, 8).toString('hex')}`);
      return;
    }
    const prev = bot.artifacts?.list;
    bot.artifacts = { list };
    if (!prev || prev.length !== list.length) {
      bot.bot.log(`[ARTEFACTOS] 9771: ${summarize(list)}`);
    } else {
      for (const a of list) {
        const q = prev.find(x => x.artifactId === a.artifactId);
        if (!q) continue;
        const name = artifactName(a.artifactId);
        if (q.level !== a.level) {
          bot.bot.log(`[ARTEFACTOS] ${name}: nivel ${q.level} → ${a.level}`);
        }
        if (q.star !== a.star) {
          bot.bot.log(`[ARTEFACTOS] ${name}: ${starName(q.star)} → ${starName(a.star)}`);
        }
      }
    }
    bot.playerStats = computePlayerStats(bot);
    bot.emit('artifactsUpdated');
  } catch (e: any) {
    bot.bot.log(`[ARTEFACTOS] 9771 error parseando: ${e?.message}`);
  }
}
