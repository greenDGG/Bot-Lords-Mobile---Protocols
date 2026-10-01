#!/usr/bin/env python3
"""Genera src/bot/data/buildings.json a partir de las tablas extraidas del cliente Lords Mobile.

Entradas (tablas .bytes extraidas con UnityPy de Table.unity3d + stringtables del cliente):
  buildkind_new_mb.bytes  -> id de construccion y su nombre            (29 B por fila)
  buildup_new_m.bytes     -> construccion x nivel: tiempo, costo,
                             poder y efectos                            (106 B por fila)
  effect.bytes            -> sólo para validar los efectos usados       (14 B)
  stringtable_{eng,spa}[2].bytes -> key -> texto

El catálogo de efectos (nombre, unidad, scope local/global) vive en
effects.json, generado por gen-effects.py; acá sólo se comprueba que cada
effectId exista y tenga nombre (no hay orden de ejecución entre scripts).

Layout de buildup_new_m (106 B):
  @0  u16 id
  @2  u16 kind         (= BuildingId)
  @4  u8  nivel
  @5  u32 tiempo en segundos
  @11 5 x u32 costo    [comida, piedra, madera, mineral, oro]
  @47 u32 might/poder acumulado del edificio a ese nivel
  5 slots de efectos con anchos distintos:
    @51 (u16 effectId, u32 value)
    @57 (u16 effectId, u32 value)
    @63 (u16 effectId, u16 value)
    @67 (u16 effectId, u32 value)
    @73 (u16 effectId, u32 value)
  El valor es el total del edificio a ese nivel (no un incremento).

Los efectos con unit '%' estan en centesimas (2000 = 20.00 %); sin unidad = entero
(ver effects.json para nombre/unidad/alcance de cada effectId).

Los nombres "name" son los que ya usa el frontend (etiquetas visibles sin cambios);
"nameTable"/"nameTableEn" son los del cliente y sirven de fallback (ids 103/104/108).

Uso:
  python gen-buildings.py --tables <stringtables+effect> --buildings <buildkind+buildup> --out <buildings.json>
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

COST_KEYS = ["food", "stone", "timber", "ore", "gold"]

# Etiquetas visibles del frontend (frontend/src/components/BotDetail.tsx, BuildingName)
FRONTEND_NAMES = {
    0: "\u2014",
    1: "Le\u00f1ador", 2: "Cantera", 3: "Mina", 4: "Granja",
    5: "Mansi\u00f3n", 6: "Cuartel", 7: "Hospital", 8: "Castillo",
    9: "Almac\u00e9n", 10: "Academia", 11: "Sal\u00f3n de Guerra", 12: "Muro",
    13: "Torre Vig\u00eda", 14: "Embajada", 15: "Forja", 16: "C\u00e1mara Tesoro",
    17: "Puesto Comercial", 18: "Prisi\u00f3n", 19: "Altar",
    20: "Guarida Monstruos", 21: "Manantial", 22: "Aguja M\u00edstica",
    23: "Gimnasio", 24: "Piedra Lunar", 25: "Artefacto",
    26: "Mina Poder M\u00e1gico", 27: "Cuartel Poder M\u00e1gico",
    28: "Casa de Aldea", 29: "Torre Defensa I", 30: "Torre Defensa II",
    31: "Torre Defensa III",
    100: "Desaf\u00edo de H\u00e9roe", 101: "Arena", 102: "Refugio",
    105: "Recompensa NPC", 106: "Apuesta", 107: "Monopoly",
    109: "Valhalla", 110: "Torre de Defensa", 111: "Reliquias",
    112: "Torre de Combate",
}

# Checks contra la wiki (gamesguideinfo / Lords Mobile fandom)
WIKI_COSTS = {(5, 2): (216, 360, 360, 264, 0), (1, 2): (150, 150, 0, 150, 0)}
WIKI_SCALAR = {(4, 25): ("costs", "stone", 3160180)}
WIKI_TIME = {(8, 25): 12042493, (4, 25): 2850260}
WIKI_MIGHT = {(5, 25): 219223, (4, 25): 126865}
WIKI_EFFECTS = {
    (8, 25): {(310, 200000), (234, 5), (233, 5), (279, 30)},
    (5, 25): {(260, 4875), (265, 662400), (251, 2000), (216, 200)},
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


def parse_effects(row):
    """Devuelve [(effectId, value)] de un registro de buildup_new_m."""
    out = []
    for offset, fmt in ((51, "<I"), (57, "<I"), (63, "<H"), (67, "<I"), (73, "<I")):
        eff_id = struct.unpack_from("<H", row, offset)[0]
        if eff_id in (0, 0xFFFF):
            continue
        value = struct.unpack_from(fmt, row, offset + 2)[0]
        out.append((eff_id, value))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True, help="dir con stringtables y effect.bytes")
    ap.add_argument(
        "--buildings",
        required=True,
        help="dir con buildkind_new_mb.bytes y buildup_new_m.bytes",
    )
    ap.add_argument("--out", required=True, help="buildings.json de salida")
    ap.add_argument("--indent", type=int, default=2, help="sangria del JSON (0 = una linea)")
    args = ap.parse_args()

    nm_es = make_nm(args.tables, "spa")
    nm_en = make_nm(args.tables, "eng")

    # effect.bytes -> sólo para validar que los efectos usados existan y tengan
    # nombre; el catálogo (name/unit/scope) vive en effects.json (gen-effects.py)
    effect_names = {}
    for row in load_rows(os.path.join(args.tables, "effect.bytes"), 14):
        eff_id, info_key, desc_key, _info_id, _value_key = struct.unpack_from(
            "<5H", row, 0
        )
        effect_names[eff_id] = (nm_es(info_key) or nm_es(desc_key)).strip()

    # buildkind_new_mb -> nombres de construccion
    names = {}
    for row in load_rows(os.path.join(args.buildings, "buildkind_new_mb.bytes"), 29):
        b_id = struct.unpack_from("<H", row, 0)[0]
        name_key = struct.unpack_from("<H", row, 2)[0]
        desc_key = struct.unpack_from("<H", row, 8)[0] or struct.unpack_from("<H", row, 10)[0]
        names[b_id] = {
            "id": b_id,
            "name": FRONTEND_NAMES.get(b_id) or (nm_es(name_key) or "").strip(),
            "nameTable": (nm_es(name_key) or "").strip(),
            "nameTableEn": (nm_en(name_key) or "").strip(),
            "desc": (nm_es(desc_key) or "").strip(),
        }

    # Construcciones cuyos efectos NO son pasivos: el cliente dice en su
    # descripción que son "potenciadores temporales" (el Altar sólo se activa
    # al ejecutar a un líder capturado). No se cuentan en Player Stats.
    temporal_ids = sorted(
        b_id for b_id, info in names.items() if "temporal" in info["desc"].lower()
    )

    # buildup_new_m -> niveles
    problems = []
    buildings = {}
    for row in load_rows(os.path.join(args.buildings, "buildup_new_m.bytes"), 106):
        b_id = struct.unpack_from("<H", row, 2)[0]
        level = row[4]
        time_s = struct.unpack_from("<I", row, 5)[0]
        raw_costs = struct.unpack_from("<5I", row, 11)
        costs = dict(zip(COST_KEYS, raw_costs))
        might = struct.unpack_from("<I", row, 47)[0]

        entry_effects = []
        for eff_id, value in parse_effects(row):
            if eff_id not in effect_names:
                problems.append(f"efecto {eff_id} desconocido en kind {b_id} nivel {level}")
            elif not effect_names[eff_id]:
                problems.append(f"efecto {eff_id} sin nombre en kind {b_id} nivel {level}")
                continue
            entry_effects.append({"id": eff_id, "value": value})

        b = buildings.setdefault(
            b_id,
            {
                "id": b_id,
                "name": names.get(b_id, {}).get("name") or f"Construccion {b_id}",
                "nameTable": names.get(b_id, {}).get("nameTable", ""),
                "nameTableEn": names.get(b_id, {}).get("nameTableEn", ""),
                "maxLevel": 0,
                "levels": {},
            },
        )
        b["maxLevel"] = max(b["maxLevel"], level)
        b["levels"][str(level)] = {
            "time": time_s,
            "costs": costs,
            "might": might,
            "effects": entry_effects,
        }

    # construcciones sin fila de buildup: solo nombre (ids de tabla sin datos)
    for b_id, info in names.items():
        if b_id == 0:
            continue
        if b_id not in buildings:
            buildings[b_id] = {
                "id": b_id,
                "name": info["name"],
                "nameTable": info["nameTable"],
                "nameTableEn": info["nameTableEn"],
                "maxLevel": 0,
                "levels": {},
            }

    for b_id, b in buildings.items():
        b["temporal"] = b_id in temporal_ids

    # --- validaciones ---
    missing_names = sorted(
        i for i in buildings if i not in FRONTEND_NAMES and not buildings[i]["name"]
    )
    if missing_names:
        problems.append(f"construcciones sin nombre: {missing_names}")

    if 19 not in temporal_ids:
        problems.append(
            "el Altar (19) ya no se marca como temporal: revisar su descripción "
            "(sus efectos sólo se aplican al ejecutar un líder)"
        )

    for (kind, level), want in WIKI_COSTS.items():
        got = buildings[kind]["levels"][str(level)]["costs"]
        if tuple(got[k] for k in COST_KEYS) != want:
            problems.append(f"wiki costs({kind},{level}): {got} != {want}")
    for (kind, level), (section, key, want) in WIKI_SCALAR.items():
        got = buildings[kind]["levels"][str(level)][section][key]
        if got != want:
            problems.append(f"wiki {section}.{key}({kind},{level}): {got} != {want}")
    for (kind, level), want in WIKI_TIME.items():
        got = buildings[kind]["levels"][str(level)]["time"]
        if got != want:
            problems.append(f"wiki time({kind},{level}): {got} != {want}")
    for (kind, level), want in WIKI_MIGHT.items():
        got = buildings[kind]["levels"][str(level)]["might"]
        if got != want:
            problems.append(f"wiki might({kind},{level}): {got} != {want}")
    for (kind, level), want in WIKI_EFFECTS.items():
        got = {(e["id"], e["value"]) for e in buildings[kind]["levels"][str(level)]["effects"]}
        if not want <= got:
            problems.append(f"wiki effects({kind},{level}): falta {sorted(want - got)}")

    if problems:
        for p in problems:
            print(f"ERROR: {p}", file=sys.stderr)
        raise SystemExit(f"{len(problems)} problemas, no se escribe el JSON")

    doc = {
        "source": "Table.unity3d (buildkind_new_mb / buildup_new_m) + stringtables",
        "costKeys": COST_KEYS,
        "buildings": {str(k): buildings[k] for k in sorted(buildings)},
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

    n_levels = sum(len(b["levels"]) for b in buildings.values())
    n_fx = sum(
        len(lv["effects"]) for b in buildings.values() for lv in b["levels"].values()
    )
    print(
        f"{args.out}: {len(buildings)} construcciones, {n_levels} niveles, "
        f"{n_fx} efectos"
    )
    print(
        "sin niveles: "
        + ", ".join(str(k) for k in sorted(buildings) if not buildings[k]["levels"])
    )
    print(
        "efectos no pasivos (temporales): "
        + (
            ", ".join(f"{k} {buildings[k]['name']}" for k in temporal_ids if k in buildings)
            or "ninguno"
        )
    )


if __name__ == "__main__":
    main()
