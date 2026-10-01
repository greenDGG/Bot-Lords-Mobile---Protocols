#!/usr/bin/env python3
"""Genera src/bot/data/techs.json a partir de las tablas extraidas del cliente Lords Mobile.

Entradas (tablas .bytes extraidas con UnityPy de Table.unity3d + stringtables del cliente):
  techsp.bytes       -> id, kind, nombre, levelMax          (TechDataTbl, 26 B)
  techkindsp2.bytes  -> id de kind y su nombre              (TechKindTbl, 34 B)
  techlv.bytes       -> niveles: costo, tiempo, reqs, efecto(TechLevelTbl, 52 B)
  effect.bytes       -> id de efecto y sus strings          (Effect, 14 B)
  stringtable_{eng,spa}[2].bytes -> key -> texto

Nota de decode: la tabla de indices del stringtable mapea la key K en la posicion K-1
(u16 en 4 + (K-1)*2); usar K directo desplaza todos los textos una posicion.

Uso:
  python gen-techs.py --tables <dir> --out <techs.json>
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")


def load_rows(path, recsize):
    with open(path, "rb") as fh:
        data = fh.read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1:
        raise SystemExit(f"{os.path.basename(path)}: cabecera inesperada ({kind})")
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
        return st[data_start + 4 + off : data_start + 4 + off + length].decode("utf-8", "replace")

    return nm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True, help="directorio con los .bytes")
    ap.add_argument("--out", required=True, help="archivo techs.json de salida")
    ap.add_argument("--indent", type=int, default=2, help="sangría del JSON (0 = todo en una línea)")
    args = ap.parse_args()

    nm_es = make_nm(args.tables, "spa")
    nm_en = make_nm(args.tables, "eng")

    # kinds
    kinds = {}
    for row in load_rows(os.path.join(args.tables, "techkindsp2.bytes"), 34):
        kind, name_key = struct.unpack_from("<HH", row, 0)
        kinds[kind] = {"id": kind, "name": nm_es(name_key), "nameEn": nm_en(name_key)}

    # efectos
    effects = {}
    for row in load_rows(os.path.join(args.tables, "effect.bytes"), 14):
        eff_id, info_key, desc_key, _info_id, value_key = struct.unpack_from("<5H", row, 0)
        effects[eff_id] = {
            "id": eff_id,
            "name": (nm_es(info_key) or nm_es(desc_key)).strip(),
            "nameEn": (nm_en(info_key) or nm_en(desc_key)).strip(),
            "unit": (nm_es(value_key) or nm_en(value_key) or "").strip(),
        }

    # niveles por tech
    levels_by_tech = {}
    for row in load_rows(os.path.join(args.tables, "techlv.bytes"), 52):
        tech_id = struct.unpack_from("<H", row, 2)[0]
        level = row[4]
        time_s, grain, rock, wood, iron, gold = struct.unpack_from("<6I", row, 5)
        research_level = row[29]
        reqs = []
        for i in range(4):
            off = 30 + i * 3
            req_id, req_lv = struct.unpack_from("<HB", row, off)
            if req_id:
                reqs.append({"id": req_id, "level": req_lv})
        strength = struct.unpack_from("<I", row, 42)[0]
        eff_id, eff_val = struct.unpack_from("<HI", row, 46)
        levels_by_tech.setdefault(tech_id, []).append(
            {
                "level": level,
                "time": time_s,
                "costs": {"grain": grain, "rock": rock, "wood": wood, "iron": iron, "gold": gold},
                "researchLevel": research_level,
                "reqs": reqs,
                "strength": strength,
                "effect": {"id": eff_id, "value": eff_val},
            }
        )

    # techs
    techs = {}
    problems = []
    for row in load_rows(os.path.join(args.tables, "techsp.bytes"), 26):
        tech_id, kind, name_key, _graphic, level_max = struct.unpack_from("<HBHHB", row, 0)
        if kind not in kinds:
            problems.append(f"tech {tech_id}: kind {kind} sin nombre")
            continue
        rows = sorted(levels_by_tech.get(tech_id, []), key=lambda x: x["level"])
        if len(rows) != level_max:
            problems.append(f"tech {tech_id}: {len(rows)} niveles != levelMax {level_max}")
        effect_ids = {r["effect"]["id"] for r in rows}
        for eff_id in effect_ids:
            if eff_id not in effects:
                problems.append(f"tech {tech_id}: efecto {eff_id} inexistente")
        # efecto por tech (constante entre niveles en la practica)
        eff_id = rows[0]["effect"]["id"] if rows else 0
        eff = effects.get(eff_id, {"id": eff_id, "name": "", "nameEn": "", "unit": ""})
        techs[tech_id] = {
            "id": tech_id,
            "kind": kind,
            "name": nm_es(name_key),
            "nameEn": nm_en(name_key),
            "levelMax": level_max,
            "effect": {
                "id": eff_id,
                "name": eff["name"],
                "nameEn": eff["nameEn"],
                "unit": eff["unit"],
                "values": [r["effect"]["value"] for r in rows],
            },
            "effectIds": [r["effect"]["id"] for r in rows],
            "levels": rows,
        }

    doc = {
        "source": "Table.unity3d (techsp / techlv / effect / techkindsp2) + stringtables",
        "kinds": {str(k): v for k, v in sorted(kinds.items())},
        "techs": {str(k): techs[k] for k in sorted(techs)},
    }

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        if args.indent > 0:
            json.dump(doc, fh, ensure_ascii=False, indent=args.indent)
        else:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"kinds: {len(kinds)} | techs: {len(techs)} | niveles: {sum(len(v) for v in levels_by_tech.values())}")
    print(f"salida: {args.out} ({os.path.getsize(args.out)} bytes)")
    if problems:
        print("PROBLEMAS:")
        for p in problems[:40]:
            print("  -", p)
        raise SystemExit(1)
    print("sin problemas de integridad")


if __name__ == "__main__":
    main()
