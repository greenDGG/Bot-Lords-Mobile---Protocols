#!/usr/bin/env python3
"""Genera src/bot/data/costumes.json (trajes / Lord Equipment) a partir de las
tablas extraidas del cliente Lords Mobile.

Cadenas decodificadas (validadas contra los packets reales 1417/3804):

  item.bytes (88 B)                     -> id @0, nameKey @2,
                                            pares de efectos en @14/@16, @18/@20,
                                            @22/@24, @26/@28 = (equipment_effect_id, valor);
                                            Lord Equipment: byte @40 == 15 o u16 @74 != 0
  equipment_effect.bytes (14 B)         -> [id, effectId, v_g1, v_g2, v_g3, v_g4, v_g5]
                                            = valor del efecto por grade 1..5
  effect.bytes (14 B)                   -> id, infoKey, descKey, _, valueKey (unidad)
                                            (sólo para validar los buffIds usados;
                                            el catálogo está en effects.json)
  stringtable_{eng,spa}[2].bytes        -> key -> texto

Notas:
  * grade 6 (Mítico) no está en la tabla: es grade 5 x 1.4 (coincide con los
    valores publicados de los trajes: 500 -> 700, 3000 -> 4200, 2200 -> 3080, ...).
  * unidad '%' -> el valor se guarda en centésimas (640 = 6.40 %), igual que las
    investigaciones (techlv); unidad '' -> valor plano.

Uso:
  python gen-costumes.py --tables <dir> --out <costumes.json>
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

GRADE6_MULT = 1.4
PAIR_OFFSETS = (14, 18, 22, 26)
EQUIP_TYPE = 15


def load_rows(path, recsize=None):
    with open(path, "rb") as fh:
        data = fh.read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if recsize is None:
        recsize = (len(data) - 4) // count
    if 4 + count * recsize != len(data):
        raise SystemExit(
            f"{os.path.basename(path)}: {count} filas x {recsize} B != {len(data)} B"
        )
    return [data[4 + i * recsize : 4 + (i + 1) * recsize] for i in range(count)]


def make_nm(tables, tag):
    with open(os.path.join(tables, f"stringtable_{tag}.bytes"), "rb") as fh:
        st = fh.read()
    with open(os.path.join(tables, f"stringtable_{tag}2.bytes"), "rb") as fh:
        idx = fh.read()
    data_start = struct.unpack_from("<I", st, 0)[0]

    def nm(key):
        if key <= 0 or key * 2 + 2 > len(idx):
            return ""
        i = struct.unpack_from("<H", idx, 4 + (key - 1) * 2)[0]
        if 4 + i * 8 + 8 > len(st):
            return ""
        off, length = struct.unpack_from("<II", st, 4 + i * 8)
        if data_start + 4 + off + length > len(st):
            return ""
        return st[data_start + 4 + off : data_start + 4 + off + length].decode(
            "utf-8", "replace"
        )

    return nm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True, help="directorio con los .bytes")
    ap.add_argument("--out", required=True, help="costumes.json de salida")
    ap.add_argument("--indent", type=int, default=2)
    args = ap.parse_args()

    nm_es = make_nm(args.tables, "spa")
    nm_en = make_nm(args.tables, "eng")

    # effectos (nombre + unidad)
    effects = {}
    for row in load_rows(os.path.join(args.tables, "effect.bytes"), 14):
        eff_id, info_key, desc_key, _info_id, value_key = struct.unpack_from("<5H", row, 0)
        effects[eff_id] = {
            "id": eff_id,
            "name": (nm_es(info_key) or nm_es(desc_key)).strip(),
            "nameEn": (nm_en(info_key) or nm_en(desc_key)).strip(),
            "unit": (nm_es(value_key) or nm_en(value_key) or "").strip(),
        }

    # equipment_effect: id -> (effectId, valores por grade 1..5)
    equip_eff = {}
    for row in load_rows(os.path.join(args.tables, "equipment_effect.bytes"), 14):
        row_id, eff_id = struct.unpack_from("<HH", row, 0)
        values = list(struct.unpack_from("<5H", row, 4))
        equip_eff[row_id] = {"effectId": eff_id, "values": values}

    problems = []
    costumes = {}
    used_effects = set()
    n_items = 0
    n_no_fx = 0

    for row in load_rows(os.path.join(args.tables, "item.bytes"), 88):
        item_id = struct.unpack_from("<H", row, 0)[0]
        name_key = struct.unpack_from("<H", row, 2)[0]
        # Lord Equipment: item tipo 'equipamiento' (byte @40 == 15) o con indice
        # de equipamiento (@74 != 0), y al menos un slot apuntando a equipment_effect.
        if not (row[40] == EQUIP_TYPE or struct.unpack_from("<H", row, 74)[0]):
            continue
        if name_key <= 0:  # items placeholder (5000, 6000): sin nombre
            continue
        n_items += 1

        slots = []
        for off in PAIR_OFFSETS:
            ref, val = struct.unpack_from("<HH", row, off)
            if not ref:
                continue
            link = equip_eff.get(ref)
            if link is None:
                problems.append(f"item {item_id}: equipment_effect {ref} inexistente")
                continue
            if link["values"][4] != val:
                problems.append(
                    f"item {item_id}: slot {ref} valor {val} != grade5 {link['values'][4]}"
                )
            slots.append({"ref": ref, **link})

        if not slots:
            n_no_fx += 1
            continue

        buffs = {}
        for grade in range(1, 7):
            entries = []
            for s in slots:
                v = s["values"][grade - 1] if grade <= 5 else round(s["values"][4] * GRADE6_MULT)
                entries.append({"buffId": s["effectId"], "value": v})
                used_effects.add(s["effectId"])
            buffs[str(grade)] = entries

        costumes[str(item_id)] = {
            "id": item_id,
            "name": nm_es(name_key),
            "nameEn": nm_en(name_key),
            "slotCount": len(slots),
            "buffs": buffs,
        }

    # effect.bytes sólo para validar los buffIds usados; el catálogo de efectos
    # (name/unit/scope) vive en effects.json (gen-effects.py)
    for e in sorted(used_effects):
        if e not in effects:
            problems.append(f"effect {e} inexistente")
        elif not effects[e]["name"]:
            problems.append(f"effect {e} sin nombre")

    doc = {
        "source": "Table.unity3d (item / equipment_effect / effect) + stringtables",
        "grade6Multiplier": GRADE6_MULT,
        "costumes": {k: costumes[k] for k in sorted(costumes, key=lambda x: int(x))},
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        if args.indent > 0:
            json.dump(doc, fh, ensure_ascii=False, indent=args.indent)
        else:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"trajes tipo equipamiento: {n_items} | generados: {len(costumes)}"
          f" | sin efectos: {n_no_fx}")
    print(f"efectos distintos usados: {len(used_effects)}")
    print(f"salida: {args.out} ({os.path.getsize(args.out)} bytes)")
    if problems:
        print("PROBLEMAS:")
        for p in problems[:40]:
            print("  -", p)
        raise SystemExit(1)
    print("sin problemas de integridad")


if __name__ == "__main__":
    main()
