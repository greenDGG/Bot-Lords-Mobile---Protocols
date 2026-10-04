# Reglas del proyecto

## Logs
Los archivos en ./logs pueden tener decenas de miles de líneas.
- NUNCA leas un log completo con Get-Content sin límites.
- Usá siempre `-Last N` o `-Tail N` con N chico (≤50) al leer o filtrar logs.
- Antes de hacer múltiples Select-String sueltos, pensá una sola query bien filtrada.
- Si necesitás contexto amplio del log, pedime confirmación antes de leerlo entero.
- Los timestamps `[HH:MM:SS]` de las líneas salen de `toLocaleTimeString()` al escribir (`bot-instance.ts`); la zona horaria de Windows **cambió en el pasado** (archivos con frame −3 y otros con +9, a veces a mitad de un archivo). NO derives épocas/orden absoluto a partir de esas horas: usá los epochs de los packets, `mtime` o `serverNowSec()` (`backend/src/utils/clock-sync.ts`).

## Datos (JSON + TS)
Los módulos de datos viven en `backend/src/bot/data/*` (p. ej. `heros-db.ts` + `heros.json`, `monsters.ts` + `monsters-data.json`).
- Un `.json` NUNCA debe tener el mismo nombre base que su `.ts`: con ts-node el `require('.../monsters')` resuelve el `.json` antes que el `.ts` y el módulo exporta `undefined`.
- Para que tsc lo copie a `dist`, el loader hace `import './nombre.json';` (con `resolveJsonModule`) y lo lee con `fs.readFileSync(path.join(__dirname, 'nombre.json'))`.
- Se regeneran con `python backend/scripts/gen-*.py --alltables <dir> --tables <dir> --out <archivo.json>`.
- `familiars.json` (monstruitos) se regenera con `python backend/scripts/gen-familiars.py --gameassets <dir GameAssets> --out backend/src/bot/data/familiars.json`; el loader es `familiars-db.ts` (lee `Pet.txt` + `PetSkill.txt` + `PetSkillValue.txt` + `Effect.txt` + `PetCombatSkill*.txt` + `Strings/{Spa,Eng}/StringTable*.txt`).
- `artifacts.json` (artefactos, proto 9771) se regenera con `python backend/scripts/gen-artifacts.py --gameassets <dir GameAssets> --out backend/src/bot/data/artifacts.json`; el loader es `artifacts-db.ts` (lee `Item.txt` + `RelicsUpgrade.txt` + `RelicsCombination.txt` + `RelicsEnhance.txt` + `Effect.txt` + `Strings/{Spa,Eng}/StringTable*.txt`). Tests: `npx ts-node backend/scripts/test-artifacts.ts`.
- `items.json` no tiene `.ts` propio (lo leen `app.gateway.ts`, `bot-instance.ts`, `treasure.handler.ts` con `fs.readFileSync`); se regenera con `gen-items.py … --prev <items.json>` y conserva `gems`/`drops` manuales. El frontend lo recibe por socket (`setItemsData`), no lo importa del disco.
- `hero-stages.json` (barrido: stamina por capítulo + héroe/medalla por etapa élite) se regenera con `python backend/scripts/gen-hero-stages.py --gameassets <dir GameAssets> --heros backend/src/bot/data/heros.json --out backend/src/bot/data/hero-stages.json`; loader: `hero-stages-db.ts` (`sweepStaminaCost`, `chapterForSweepIdx`, `stageForSweepIdx`). El frontend **no** tiene copia: la recibe por socket (`getHeroStages` → `heroStages`, como `items`/`techs`) y la cachea en `frontend/src/data/hero-stages.ts` (que además tiene los helpers del payload 1805). Tests: `npx ts-node backend/scripts/test-hero-stages.ts`.
- `emojis.json` (emoticonos del chat: 195 con nombre; los 40 básicos de las páginas 0-4 **no** tienen nombre en el cliente) se regenera con `python backend/scripts/gen-emojis.py --gameassets <dir GameAssets> --out backend/src/bot/data/emojis.json`; loader: `emojis-db.ts` (`getEmoji`, `emojiName`, `emojiIdx`, `randomEmoji`). Wire: 3003 con `num8=109` y 3001 con tipo `0x6D` (ver `docs/teories/emojis.md`). Tests: `npx ts-node backend/scripts/test-parse-chat.ts`.
- `daily-missions.json` (Diario: misiones 144-168 con `requirement`, `energy` PA, desc e icono + `chests:[20,40,60,80,100]`, que no están en ninguna tabla) se regenera con `python backend/scripts/gen-daily-missions.py --gameassets <dir GameAssets> --out backend/src/bot/data/daily-missions.json`; loader: `daily-missions-db.ts` (`dailyMissionInfo`, `dailyMissionState`, `DAILY_MISSION_CHESTS`). Wire: 3144 (snapshot) + 3143 (contador); ver `docs/protocols/3144.md`.
