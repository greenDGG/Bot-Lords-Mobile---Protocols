# Connection Flow — Lords Mobile Bot

## 1. OBTENER TOKEN (MITM)

Usar mitmproxy para capturar el tráfico del Lords Mobile (Steam o Android) y obtener:
- **JWT de login** (empieza con `eyJ0eXAiOiJKV1Qi...`)
- **access_token** (JWE, resultado del exchange)
- **IGG ID** (extraído del `sub` del JWT)
- **Proxy IP:port** (del servidor proxy IGG)

El JWT de login se intercambia por un **access_token** vía `POST https://cgi-dsa.iggapis.com/client/access_token/platform` con headers GPC. Si ya tenés el access_token, podés saltar este paso.

## 2. SET TOKEN

```csharp
SetTokenStringAsync(token, explicitIggId?)
```

- Si el token es un **JWT de login** (`typ":"JWT"` en el header):
  1. Extrae IGG ID del campo `sub` (base64url decode del payload)
  2. Intercambia por access_token via API IGG
- Si el token ya es un **access_token**: se usa directamente

## 3. PROXY AUTH

```csharp
ProxyAuthAsync() → (Success, GameIp, GamePort)
```

Envía `BuildProxyAuthPacket()` al proxy configurado en la cuenta.

### BuildProxyAuthPacket (582 bytes, proto 0x0413)

| Offset | Tamaño | Descripción |
|--------|--------|-------------|
| 0x00 | 2 | Length total = 0x0246 (582) |
| 0x02 | 2 | Proto = 0x0413 |
| 0x04 | 4 | IGG ID (uint32 LE) |
| 0x0C | 2 | Static: `0xC5 0x02` |
| **0x0E** | **1** | **Posible version byte (cambia entre reinicios)** |
| 0x0F | 1 | `0x01` |
| **0x10** | **1** | **Posible version byte (cambia entre reinicios)** |
| 0x11 | 1 | `0x05` |
| 0x12 | 0x32 (50) | UUID (36 ASCII chars si VPN, ceros si no) |
| 0x44 | 2 | JWT length (uint16 LE) |
| 0x46 | N | JWT bytes (hasta 416) |

### ⚠️ Bytes dinámicos 0x0E y 0x10

`buf[0x0E]` y `buf[0x10]` **cambian** cuando el servidor se reinicia o actualiza. No sabemos qué representan exactamente (versión de protocolo, flags de build, etc.). Valores observados:

| Fecha | buf[0x0E] | buf[0x10] |
|-------|-----------|-----------|
| Original | 0x32 | 0x05 |
| Post-reinicio | 0x34 | 0x09 |

Si las conexiones fallan, hay que capturar tráfico fresco con MITM para obtener los valores actuales.

### Respuesta exitosa (proto 0x03EB / 1003)

```
[25 00] [EB 03] [timestamp:8] [game_ip:ASCII null-term] [game_port:4] [tail...]
```

Devuelve **IP** y **puerto** del game server.

## 4. CONECTAR AL GAME SERVER

```csharp
ConnectToGameServer(ip, port) → bool
```

TCP directo al servidor del juego (IP:puerto del proxy response).

## 5. LOGIN PACKET

```csharp
GoOnline() → SendLoginPacket()
```

Proto 0x0414 (1044), 582 bytes. Estructura casi idéntica al proxy auth pero con offset de JWT en 0x44.

## 6. SECUENCIA DE INIT (10 paquetes)

`SendInitSequence()` envía 10 paquetes para inicializar el estado del personaje en el servidor:

| # | Proto | Wire | Body | Cifrado |
|---|-------|------|------|---------|
| 1 | [`1020`](protocols/1020.md) | 0x03FC | `[`[seq`](protocols/seq.md):4][IGG_ID:4][0x00000000:4]` | DES |
| 2 | [`1416`](protocols/1416.md) | 0x0588 | `[`[seq`](protocols/seq.md):4][0xFF x8]` | DES |
| 3 | [`1414`](protocols/1414.md) | 0x0586 | `[`[seq`](protocols/seq.md):4][0xFF x8]` | DES |
| 4 | [`1418`](protocols/1418.md) | 0x058A | `[`[seq`](protocols/seq.md):4][0xFF x8]` | DES |
| 5 | [`3002`](protocols/3002.md) | 0x0BBA | `[`[seq`](protocols/seq.md):4][0x00 0x00 0xFF]` | **Plano** |
| 6 | [`3405`](protocols/3405.md) | - | `[`[seq`](protocols/seq.md):4][count:1][ids:count×4]` | DES |
| 7 | [`11155`](protocols/11155.md) | - | `[`[seq`](protocols/seq.md):4][0x58:1]` | **Plano** |
| 8 | [`9721#1`](protocols/9721.md) | 0x3C19 | `[`[seq`](protocols/seq.md):4]` | **Plano** |
| 9 | [`9721#2`](protocols/9721.md) | 0x0FA2 | `[`[seq`](protocols/seq.md):4][0x01 0x2F 0xC1]` | **Plano** |
| 10 | [`4004`](protocols/4004.md) | 0x0FA4 | `[`[seq`](protocols/seq.md):4][0x2F 0xC1 0x00]` | **Plano** |

> \* Originalmente 3438, en sesiones recientes cambió a 3405. Los IDs del body vienen del packet 3402/3201 del servidor (`[count:1][id:4][flag:1]×count`).

Después del init se dispara `OnReady`.

## 7. HEARTBEAT (Keep-Alive)

```csharp
SendHeartbeat() — cada 15 segundos
```

| Campo | Valor |
|-------|-------|
| Proto | 1024 (0x0400, `_MSG_REQUEST_ACTIVE`) |
| Body | `[`[`seq`](protocols/seq.md)` :4]` (contador **propio**, empieza en 1, independiente del seq de init) |
| Frame | `[len:2][1024:2][`[`seq`](protocols/seq.md)` :4]` |

El heartbeat es el **único packet que se envía cifrado con DES** de forma regular. Los paquetes de init usan [seq](protocols/seq.md) en el body pero algunos van cifrados y otros no (ver tabla arriba).

## 8. SESIÓN DUPLICADA (Proto 1010)

Ver [`docs/protocols/1010.md`](protocols/1010.md) — el servidor envía este proto cuando otro dispositivo se conecta a la misma cuenta. Invalida la sesión actual.

## 9. REGLAS IMPORTANTES

- **No iniciar sesión en Steam** mientras el bot está conectado (invalida la sesión)
- **Proxy auth es obligatorio** — el game server descarta conexiones directas
- Los bytes en offsets **0x0E** y **0x10** del proxy auth packet cambian con cada versión/parche del servidor. Si el proxy rechaza la conexión, hay que capturar tráfico nuevo con MITM
