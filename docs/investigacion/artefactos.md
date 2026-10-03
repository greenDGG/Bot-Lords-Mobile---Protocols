# Artefactos (Artifacts) — ingeniería inversa

Estado: **implementado** (9771 → pestaña "Artefactos"). Este doc junta el
conocimiento de tablas, proto y mecánica usado para el feature completo
(parser, stats y UI).

## Fuentes

- `C:\Users\green\Downloads\LordsBot-Release\GameAssets\` — tablas binarias
  del cliente (`Item.txt`, `RelicsUpgrade.txt`, `RelicsCombination.txt`,
  `RelicsEnhance.txt`, `Effect.txt`, `Strings\{Spa,Eng}\StringTable*.txt`).
- `./logs/*/*.log` — capturas RECV reales (**26 cuentas distintas** con
  `Proto=9771`, una por login).
- Wiki (Timeless): los 3 tiers del set dan 2% + 3% + 5% = **10%** con las 3
  piezas bendecidas — coincide con los bonus acumulados de
  `RelicsCombination`.

## Proto implementado

- [9771](../protocols/9771.md) — lista de artefactos poseídos (S→C, push de
  login, `0x262B`, plano): `u16 count` + registros de 4 B
  `{u16 artifactId, u8 nivel 1..12, u8 estrellas 0..6}`.
  Ancla `2 + count*4 == len` válida en las 26 cuentas.

Protos del rango 97xx vistos en logs pero **sin decodificar**: `9701`, `9702`,
`9707`, `9708`, `9722`, `9751`, `9772` (acompaña 1× por login al 9771),
`9779`, `9785`, `9793`, `9795`. El cofre de la Feria está resuelto aparte en
[`cofre-artefactos.md`](cofre-artefactos.md) (`9794`/`9778`, acción
`artifactFair`).

## Tablas del cliente

### `Item.txt` — 88 B/fila

Artefactos = items **7001..7250** (244 filas, ids no contiguos: faltan
algunos). Campos usados: `u16 nameKey@2`, `u16 calidad@4`,
`u16 descKey@6`.

- **calidad → grado**: `3` = Extraordinario (Rare), `4` = Épico (Epic),
  `5` = Legendario (Legendary). Reparto real: **39 / 105 / 100**.
  (Rango "alto" de calidad en otros items; acá siempre entra 3..5.)

### `RelicsUpgrade.txt` — 52 B/fila, 244 × 12 = 2928 filas

| Offset | Tamaño | Campo |
|--------|--------|-------|
| 2 | 2 | u16 `artifactId` (7001..7250) |
| 4 | 2 | u16 `level` (1..12) |
| 8 | 4 | u32 coste **para subir de ESTE nivel** (0 en nv12) |
| 12 | 2 | u16 `recordItemId` (items 1443..1446) |
| 14 | 2 | u16 `recordCount` |
| 24..48 | 7×4 | pares `(u16 effectId, u16 value)` — huecos, **máx 3 usados** |

- **Los valores son el TOTAL acumulado en ese nivel, no deltas**: 7001 crece
  80 → 400 en sus 12 niveles (monótono en los 62 efectos × 244 artefactos,
  6039 incrementos y 0 decrecientes — chequeado en los tests).
- Coste validado: 7001 nv1 = 5000 … nv11 = 55000, nv12 = 0.

### `RelicsCombination.txt` — 44 B/fila, 3 filas (los sets)

| Offset | Tamaño | Campo |
|--------|--------|-------|
| 2 | 2 | u16 `nameKey` (0 en el set 1 → sin nombre) |
| 4,6,8 | 3×2 | u16 artifactId de las 3 piezas |
| 12..20 | 3×4 | pares `(u16 effectId, u16 value)` = bonus por tier |

Tiers en orden de slot:

| Slot | Condición (nuestra) | Significado |
|------|--------------------|-------------|
| 0 | `collect` | tener las 3 piezas |
| 1 | `star3` | las 3 piezas con ★3 o más |
| 2 | `blessed` | las 3 piezas Bendecidas (★6) |

**Los tiers se ACUMULAN** (no se pisan). Sets reales:

| # | Nombre | Piezas | Efecto y bonus por tier |
|---|--------|--------|--------------------------|
| 1 | *(vacío → "Set 1")* | 7031, 7093, 7095 | 251 `Vel. entrenamiento +`: 100, 200 (sin tier blessed) |
| 2 | Atemporal | 7022, 7036, 7070 | 249 `Vel. investigación +`: 200, 300, 500 |
| 3 | Viaje del rey | 7009, 7084, 7089 | 217 `DEF ejército +`: 500, 218 `PS ejército +`: 500, 216 `ATQ ejército +`: 500 |

- Set 1 vacío → `artifactSetName()` cae a `"Set 1"`.
- Set 2 completa: 200+300+500 = 1000 = **10%** (wiki ✓).
- Set 3 usa los únicos efectos que **no** aparecen en `RelicsUpgrade`
  (216/217/218 solo-vía-set; 62 efectos de upgrade + 3 = **65** en el
  catálogo).

### `RelicsEnhance.txt` — 26 B/fila

`u16@2 = (estrella << 8) | grado`, `u32@14` = **multiplicador en
centésimas**:

| Estrella | Multiplicador |
|----------|---------------|
| 0 | 10000 (×1.0) |
| 1 | 11000 |
| 2 | 12000 |
| 3 | 13000 |
| 4 | 14000 |
| 5 | 15000 |
| **6** | **20000 (Bendecido, ×2.0)** |

Mismo multiplicador para los 3 grados. El cálculo final es
`round(value * mult / 10000)` y se aplica **después** del total del nivel
(`applyStarMultiplier()`). Ej.: 7003 nv8 = 512 → ★4 = 717 (512×1.4 = 716.8).

### `Effect.txt` + StringTables

Mismo esquema que investigación/talentos: `String_infoID` = texto corto
("Vel. investigación +"), `ValueID` → unidad (`%`). El nombre se resuelve en
ES y EN (`name`/`nameEn` en `artifacts.json`); slot 0 de StringTable2 =
key sin mapear → se trata como ausente (fallback: otro idioma o
`Artefacto #id`). Los 65 efectos usados: 201-213, 216-218, 220, 240, 241,
248, 249, 251-254, 311-314, 338, 353-356, 360, 361, 365, 380-390, 392-402,
409-411, 417-419, 455, 511-513.

## Mecánica (validada)

- Los artefactos se obtienen en la **Feria/Evento de Artefactos** (cofre
  gratis diario, `artifactFair`) y se suben de nivel con coste (tabla
  `RelicsUpgrade`), hasta nv12.
- Las **estrellas** (0..5 + Bendecido 6) se ganan con `RelicsEnhance` y
  multiplican TODOS los efectos del artefacto, incluidos los del set.
- Set: los bonuses de tier se suman entre sí y con los efectos individuales;
  entran en `playerStats` con la misma `key = "nombre|unidad"` que
  investigación/talentos/monstruitos → **se fusionan en la fila del panel
  (p. ej. tech6 1% + artefacto 1% = 2%)**.
- Una cuenta nueva trae 39 artefactos en nv1/★0 (ids fijos: 7001, 7002,
  7003… los "de regalo"), los mismos que reporta el 9771.

## Código

- Generador de datos: `backend/scripts/gen-artifacts.py` →
  `backend/src/bot/data/artifacts.json`
  - `python backend/scripts/gen-artifacts.py --gameassets <GameAssets> --out backend/src/bot/data/artifacts.json`
- Loader/catálogo: `backend/src/bot/data/artifacts-db.ts`
  (`ARTIFACT_DEFS`, `ARTIFACT_SETS`, `STAR_MULTIPLIERS`, `artifactName`,
  `artifactEffectsAt`, `applyStarMultiplier`, `buildArtifactViews`,
  `buildSetViews`)
- Parser: `backend/src/bot/parsers/artifacts.parser.ts` (`parse9771`)
- Handler: `backend/src/bot/handlers/artifact.handler.ts` → guarda
  `bot.artifacts`, recalcula `bot.playerStats`, log `[ARTEFACTOS]` y emite
  `artifactsUpdated` → evento socket `artifacts` (registro en
  `handlers/index.ts`: `9771`)
- Stats: `backend/src/bot/artifact-stats.ts` (`computeArtifactStats()`,
  consumido por `features/player-stats.ts` como fuente `artifact` / label
  "Artefactos"; agrupa por `nombre|unidad` y agrega cada tier del set como
  un aporte `Set …` más)
- Payload: `getBotData` manda `artifacts: { list, sets }` (vistas) y el push
  `artifacts` incluye `playerStats` actualizado
- UI: `frontend/src/components/BotDetail.tsx`, pestaña *Artefactos* —
  resumen (conteo por grado, sets completos), grilla de artefactos con
  grado/nivel/★/efectos actuales + próximo nivel, y sección de sets con
  piezas y tiers (coloreados por `met`)
- Tests: `backend/scripts/test-artifacts.ts` (**68 checks**: parser con
  fixture body real de la cuenta 858715903 — count 138 con ★6 y las 3 piezas
  de cada set —, catálogo, monotonía, estrellas, sets, vistas, stats,
  fusión con research y el fixture completo)

## Hipótesis abiertas

- **`9772`** — aparece 1× por login justo después del 9771 (mismo patrón que
  9771/9772 en el rango); posible "info de mejora/estrellas", sin decodificar.
- Campos de `RelicsUpgrade` @16..22 y los huecos de efectos 4..7: sin uso.
- `recordItemId/recordCount` (items 1443..1446): items de "registro"
  probablemente del enhance; no se usan en el bot.
- No se observó ningun C→S de upgrade/enhance en los logs (el bot no
  mejora artefactos todavía); el orden de los protos de escritura
  (subir nivel / subir estrella) queda pendiente.
