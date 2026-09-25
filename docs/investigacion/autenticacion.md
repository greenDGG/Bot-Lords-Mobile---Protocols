# Conexión y autenticación

Estado de la investigación sobre el flujo completo de login de Lords Mobile.

## Logro: conexión completa exitosa

- **22:15:41** — Proxy auth OK (37 bytes, proto `0x03EB`, IP 204.141.177.53)
- **22:15:42** — Login packet aceptado por el game server, bot en línea
- **22:15:42** — El servidor desconecta (faltaba heartbeat/handshake posterior)

## Packet proxy auth (sin VPN) — FUNCIONA

```
46 02 13 04 [iggid] 00 00 00 00 C5 02 32 01 09 05 [36 bytes ceros] [JWT size] [access_token JWE]
```

- Byte `0x0E` = `0x35` en código actual (`0x32`/`0x34` observado) — posible byte de versión
- Byte `0x10` = `0x09` sin VPN, `0x01` con VPN
- UUID en `0x12-0x43`: solo va cuando VPN activa
- JWT = **access_token (JWE)**, NO sso_token, NO login JWT

> ⚠️ Los bytes en offsets `0x0E` y `0x10` cambian con cada versión/parche del servidor. Si el proxy rechaza la conexión, hay que capturar tráfico nuevo con MITM. Ver [`docs/connection-flow.md`](../connection-flow.md).

## Inicio de sesión web (IGG accounts)

Flujo de login vía web (`nav_log.txt`):

```
https://accounts.igg.com/embed/login/index
https://accounts.igg.com/embed/login/confirm
https://accounts.igg.com/embed/login/chooseUserId
https://account.igg.com/embed/result?token=<JWT>
```

El JWT de login (header `typ":"JWT"`) contiene en el payload:

- `sub`: IGG ID (uint32)
- `accountId`, `uniqid`, `gameId`, `udid`, `email`, `lifecycle`, etc.

Se intercambia por un access_token (JWE) vía `POST https://cgi-dsa.iggapis.com/client/access_token/platform` con headers GPC (ver `capture_account.py`).

## Anti-bot en accounts.igg.com

`entry_debug.txt` documenta la respuesta del desafío anti-bot de IGG:

- Headers: `X-Antibot: 1`, `X-Anubis-Challenge: igg-api-guard`, `X-Akamai-Transformed`
- Body: página HTML "Making sure you're not a bot!" (Anubis challenge de `techaro.lol-anubis-auth-*`)
- Set-Cookie de verificación: `techaro.lol-anubis-auth-cookie-verification`
- Cookie de sesión: `PHPSESSID` en dominio `accounts.igg.com`

## Secuencia de init (10 paquetes)

Ver [`docs/connection-flow.md`](../connection-flow.md) para la tabla completa. Resumen de la investigación (`init-sequence-reference.md`):

| # | Proto | Wire | Body | Cifrado |
|---|-------|------|------|---------|
| 1 | 1020 | 0x03FC | `[seq:4][IGG_ID:4][00000000:4]` | DES |
| 2 | 1416 | 0x0588 | `[seq:4][FF×8]` | DES |
| 3 | 1414 | 0x0586 | `[seq:4][FF×8]` | DES |
| 4 | 1418 | 0x058A | `[seq:4][FF×8]` | DES |
| 5 | 3002 | 0x0BBA | `[seq:4][00 00 FF]` | **Plano** |
| 6 | 3438/3405 | - | `[seq:4][count:1][ids:count×4]` | DES |
| 7 | 11155 | - | `[seq:4][0x58]` | Plano |
| 8-9 | 9721 | 0x3C19/0x0FA2 | `[seq:4]` / `[seq:4][01 2F C1]` | Plano |
| 10 | 4004 | 0x0FA4 | `[seq:4][2F C1 00]` | Plano |

Notas:

- KeyDumper muestra proto=1020 para #2-4, pero Wireshark muestra 1416/1414/1418 → KeyDumper lee el `Cmd` interno, no el proto del header raw. **Wireshark es la fuente de verdad.**
- Los IDs de 3405 vienen de un packet previo (3402/3201) con formato `[count:1][id:4][flag:1]×count`.
- El heartbeat (proto 2 / `_MSG_REQUEST_ACTIVE`) usa su **propio contador de seq** (empieza en 1) y **no debe tener padding** (el juego no rellena a 12).

## Estado actual del bot

El flujo completo está implementado en `backend/src/engine/bot-engine.ts` (proxyAuth → connectToGameServer → goOnline → sendInitSequence → heartbeat cada 15s) y documentado en [`docs/connection-flow.md`](../connection-flow.md).
