#!/usr/bin/env python3
"""Genera src/bot/data/effects.json: catálogo único de efectos del cliente Lords Mobile.

Es la única fuente de nombres/unidades de efectos (id -> name, nameEn, unit, scope);
lo consumen costume-buffs.ts (BUFF_DEFS) y building-db.ts (BUILDING_EFFECTS).

Entradas (tablas .bytes extraidas con UnityPy de Table.unity3d + stringtables):
  effect.bytes            -> id de efecto y sus strings (14 B)
  stringtable_{eng,spa}[2].bytes -> key -> texto

Los demás generadores (gen-costumes.py, gen-buildings.py) siguen decodificando
effect.bytes sólo para validar que sus ids existan y tengan nombre, pero NO lo
escriben en su JSON: así no hay orden de ejecución entre scripts.

Los efectos con unit '%' estan en centesimas (2000 = 20.00 %); sin unidad = entero.
scope 'local' = efecto que sólo aplica dentro del reino (producción/almacenamiento
de construcciones); 'global' = afecta al jugador en cualquier parte.

Uso:
  python gen-effects.py --tables <stringtables+effect> --out <effects.json>
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

# Efectos que sólo aplican dentro del reino: producción, almacenamiento,
# capacidad de cola/cámara y desbloqueos (marcados con badge "Reino" en Player Stats).
LOCAL_EFFECT_IDS = {
    256, 257, 258, 259, 260,          # producción de recursos/oro
    261, 262, 263, 264, 265,          # almacenamiento de recursos/oro
    266,                              # capacidad del cuartel
    268, 269, 270, 271, 272,          # trampas/muralla/enfermería/cámara/suministro
    277, 278,                          # interés y depósito de la Cámara del Tesoro
    358, 359,                          # producción y almacenamiento de Ánima
    450, 452,                          # producción y almacenamiento de lunite
    499, 500,                          # producción y almacenamiento de mineral de maná
    1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
    1047, 1048, 1049,                  # desbloqueos
}


def load_rows(path, recsize=None):
    with open(path, "rb") as fh:
        data = fh.read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1:
        raise SystemExit(f"{os.path.basename(path)}: cabecera inesperada ({kind})")
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
    ap.add_argument("--tables", required=True, help="dir con stringtables y effect.bytes")
    ap.add_argument("--out", required=True, help="effects.json de salida")
    ap.add_argument("--indent", type=int, default=2, help="sangría del JSON (0 = una línea)")
    args = ap.parse_args()

    nm_es = make_nm(args.tables, "spa")
    nm_en = make_nm(args.tables, "eng")

    problems = []
    unnamed = []
    effects = {}
    for row in load_rows(os.path.join(args.tables, "effect.bytes"), 14):
        eff_id, info_key, desc_key, _info_id, value_key = struct.unpack_from(
            "<5H", row, 0
        )
        if eff_id in effects:
            problems.append(f"effect {eff_id} duplicado")
            continue
        name = (nm_es(info_key) or nm_es(desc_key)).strip()
        if not name:
            # efectos sin uso en la tabla: se conservan con name vacío
            unnamed.append(eff_id)
        effects[eff_id] = {
            "id": eff_id,
            "name": name,
            "nameEn": (nm_en(info_key) or nm_en(desc_key)).strip(),
            "unit": (nm_es(value_key) or nm_en(value_key) or "").strip(),
            "scope": "local" if eff_id in LOCAL_EFFECT_IDS else "global",
        }

    if problems:
        for p in problems:
            print(f"ERROR: {p}", file=sys.stderr)
        raise SystemExit(f"{len(problems)} problemas, no se escribe el JSON")

    doc = {
        "source": "Table.unity3d (effect) + stringtables",
        "effects": {str(k): effects[k] for k in sorted(effects)},
    }

    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        if args.indent:
            json.dump(doc, fh, ensure_ascii=False, indent=args.indent)
            fh.write("\n")
        else:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))

    n_local = sum(1 for e in effects.values() if e["scope"] == "local")
    print(
        f"{args.out}: {len(effects)} efectos ({n_local} locales, "
        f"{len(effects) - n_local} globales)"
    )
    if unnamed:
        print(
            f"aviso: {len(unnamed)} efectos sin nombre (no usados por nadie): "
            + ", ".join(str(i) for i in unnamed)
        )


if __name__ == "__main__":
    main()
