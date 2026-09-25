# Cofre de la Feria de Artefactos

Abre el cofre gratuito de la **Artifact Fair**.

## Secuencia

```
9794 (Open) → 9778 (Claim Free Chest) → 9794 (Close)
```

## 1. Abrir Artifact Fair

**Proto:** `9794` — Payload `5B 00 00 00 00 01`

| Offset | Tipo | Valor | Descripción |
|--------|------|-------|-------------|
| 0x00 | u32 | 91 | Seq (cambia en cada paquete) |
| 0x04 | u8 | 0 | Reservado |
| 0x05 | u8 | 1 | Abrir Artifact Fair |

Ejemplo: `OUT proto=9794 plain=5b0000000001`

## 2. Reclamar cofre gratis

**Proto:** `9778` — Payload `55 00 00 00 01 00 01`

| Offset | Tipo | Valor | Descripción |
|--------|------|-------|-------------|
| 0x00 | u32 | 85 | Seq |
| 0x04 | u8 | 1 | Cofre gratis |
| 0x05 | u8 | 0 | Reservado |
| 0x06 | u8 | 1 | Confirmar |

Ejemplo: `OUT proto=9778 plain=55000000010001`

## 3. Cerrar Artifact Fair

**Proto:** `9794` — Payload `5D 00 00 00 00 00`

| Offset | Tipo | Valor | Descripción |
|--------|------|-------|-------------|
| 0x00 | u32 | 93 | Seq |
| 0x04 | u8 | 0 | Reservado |
| 0x05 | u8 | 0 | Cerrar Artifact Fair |

Ejemplo: `OUT proto=9794 plain=5d0000000000`

## Notas

- Ignorar el primer `u32` (solo es el seq del paquete).
- `proto=9794`: último byte `0x01` = abrir, `0x00` = cerrar.
- `proto=9778` es el que reclama el cofre gratis.
- El bot lo ejecuta en la acción `artifactFair` (`bot-action.ts`), con reset diario a las 02:00 UTC.
