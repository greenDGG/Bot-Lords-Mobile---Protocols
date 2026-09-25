# Mission Record Parser

Parser binario para registros de misiones del proto 3633.

## Uso

```bash
node parser/tests.js
```

## Estructura

```
parser/
  formats.js   - Definiciones de formatos (tipos de registro, campos, offsets)
  parser.js    - Lógica de parsing
  tests.js     - Suite de tests
```

## Formatos soportados

### Packet Structure

```
[ HEADER: 4 bytes ][ RECORD 1: 10 bytes ][ RECORD 2: 10 bytes ][ ... ]
```

### Header (4 bytes)

| Offset | Tamaño | Campo | Tipo |
|--------|--------|-------|------|
| 0x00 | 4 | header | bytes (unknown) |

### Normal Record (10 bytes)

| Offset | Tamaño | Campo | Tipo |
|--------|--------|-------|------|
| 0x00 | 2 | missionId | uint16 LE |
| 0x02 | 1 | level | uint8 |
| 0x03 | 3 | unknown3 | bytes |
| 0x06 | 4 | padding | bytes |

### Waiting Record (10 bytes)

| Offset | Tamaño | Campo | Tipo |
|--------|--------|-------|------|
| 0x00 | 2 | status | uint16 LE (= 0x03e9) |
| 0x02 | 4 | timestamp | uint32 LE |
| 0x06 | 4 | padding | bytes |

## Ejemplo de uso

```javascript
const { parse, formatPacket } = require('./parser');

const packet = parse('090013002600020a9f6a000000000f0001d19e6a00000000');
console.log(formatPacket(packet));
```

Salida:

```
Header:
  raw:  09001300
  size: 4 bytes

Records: 2

Record #1
  Raw:        2600020a9f6a00000000
  Offset:     0x0004
  Type:       normal
  Mission ID: 2600 (9728)
  Level:      02 (2)
  Unknown 3:  0a9f6a
    uint24 BE: 6957834
    uint24 LE: 6957834
  Padding:    00000000

Record #2
  Raw:        0f0001d19e6a00000000
  Offset:     0x000e
  Type:       normal
  Mission ID: 0f00 (15)
  Level:      01 (1)
  Unknown 3:  d19e6a
    uint24 BE: 13737577
    uint24 LE: 6956753
  Padding:    00000000
```

## Agregar nuevos formatos

1. Definir el tipo en `formats.js` con sus campos.
2. Agregar lógica de detección en `parser.js` (función `parseRecord`).
3. Agregar tests en `tests.js`.
