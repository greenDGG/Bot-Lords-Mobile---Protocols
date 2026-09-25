# Cifrado DES/ECB y protocolo binario

## Contexto

- **Juego**: Lords Mobile (IGG), Steam, Unity 6000.0.60f1, IL2CPP v2.197
- **Herramientas**: MelonLoader v0.7.3 Open-Beta (Il2CppInterop), Il2CppDumper, dnSpy, Ghidra, x64dbg, DIE
- **Objetivo original**: replicar LordsBot.dll (DNGuard) como mod MelonLoader sin GUI

## 1. NetworkManager.Cipher

El juego encripta paquetes con `NetworkManager.Cipher(Codon, Offset, Size, Durex)`:

- `Codon`: `Buffer<byte>` (accesible por Length + indexer)
- `Offset`: offset dentro del buffer
- `Size`: cantidad de bytes a procesar
- `Durex`: flag de dirección
  - `1024` = encriptar (outgoing, cliente → servidor)
  - `0` = no-op (el buffer no se modifica)

Primer hook Harmony: Prefix captura buffer ANTES de Cipher (plaintext), Postfix después (ciphertext).

> Confusión inicial: se vio `ModeValue=2` y se pensó que era el modo DES; `Durex=0` no desencripta, solo no hace nada.

## 2. La llave DES

Hook en `DESTransform.SetKey` (clase interna de .NET/Mono):

```
SetKey called: Key=4C2A232940212638  (4 veces, 4 instancias de DESTransform)
```

**KEY = `4C2A232940212638`** (8 bytes), fija para toda la sesión.

## 3. Verificación de la key (PT/CT)

| PT | CT |
|----|----|
| `010000009CF3AC29` | `DAA0A45BA8D690A1` |
| `02000000FFFFFFFF` | `DD99A4E3AE6D0BE8` |

Probado con `DES.new(key, DES.MODE_ECB)` en Python → coincidió.

### Detalles clave del comportamiento

- El buffer del juego es de **1024 bytes**; `Cipher` solo cifra los primeros 8.
- **Solo el primer bloque (8 bytes) se cifra**, el resto viaja en claro.
- Había *memory leak*: datos residuales del buffer no inicializado aparecían como CT "capturado" (confirmado con paquete #17, `Size=25`).
- DES opera sobre los bytes disponibles + basura del buffer si `Size < 8`.

## 4. Decisión: ECB, no CBC

- LordsMobile.dll original usaba `Durex=2` como "modo" — era un señuelo.
- El cifrado real es **DES/ECB/NoPadding**: no hay IV, no hay nonce, no hay CBC.
- Mismo PT siempre produce mismo CT (paquetes #1-4 idénticos entre sesiones).

## 5. Protocolo binario (NO JSON)

```
[opcode: 4 bytes LE] [payload: variable según opcode]
```

Opcodes de inicio de sesión:

| Opcode | Payload | Significado |
|--------|---------|-------------|
| 1 | `9CF3AC29` (u32 = 699200412) | Handshake inicial (timestamp o playerID) |
| 2 | `FFFFFFFF` | "No disponible" / placeholder |
| 3 | `FFFFFFFF` | "No disponible" / placeholder |
| 4 | `FFFFFFFF` | "No disponible" / placeholder |
| 7 | `05 C42C00 00C52C00 00C62C00 00C72C00 00CA2C00` | Array de 5 IDs |

El cliente nativo (IL2CPP) usa serialización binaria propia (`MessagePacket.Add()`), no JSON. Los "JSON de protocolo" del LordsBot original corresponden a la versión web/HTML5.

## 6. Referencias en dump.cs (Il2CppDumper)

- `MessagePacket` class: dump.cs línea 330230
- `Protocol` enum: dump.cs línea 36354
- `NetworkManager.Send(MessagePacket)`: línea 330726
- `NetworkManager.Peeping(MessagePacket)`: línea 330798
- `NetworkManager.Cipher`: línea 330739

## 7. Resumen del cifrado aplicado en el bot

- DES key: `4C2A232940212638` (confirmada correcta)
- Modo: ECB, NoPadding (algoritmo `System.Security.Cryptography` / Node `crypto` `des-ecb`)
- Solo se cifran los primeros `min(8, body_length)` bytes del body
- El header (`len + proto`) y los bytes posteriores al bloque cifrado van en claro
- **No todos** los init packets van cifrados (3002 es plaintext)

## 8. Pendiente histórico

- Hook de `Peeping` (entrante) con Harmony+Il2Cpp fallaba por tipos Il2Cpp exactos
- Alternativa: hookear en el punto donde se llaman los handlers `Recv_*`
- Mapear cada opcode a su significado completo (login, mapa, recursos, gremio, etc.)
