# Plan: obtener el reset diario del servidor (quitar `dailyResetTime` de la config)

> Estado: **EJECUTADO** (2026-10-02).
> Objetivo cumplido: el bot obtiene la hora de reset diario de la cuenta solo,
> del paquete de info del usuario, sin campo configurable.

## Resolución final

El reset diario **no** viene en un paquete dedicado: sale de la **fecha de
creación de la cuenta** que trae `1008 _MSG_LOGIN_ROLEINFO` (offset 210,
redondeado a la hora). La hora del día UTC de ese valor **es** el reset:

```
resetHourUtc = accountCreatedAt % 86400
```

Validado con 3 cuentas (reset reportado en UTC-3 ↔ offset 210 en UTC):

| IGG | offset 210 (UTC) | reset reportado (UTC-3) |
|---|---|---|
| 858715903 | 2020-07-11 18:00:00 | 15:00 |
| 699200412 | 2022-06-09 03:00:00 | 00:00 |
| 2011305644 | 2025-04-05 00:00:00 | 21:00 |

## Cambios aplicados

| Archivo | Cambio |
|---|---|
| `backend/src/bot/models/player.types.ts` | `PlayerInfo.accountCreatedAt: Date` |
| `backend/src/bot/parsers/player.parser.ts` | lee u32 en offset 210 (seguro si `length >= 214`) |
| `backend/src/bot/core/bot-instance.ts` | `getDailyResetSec()`: `sec = createdAt % 86400`; 0 si no hay 1008 o la fecha no es creíble (< 2015 o futura) |
| `backend/src/bot/actions/action-helpers.ts` | `nextByResetTime(resetSec: number)` (antes: `string` `'HH:MM'`); usa `serverNow()` de `clock-sync` en vez de la hora local; rango inválido → 0 = 00:00 UTC |
| `backend/src/bot/actions/daily.action.ts` | `ReclaimDailyAction` y `ForgeGiftAction` → `nextByResetTime(bot.getDailyResetSec())` |
| `backend/src/models/bot-config.ts` | −`dailyResetTime` (tipo + default) |
| `backend/src/database/schemas/account.schema.ts` | −`dailyResetTime` (interfaz + schema) |
| `backend/src/bot/core/account-manager.ts` | −`dailyResetTime` del `cleanConfig` |
| `backend/scripts/migrate-json-to-db.ts` | −`dailyResetTime` (schema + upsert) |
| `frontend/src/components/ConfigPanel.tsx` | −input "Reset diario" |
| `frontend/src/components/BotDetail.tsx` | −input "Reset diario" |
| `docs/protocols/1008.md` | **nuevo**: layout del 1008 + offset 210 = reset |
| `docs/protocols/index.md` | fila `1008` |
| `docs/config.md` | −fila `dailyResetTime`; `giftDaily.next` / `forgeGift.next` documentados como derivados del 1008 |

## Por qué no `1115 / 1116`

`_MSG_(REQUEST|RESP)_DAILY_RESET` (`Protocol.cs:69-70`) existe en el protocolo,
pero **0 apariciones** en 1715 logs (los "1680" del primer barrido eran el
proto `11157` de eventos). El servidor no lo manda espontáneamente y el bot no
lo pide → se descartó como fuente y se usó el 1008.

Otros descartes del barrido de logs (60 archivos, u32/u64 en la ventana
`[sesión, +25h]`): el único timestamp en medianoche UTC exacta era
`3602 _MSG_RESP_ACTIVITY_PREPARE` (inicio de actividades, no reset de cuenta);
`1025` trae la hora actual del servidor (2 × u64, ±1 s), no un próximo reset.

## Verificación

- `npx tsc --noEmit` en `backend/` y en `frontend/` → OK.
- `npx ts-node scripts/test-energy.ts` → 44 checks OK.
- `npx ts-node scripts/test-buffs.ts` → 64 checks OK.
- `npx ts-node scripts/test-hunt-coordinator.ts` → TODO OK (54 checks).
- `npm run build` en `frontend/` → OK.
- Pendiente (a cargo del usuario): reiniciar `npm run dev` del backend y
  observar en un log que `giftDaily.next` / `forgeGift.next` apunten al reset
  real de la cuenta.
