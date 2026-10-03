# Monstruitos (Familiars) — ingeniería inversa

Estado: **implementado** (8210 + 8245 + 8231 → pestaña "Monstruitos"; 8226/8227 de uso implementados con el body completo del cliente real: coord del castillo emisor + petId + skillId, ver [8226](../protocols/8226.md)). Este doc junta el conocimiento de tablas, protos y mecánica usado para el parser.

## Fuentes

- `docs/Cosas de otro bot/Protocol.cs` — enum completo de protocolos (otro bot decompilado): rango PET = **8201..8256**.
- `C:\Users\green\Downloads\LordsBot-Release\GameAssets\` — tablas binarias del cliente (`Pet.txt`, `PetSkill.txt`, `PetSkillCD.txt`, `PetCombatSkill*.txt`, `Strings\Spa\StringTable.txt` + `StringTable2.txt`).
- `./logs/*/*.log` — capturas RECV reales (24 cuentas distintas).

## Protos observados (RECV en logs)

| Proto | Frecuencia (≈) | Estado |
|-------|----------------|--------|
| 8201 `_MSG_RESP_PET_RESOURCEINFO` | por login | sin decodificar (ánima/recursos de monstruitos) |
| 8202 `_MSG_RESP_PET_ITEMINFO` | por login | sin decodificar (ítems de monstruitos) |
| **8210 `_MSG_RESP_PET_LIST`** | 3914 | **decodificado e implementado** |
| 8216/8217 | por login | crafting (REQUEST/RESP), sin decodificar |
| 8218 `_MSG_RESP_PET_CURRENT_STARUP` | por login | 32 B todos ceros (sin starup en curso) |
| **8230** | por login | **decodificado**: fatiga (12 B: u16 fatigue, u16 max=45, u32 epoch, u32 0) |
| **8231** | por login + refrescos | **decodificado e implementado**: cooldown de skills activas (ver [8231](../protocols/8231.md)) |
| **8232** | por login | **decodificado**: buffs activos (12 B cabecera + u8 count + entries de 15 B) |
| 8237 | por login | upgrade stone, sin decodificar |
| 8240/8241 | por login | marchevent / march_end, sin decodificar |
| **8245 `_MSG_RESP_PET_LIST_EX`** | 3198 | **decodificado e implementado** |
| 8244 | frecuente (10400) | layout 5 B (`u16` + `u16` + `u8`) confirmado, semántica pendiente |
| 8255 | por login | sin decodificar |

8228 (`GETSKILL`) aparece solo 2 veces (cuerpo de 27 B, skill78) — sin decodificar. 8226/8227 sólo aparecen en las capturas del cliente real con el mod `PacketLogger` (ver [8226](../protocols/8226.md)); el bot los emite/recibe desde que se agregó el bucle de skills.

## Protocolos implementados

- [8210](../protocols/8210.md) — lista de monstruitos: petId, nivel (1..60), exp u24, flags, etapa (0/1/2), 4 skills (nivel + exp).
- [8245](../protocols/8245.md) — talentos de ejército: `{petId, nivel 1..10}` por talento desbloqueado.
- [8231](../protocols/8231.md) — cooldown de skills activas: `{skillId, availableAt epoch}`.
- [8226](../protocols/8226.md) — usar skill activa (body = coord del castillo emisor 3 B + petId + skillId) y [8227](../protocols/8226.md#respuesta-8227--17-b) su respuesta (`result 0` = usada con el CD nuevo, `6` = rechazada).

## Habilidades activas: uso, disponibilidad y cooldown

Tipos de skill (`PetSkill.Type @14`): **type 2 = pasiva de stats** (72, ya
implementadas en `playerStats`) y **type 1 = activa de marcha/combate** (36:
26 subj=1 soporte + 10 subj=2 ofensivas). Solo las type=1 tienen cooldown en
`8231` (22 ids distintos vistos en logs: 19 subj=1 + 3 subj=2).

### Disponibilidad (8231)

```
availableAt = últimoUso + CD[nivel]      // CD de PetSkillCD.txt, fila PetSkill.CoolDown, EN MINUTOS ×60
disponible  ⟺  availableAt <= serverNowSec()
```

Validado con 11705 capturas y un burst de 5 skills usadas al mismo segundo
(cuenta 1035379223, 2026-09-29): las 5 calzan al segundo con sus CDs
(48 h / 20 h / 34,5 h / 66,5 h / 89 h a los niveles de la época). Detalle y
caveats (valores stale → guardar `availableAt` monotónico) en
[8231.md](../protocols/8231.md).

### Fatiga (8230) — solo skills ofensivas (subj=2)

Body 12 B: `u16 fatigue, u16 max (=45), u32 epoch, u32 0`. En 3580/3581
capturas `fatigue = 0` (máx. observado 14). El `epoch` varía por cuenta/período
(la mayoría `2026-09-01T07:28` como render local). De las 36 skills type=1,
las **10 subj=2** (ofensivas) tienen `Fatigue` 1..6 en `PetSkill.txt` (gastan
fatiga por uso); las **26 subj=1** (soporte) tienen `Fatigue = 0` y no usan
este recurso.

### Buffs activos (8232)

Body: 12 B de cabecera (ceros) + `u8 count` + count × 15 B
`{u16 skillId, u8 nivel, u32 inicio, u32 0, u32 duraciónSeg}`. 3576 cuerpos con
`count = 0`; solo 5 con 1 buff (skill 89 nv10, duración 21600 s = 6 h).

### Uso (8226 / 8227)

Body del cliente real (captura con `PacketLogger`): `[u32 seq][3 B
desconocidos][u16 petId][u16 skillId]`. Los 3 bytes del medio todavía no se
identifican — sin ellos el server contesta `8227 result = 6`. Éxito =
`result 0` + eco de petId/skillId + `availableAt` nuevo (se guarda en el
mismo merge de cooldowns que el 8231). Detalle, muestras y experimentos en
[8226.md](../protocols/8226.md).

Uso automático: `FamiliarSkillsAction`
(`backend/src/bot/actions/familiar.action.ts`) con config por cuenta
`familiarSkills { enable, pets[] }`: por cada pet elegido dispara sus skills
activas sin cooldown (8231) y, si son ofensivas, con fatiga disponible
(8230); un intento rechazado no se repite en 10 min. Se configura en la
pestaña Config → "Monstruitos (skills activas)".

## Tablas estáticas (GameAssets)

### `Pet.txt` — PetTbl, 81 B/fila, 67 filas

| Offset | Tamaño | Campo | Notas |
|--------|--------|-------|-------|
| 0 | 2 | ID | petId (1..67) |
| 2 | 2 | HeroID | |
| 4 | 2 | Name | key de stringtable |
| 6 | 1 | TexType | |
| 7 | 1 | Rare | 1..5 (5 = plantillas sin usar: Esgrimista, Gladiador...) |
| 8 | 2 | MapRatio | |
| 10 | 16 | PetRatio[4]×u16 | |
| 26 | 2 | CameraAngle | |
| 28 | 2 | SoulID | |
| 30 | 8 | PetSkill[4]×u16 | ids de `PetSkill.txt` (0 = slot libre) |
| **38** | **1** | **Army** | `0`=Infantería, `1`=Artillería, `2`=Caballería, `4`=Ejército — ámbito del talento |
| 39 | 12 | PetAttr[6]×u16 | |
| 51 | 6 | EffectRatio[3]×u16 | |
| 57 | 4 | StartupRatio | |
| **61** | **2** | **Tactics** | **id del Talento de Ejército** (`PetCombatSkill`); `0` = sin talento |
| 63 | 2 | AwakenItem | |
| 65 | 2 | AwakenItemCount | |
| 67 | 7 | Reserve | |

**Mapeo clave**: `PetTbl.Tactics` → fila de `PetCombatSkill.txt`. Validado contra la wiki (lista de monstruitos): Terrizo(30)→talento1 "reduce DEF del Ejército", Baum(17)→2 "reduce DEF Infantería", Magmalius(18)→3 "reduce PS Artillería", Ingeniero(26)→4 "+ATQ Infantería", Jaziek(8)→5 "reduce PS Caballería". Los 42 pets con `Tactics>0` mapean 1:1 a los ids 1..43.

### `PetSkill.txt` — 69 B/fila, 108 filas

Campos (StructLayout del cliente `PetSkillTbl.cs`): `u16 ID @0`, `u16 NameKey @2`, `u16 Icon @4`, `u16 Eff1/2/3 @6/8/10` (Eff1 = key de StringTable con la desc de las skills activas), `u16 Status @12`, `u8 Type @14` (**2 = pasiva de stats (72 skills), 1 = activa de marcha/combate (36)**), `u8 Kind @15`, `u8 Subject @16`, `u8 Class @17`, `u8 UpLevel @18`, `u16 Diamond @19`, `u16 ZValue/XValue/YValue @22/24/26` + `AValue/BValue/CValue/DValue @28/30/32/34` (ids de filas de `PetSkillValue`), `u16 CoolDown @36`, `u16 Fatigue @38`, `u16 Experience @40` (id de la curva `PetSkillExp`), `byte OpenLevel[9] @42` (nivel de pet para abrir cada nivel 2..10 de la skill), resto = sonidos/partículas.

**`maxLevel = 10` para todas las skills** (ground truth: la UI del juego siempre muestra `x/10`). Dos campos que NO sirven para el tope:

- `u16 @18`: en 16 filas trae basura (`44298` = straddle de `UpLevel`(byte) + byte bajo de `Diamond`); para el resto coincide con 10 por casualidad.
- `PetSkillExp.txt` (42 B = `u16 id` + 10×`u32` umbrales de exp): `skill39` "Cautiverio Místico" (Magus) tiene solo 4 umbrales (→ sugería tope 5) y en las 3294 capturas 8210 su nivel observado máximo es 5, pero el juego la muestra `/10` — o sea que los umbrales de esa fila no determinan el tope visible. Abierto: de dónde salen los niveles 6..10 de esa skill.

### Pasivas de stats (type=2) y activas (type=1)

- **Pasivas (72)**: `effectId` = primer valor de la fila `XValue` (id de `Effect.txt`); el texto sale de `Effect.String_infoID` ("Vel. construcción +"), la **unidad del stat** de `Effect.ValueID` (StringTable: `''`, `'%'` o `' minutos'` — misma que usan investigación/talentos) y la magnitud de la fila `YValue` (10 valores, uno por nivel de skill). Ej.: skill3 "Manos ocupadas" → effect248 `Vel. construcción +` + valores 100..500 (unit 0 = % → 1%..5%); skill39 → effect357 `Fusionando Pacto +` + 1..5 (unit 1 = cantidad); skill73 → effect305 + 1800..21600 s (unit 2 = segundos → se convierten a minutos porque el efecto mide en `'minutos'`). **Estas pasivas entran en `playerStats`** (fuente `familiar`, label "Monstruitos"), agrupadas por `${String_infoID}|${ValueID}` igual que investigación/talentos, así que se suman en la misma fila del panel de stats (p. ej. tech6 1% + skill3 nv2 1.25% = 2.25%).
- **Activas (36)**: desc de StringTable (`Eff1`) con placeholders `%a..%g` = filas `Z,X,Y,A,B,C,D` (validado: skill100 `%a`=Z=20M de recursos, `%b`/`%c` = X/Y = 7%/15%; skill89 `%a`=Z=30..360 min, `%c`=Y=10..95%; skill74 `%b`=X). 4 skills (72,76,79,85) tienen desc estática sin placeholders; las kind31 (105-108, sin pet que las use) reutilizan desc de 97/99/100/101 con params propios incompletos.

### `PetSkillValue.txt` — 43 B/fila, 318 filas

`u16 id` + `u32 values[10]` (uno por nivel de skill) + `u8 unit`: **0 = % (valor/100), 1 = cantidad, 2 = segundos** (validado contra `PetCombatSkillValue`, donde los slots `%d` unit0 = 1500→15%). Las skills referencian filas por sus campos `Z/X/Y/A/B/C/D`; en las pasivas el `X` constante ES el `effectId`.

### `Effect.txt` — 14 B/fila, 550 filas (ids 1..1099, dispersos)

`u16 ID, String_infoID, StringID, InfoID, ValueID, StatusIcon, EffectIcon`. `String_infoID` = texto corto del buff ("Vel. construcción +", "Fusionando Pacto +"), `StringID` = descripción larga, `ValueID` = key de StringTable con la **unidad del stat** (`nm(ValueID)`: 4378 = `%`, 0 = `''`, 10051 = `' minutos'` — mismo campo que usa `gen-techs.py` para agrupar los efectos de investigación). Validación: effect248 = "Vel. construcción", effect357 = "Pactos Fusionados", effect456 = "Refuerzo de ATQ infantería a artillería", effect500 = "Almacenamiento de mineral de maná máx.".

### `PetCombatSkill.txt` — 76 B/fila, 43 filas (los talentos)

- `u16 ID @0` (= `PetTbl.Tactics`)
- `u16 NameKey @2` → nombre del talento ("Terremoto", "Filo letal"...)
- `u16 DescKey @6` → descripción con placeholders `%d` (%), `%f` (segundos), `%a/%b/%h/%g/%e`...

### `PetCombatSkillValue.txt` — 43 B/fila, 301 filas

**301 = 43 talentos × 6 filas** (bloque por talento: ids `6*(T-1)+1 .. 6*T`). Dentro del bloque:

| Slot | Tipo | Placeholder | Notas |
|------|------|-------------|-------|
| p0 (`6*(T-1)+1`) | u32[10] + unit | `%f` (segundos/100) | ej. talento 11: 1500 → 15 s |
| p2 (`6*(T-1)+3`) | u32[10] + unit | `%d` (% = valor/100) | ej. talento 5: 400..4000 → 4%..40% |
| p3, p4 (`+4`,`+5`) | u32[10] | otros (`%a`, `%b`...) | solo cuando la desc los usa |
| p5 (`+6`) | u32[10] | otro | |

Validación wiki (nv10): talento1 Terrizo = 15%, talento2 Baum = 40%, talento3 Magmalius = 40%, talento4 Ingeniero = 15%, talento5 Jaziek = 40% — todas calzan con `p2[9]`.

### StringTable (formato a dos archivos)

`Strings/<Idioma>/StringTable.txt` = data + tabla de (off,len) u32 por slot; `StringTable2.txt` = **índice key→slot** (u16 en `4+(key-1)*2`; key K usa la posición K-1). Mismo esquema que los `stringtable_{spa,spa}[2].bytes` del loader `make_nm()` de `gen-techs.py`. ⚠️ Leer el índice del mismo archivo da texto basura (validado: key 13767 da "Volver" con el índice interno y la desc correcta con `StringTable2.txt`).

## Mecánica (fuentes: texto del propio juego + wiki)

- 3 etapas: **Crías → Adulto → Anciano**; "El Talento se activa en la etapa Anciano" (string del cliente).
- El talento de ejército sube de nivel con **Orbe de Talento** (máx nv10) — 8245 reporta el nivel.
- Wiki de talentos por monstruito: https://familiahu.wordpress.com/2020/08/11/lista-de-monstruitos-lords-mobile/ · guía de etapas: https://www.ctentrenadores.es/activar-talento-de-ejercito-de-un-monstruito/

## Hipótesis abiertas

- **Ownership**: 8210 envía los monstruitos de los pactos desbloqueados de la cuenta; los no obtenidos llegan en estado por defecto y son indistinguibles de un recién obtenido nv1.
- **`flags` (@6 del 8210)**: siempre 0 en todas las capturas — sin uso conocido.
- **`Reserve[7]` de PetTbl**: sin decifrar.
- **Slots p0/p3/p4/p5** de `PetCombatSkillValue`: mapeados por inferencia (p0=%f, p2=%d); los demás solo parcialmente.
- **8201/8202/8218/8237/8255**: sin decodificar. **8228**: 2 muestras (27 B), sin decodificar. **8244**: layout 5 B confirmado, semántica pendiente.
- **8226/8227**: layout confirmado (`coord 3 B` + `[u16 petId][u16 skillId]`), queda validar en vivo el éxito (ver [8226](../protocols/8226.md)).

## Código

- Generador de datos: `backend/scripts/gen-familiars.py` → `backend/src/bot/data/familiars.json`
  - `python backend/scripts/gen-familiars.py --gameassets <GameAssets> --out backend/src/bot/data/familiars.json`
- Loader: `backend/src/bot/data/familiars-db.ts` (defs + `buildFamiliarViews()`)
- Parser/handler: `backend/src/bot/parsers/familiars.parser.ts`, `backend/src/bot/handlers/familiar.handler.ts` (8210, 8245, **8231** con merge monotónico de cooldowns)
- Comando de skill activa: `backend/src/bot/commands/familiar-skill.commands.ts` (`useFamiliarSkill()` → 8226) + evento gateway `useFamiliarSkill` en `backend/src/api/app.gateway.ts`
- Stats del jugador: `backend/src/bot/familiar-stats.ts` (`computeFamiliarStats()`, consumido por `features/player-stats.ts` como fuente `familiar`/label "Monstruitos"; los handlers 8210/8245 recalculan `bot.playerStats` y el bridge `familiarsUpdated` manda `playerStats` al frontend)
- Tests: `backend/scripts/test-familiars.ts` (78 checks con fixtures reales + decode de pasivas/activas + integración con playerStats)
