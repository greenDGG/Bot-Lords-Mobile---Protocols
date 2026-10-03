# Emoticonos / emojis / emotes

De dónde sale cada cosa y cómo viaja por el wire. Todo verificado contra
`GameAssets` del cliente y contra los `.log` del repo
(`npx ts-node backend/scripts/test-parse-chat.ts`).

## Resumen

| Dato | Dónde está |
|---|---|
| id que viaja por el wire, página, orden (`idx`), tamaño del sprite | `GameAssets/EMOJI.txt` (235 filas × 32 B) |
| **nombre** (Spa/Eng) | `GameAssets/Item.txt` → `nameKey` del item-emote, texto en `Strings/{Spa,Eng}/StringTable*.txt` |
| qué items se compran en la tienda de emoticonos | `GameAssets/EmojiShop.txt` (46 filas) |
| JSON usado por el bot | `backend/src/bot/data/emojis.json` (195 entradas) |

`Emote.txt` (25 filas), `HeroVoiceEmoji.txt` (61) y `talk*.txt` **no** son los
emoticonos del chat (las columnas "clave" no resuelven a nada con sentido).
Tampoco el proto `1408` (`0153 00 6104 0100`) — ese es *comprar item*, ver
`1409` en las notas viejas.

## EMOJI.txt

```
u16 id        // 1..3080, es el id del wire
u16 page      // página del panel (0..24)
u32 idx       // ORDEN dentro de la página: 2º u16 del payload
u16 w, u16 h  // tamaño del sprite (65..102 x 72..94 px)
u32 0
u32 0x1400    // 5120, constante
u32 0
u32 ?         // contador suelto (0 en las primeras filas)
u32 0
```

- `id = page*128 + n`, con `n` salto 1..~8 por página (la 5 tiene 63: los
  emoticonos de eventos). 235 filas, páginas 0..24.
- **Las páginas 0-4 (40 ids: 1-8, 129-136, 257-264, 385-392, 513-520) son los
  básicos**: no tienen item ni nombre en ningún archivo del cliente. Son los
  más usados en el chat (id 1, 10.726 veces) — se omiten de `emojis.json`.

## Nombre: Item.txt → StringTable

`Item.txt` tiene 88 B por fila. Campos usados:

```
u16 itemId @0 · u16 nameKey @2 · u16 type @4 · u16 descKey @6 · u16 emojiId @20
```

**`emojiId @20` es el id de `EMOJI.txt`** en los items cuya descripción habla
de "emote"/"emoticono". La correspondencia es biyectiva:

- 198 items con descripción de emoticono → 195 con `emojiId` válido →
  **195 de los 235 emojis** (exactamente todos los que no son básicos), sin
  duplicados ni colisiones.
- Confirmación independiente: los 46 items de `EmojiShop.txt` (slots 1-46)
  mapean a 46 `emojiId` distintos (641-686, página 5) con nombres correctos
  (`[Fiesta] Fortuna` / `[Party] Fortune`, …).
- 3 items-emote no traen nombre usable: 1316 (`emojiId = 0`), 1865/1866
  (`emojiId` 3042/3043, inexistentes) → sus emojis quedan con `name: null`
  (687, 703, 3073).

## Wire

### Recibido (3003)
`num8 = 109`, `msgLen = 4` en `+48`, payload `[u16 emojiId][u16 idx]`.
Verificado en **153.542 mensajes**: todos los ids existen en `EMOJI.txt` y el
`idx` coincide 1:1 con la tabla. Todos los mensajes con `num8 = 109` son
emoticonos (153.621 con `msgLen = 4`).

> El `msgLen` de `+48` vale para **todos** los tipos: `size = 50 + msgLen`.
> La regla vieja "`num8 != 0` → 54 fijos" desalineaba 10.433 mensajes
> (los `num8 = 108/116/117`), la correcta 0.

### Enviado (3001)
`[canal:1][0x6D][0x00][u16 4][u16 emojiId][u16 idx]` — 9 bytes sin seq.
Captura real (gremio, id 674 / idx 94):

```
55000000 01 6d 00 04 00 a202 5e00
```

Y el mismo emoji llega devuelto por el servidor como `016d000400a2025e00`.

## En el bot

- Datos: `backend/src/bot/data/emojis.json` + loader `emojis-db.ts`
  (`getEmoji`, `emojiName`, `emojiIdx`, `randomEmoji`).
- Recibir: `bot/models/chat.types.ts` (proto 3003) rellena `emojiId` /
  `emojiIdx` y deja en `message` `[Emoticono] <nombre>` (lo muestra el tab
  Chat del frontend sin cambios).
- Enviar: `bot-engine.ts → sendEmoji(id, channel)`; lo llama
  `bot/actions/emoji.action.ts` una vez por reset diario para la misión
  diaria "enviar 1 emoticono" (config `sendEmoji`, sección *Emoticonos*).

## Regenerar

```
python backend/scripts/gen-emojis.py --gameassets <dir GameAssets> --out backend/src/bot/data/emojis.json
npx ts-node backend/scripts/test-parse-chat.ts        # valida contra logs + EMOJI.txt
```
