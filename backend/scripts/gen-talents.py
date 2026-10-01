#!/usr/bin/env python3
"""Genera src/bot/data/talents.json: los 47 talentos del jugador de Lords Mobile.

Consumido por talent-db.ts (TALENT_DB / BRANCHES) y por talent-stats.ts, que suma
el aporte de los talentos activos dentro de Player Stats.

Entradas (tablas .bytes extraidas con UnityPy de Table.unity3d + stringtables):
  talent.bytes      -> id, clave de nombre (7101..7147) del talento
  talentlv.bytes    -> un renglon por nivel: (talentId, nivel, effectId, valor)
  talenttree.bytes  -> 13 filas x 4 columnas: en donde vive cada talento (la rama)
  effect.bytes      -> sólo para validar que los effectId existan y tengan nombre
  stringtable_{eng,spa}[2].bytes -> key -> texto

Ramas: el cliente no tiene nombres de rama, así que se usan las 4 columnas del
arbol (talenttree) como ramas, con etiquetas derivadas de su contenido.

Los valores de talentlv son el total acumulado a ese nivel (monotono), igual que
buildup_new_m de las construcciones: no hay que acumular niveles.

Uso:
  python gen-talents.py --tables <stringtables+tablas> --out <talents.json>
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

# Etiquetas de las 4 columnas de talenttree.bytes (slots 0..3).
BRANCH_NAMES = [
    "Asedio, Trampas y Entrenamiento",
    "Ofensiva y Escuadrón",
    "Producción",
    "Economía y Utilidad",
]


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


def load_named_effect_ids(tables):
    """effectId -> True si tiene nombre (misma regla que gen-effects.py)."""
    nm_es = make_nm(tables, "spa")
    nm_en = make_nm(tables, "eng")
    named = {}
    for row in load_rows(os.path.join(tables, "effect.bytes"), 14):
        eff_id, info_key, desc_key, _info_id, _value_key = struct.unpack_from(
            "<5H", row, 0
        )
        named[eff_id] = bool(
            (nm_es(info_key) or nm_es(desc_key)).strip()
            or (nm_en(info_key) or nm_en(desc_key)).strip()
        )
    return named


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True, help="dir con stringtables y las tablas")
    ap.add_argument("--out", required=True, help="talents.json de salida")
    ap.add_argument("--indent", type=int, default=2, help="sangría del JSON (0 = una línea)")
    args = ap.parse_args()

    nm_es = make_nm(args.tables, "spa")
    nm_en = make_nm(args.tables, "eng")
    effect_named = load_named_effect_ids(args.tables)

    problems = []

    # --- talentes: id, nombre, y su effectId fijo (por talento) ---
    talents = {}
    for row in load_rows(os.path.join(args.tables, "talent.bytes"), 10):
        talent_id, name_key, f4, f6, f8 = struct.unpack_from("<5H", row, 0)
        if talent_id in talents:
            problems.append(f"talent {talent_id} duplicado")
            continue
        name = nm_es(name_key).strip()
        name_en = nm_en(name_key).strip()
        if not name:
            problems.append(f"talent {talent_id}: clave {name_key} sin texto")
        talents[talent_id] = {
            "id": talent_id,
            "name": name,
            "nameEn": name_en,
            "extra": [f4, f6, f8],
        }

    # --- arbol: rama (columna), fila y banderas de cada talento ---
    tree = {}
    tree_rows = 0
    for row in load_rows(os.path.join(args.tables, "talenttree.bytes"), 20):
        row_id, cnt = struct.unpack_from("<2H", row, 0)
        tree_rows += 1
        for slot in range(4):
            talent_id, flags = struct.unpack_from("<2H", row, 4 + slot * 4)
            if talent_id == 0:
                continue
            if talent_id not in talents:
                problems.append(f"talenttree fila {row_id} slot {slot}: talent {talent_id} no existe")
                continue
            if talent_id in tree:
                problems.append(
                    f"talent {talent_id} en dos casillas (fila {tree[talent_id]['row']} y {row_id})"
                )
                continue
            tree[talent_id] = {"branch": slot, "row": row_id, "slot": slot, "flags": flags}

    for talent_id in talents:
        if talent_id not in tree:
            problems.append(f"talent {talent_id} fuera del arbol")

    # --- niveles: un renglon por nivel, valor acumulado monotono ---
    by_talent = {}
    for row in load_rows(os.path.join(args.tables, "talentlv.bytes"), 10):
        _rid, talent_id, lvl_field, effect_id, value = struct.unpack_from("<5H", row, 0)
        if talent_id not in talents:
            problems.append(f"talentlv: talent {talent_id} no existe")
            continue
        by_talent.setdefault(talent_id, []).append(
            {"level": lvl_field & 0xFF, "effectId": effect_id, "value": value}
        )

    for talent_id, levels in by_talent.items():
        levels.sort(key=lambda x: x["level"])
        expected = list(range(1, len(levels) + 1))
        got = [x["level"] for x in levels]
        if got != expected:
            problems.append(f"talent {talent_id}: niveles {got} != {expected}")
        prev = -1
        for lv in levels:
            if lv["value"] < prev:
                problems.append(
                    f"talent {talent_id} nivel {lv['level']}: valor {lv['value']} < {prev} (no monotono)"
                )
            prev = max(prev, lv["value"])
            if lv["effectId"] not in effect_named:
                problems.append(
                    f"talent {talent_id} nivel {lv['level']}: effect {lv['effectId']} no existe"
                )
            elif not effect_named[lv["effectId"]]:
                problems.append(
                    f"talent {talent_id} nivel {lv['level']}: effect {lv['effectId']} sin nombre"
                )
        # todos los niveles de un talento comparten effectId
        if len({x["effectId"] for x in levels}) != 1:
            problems.append(f"talent {talent_id}: los niveles no comparten effectId")

    for talent_id in talents:
        if talent_id not in by_talent:
            problems.append(f"talent {talent_id}: sin niveles en talentlv")

    if len(BRANCH_NAMES) != 4:
        problems.append("BRANCH_NAMES debe tener 4 ramas (las columnas del arbol)")

    if problems:
        for p in problems:
            print(f"ERROR: {p}", file=sys.stderr)
        raise SystemExit(f"{len(problems)} problemas, no se escribe el JSON")

    doc_talents = {}
    for talent_id in sorted(talents):
        t = talents[talent_id]
        tr = tree[talent_id]
        levels = by_talent[talent_id]
        doc_talents[str(talent_id)] = {
            "id": talent_id,
            "name": t["name"],
            "nameEn": t["nameEn"],
            "branch": tr["branch"],
            "row": tr["row"],
            "slot": tr["slot"],
            "flags": tr["flags"],
            "maxLevel": len(levels),
            "effectId": levels[0]["effectId"],
            "levels": {str(x["level"]): x["value"] for x in levels},
        }

    branches = []
    for slot, name in enumerate(BRANCH_NAMES):
        members = [tid for tid in sorted(tree) if tree[tid]["branch"] == slot]
        branches.append(
            {
                "id": slot,
                "slot": slot,
                "name": name,
                "count": len(members),
                "talents": members,
            }
        )

    doc = {
        "source": "Table.unity3d (talent, talentlv, talenttree) + stringtables",
        "branches": branches,
        "talents": doc_talents,
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

    n_levels = sum(len(v["levels"]) for v in doc_talents.values())
    n_effects = len({v["effectId"] for v in doc_talents.values()})
    print(
        f"{args.out}: {len(doc_talents)} talentos, {n_levels} niveles, "
        f"{n_effects} efectos, {len(BRANCH_NAMES)} ramas"
    )
    for b in branches:
        print(f"  rama {b['id']} ({b['name']}): {b['count']} talentos")


if __name__ == "__main__":
    main()
