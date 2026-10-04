#!/usr/bin/env python3
"""Genera src/bot/data/artifacts.json (Artefactos/Artifacts) a partir de las
tablas extraidas del cliente Lords Mobile.

Entradas (tablas binarias del cliente + stringtables):
  Item.txt                  -> artefactos = items 7001..7250: nombre, desc, grado
  RelicsUpgrade.txt         -> 244 artefactos x 12 niveles: coste, efectos por nivel
  RelicsCombination.txt     -> 3 sets (3 piezas c/u) con bonus por condicion
  RelicsEnhance.txt         -> multiplicador de estrellas por grado (0..5 + Bendecido)
  Effect.txt                -> efectos de stats: texto corto + unidad (ValueID)
  Strings/{Spa,Eng}/StringTable.txt + StringTable2.txt -> key -> texto

Notas de decode (validadas contra capturas 9771 y wiki):
  - RelicsUpgrade (52 B): u16 artifactId@2, u16 level@4 (1..12), u32@8 = coste
    para subir de ESTE nivel (0 en nv12), u16 recordItemId@12 / recordCount@14
    (items 1443..1446), y pares (u16 effectId, u16 value)@24..@48 (7 huecos,
    max 3 usados). Los valores del nivel N son el TOTAL acumulado en ese nivel
    (no deltas): 7001 crece 80..400 en los 12 niveles.
  - RelicsCombination (44 B): u16 nameKey@2, 3 ids de artefacto@4/6/8, y pares
    (u16 effectId, u16 value)@12..@20 = bonus por tier: slot0 = coleccionar
    todos, slot1 = todas las piezas con 3+ estrellas, slot2 = todas bendecidas.
    Los tiers se ACUMULAN (wiki: Timeless 2%+3%+5% = 10% con todo maxeado).
  - RelicsEnhance (26 B): u16@2 = (estrella<<8)|grado, u32@14 = multiplicador
    en centésimas: 10000,11000,12000,13000,14000,15000 (★0..5) y 20000
    (Bendecido, estrella 6). Mismo multiplicador para los 3 grados.
  - Item.txt (88 B): u16 nameKey@2, u16@4 = calidad (bajo: 3 = Extraordinario/
    Rare, 4 = Epic, 5 = Legendary; alto en otros items), u16 descKey@6.
  - StringTable2 slot 0 = key sin mapear (texto por defecto); se trata como
    ausente y se cae al otro idioma o a un nombre de relleno en la vista.
  - Efecto: valor unit '%' en centésimas (800 = 8%), ya con el total del nivel;
    el multiplo de estrellas se aplica DESPUES (round(value * mult / 10000)).

Uso:
  python gen-artifacts.py --gameassets <dir> --out artifacts.json
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

# Etiquetas de grado (keys de StringTable del sistema de calidad genericas)
GRADE_NAME_KEYS = {3: 7392, 4: 7393, 5: 7394}  # Extraordinario/Rare, Épico/Epic, Legendario/Legendary
# Bonus de tier por posicion del par en RelicsCombination
TIER_CONDITIONS = ["collect", "star3", "blessed"]
MAX_LEVEL = 12


def load_rows(path, recsize=None):
    with open(path, "rb") as fh:
        data = fh.read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1:
        raise SystemExit(f"{os.path.basename(path)}: cabecera inesperada ({kind})")
    if recsize is None:
        if (len(data) - 4) % count:
            raise SystemExit(f"{os.path.basename(path)}: longitud no divisible")
        recsize = (len(data) - 4) // count
    if 4 + count * recsize != len(data):
        raise SystemExit(
            f"{os.path.basename(path)}: {count} filas x {recsize} B != {len(data)} B"
        )
    return [data[4 + i * recsize : 4 + (i + 1) * recsize] for i in range(count)]


def make_nm(gameassets, lang):
    base = os.path.join(gameassets, "Strings", lang)
    with open(os.path.join(base, "StringTable.txt"), "rb") as fh:
        st = fh.read()
    with open(os.path.join(base, "StringTable2.txt"), "rb") as fh:
        idx = fh.read()
    data_start = struct.unpack_from("<I", st, 0)[0]

    def nm(key):
        # slot 0 = key sin mapear (texto por defecto) -> None
        if key <= 0 or key * 2 + 2 > len(idx):
            return None
        i = struct.unpack_from("<H", idx, 4 + (key - 1) * 2)[0]
        if i == 0 or 4 + i * 8 + 8 > len(st):
            return None
        off, length = struct.unpack_from("<II", st, 4 + i * 8)
        if data_start + 4 + off + length > len(st):
            return None
        return st[data_start + 4 + off : data_start + 4 + off + length].decode(
            "utf-8", "replace"
        )

    return nm


def strip_tags(text):
    if text is None:
        return ""
    out, depth = [], 0
    for ch in text:
        if ch == "<":
            depth += 1
        elif ch == ">":
            if depth:
                depth -= 1
        elif not depth:
            out.append(ch)
    return "".join(out).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gameassets", required=True, help="dir GameAssets (Item/Relics*.txt + Strings/)")
    ap.add_argument("--out", required=True, help="archivo artifacts.json de salida")
    ap.add_argument("--indent", type=int, default=2, help="sangria del JSON (0 = una linea)")
    args = ap.parse_args()

    nm_es = make_nm(args.gameassets, "Spa")
    nm_en = make_nm(args.gameassets, "Eng")
    G = args.gameassets
    problems = []

    def name2(key):
        return strip_tags(nm_es(key)), strip_tags(nm_en(key))

    # --- efectos de stats (Effect.txt, 14 B = 7 x u16) ---
    # ID, String_infoID (texto corto con '+'), StringID (desc larga), InfoID,
    # ValueID (key de StringTable con la unidad del stat: '', '%'),
    # StatusIcon, EffectIcon.
    effects = {}
    for row in load_rows(os.path.join(G, "Effect.txt")):
        eid, sinfo, _s_long, _info, _valid, _sicon, _eicon = struct.unpack_from("<7H", row, 0)
        es, en = name2(sinfo)
        if not es and not en:
            continue
        effects[eid] = {
            "name": es or en,
            "nameEn": en or es,
            "unit": ((nm_es(_valid) or nm_en(_valid) or "")).strip(),
        }

    # --- multiplicador de estrellas (RelicsEnhance, 26 B) ---
    # u16@2 = (estrella<<8)|grado, u32@14 = multiplicador centesimal.
    star_mults = {}
    for row in load_rows(os.path.join(G, "RelicsEnhance.txt")):
        enc = struct.unpack_from("<H", row, 2)[0]
        grade, star = enc & 0xFF, enc >> 8
        mult = struct.unpack_from("<I", row, 14)[0]
        if star in star_mults.get(grade, {}) and star_mults[grade][star] != mult:
            problems.append(f"RelicsEnhance grado {grade} estrella {star}: {star_mults[grade][star]} != {mult}")
        star_mults.setdefault(grade, {})[star] = mult
    grades_with_mult = sorted(star_mults)
    ref = star_mults[grades_with_mult[0]]
    for g in grades_with_mult[1:]:
        if star_mults[g] != ref:
            problems.append(f"RelicsEnhance multiplicadores distintos en grado {g}")
    star_multipliers = [ref[s] for s in sorted(ref)]
    if sorted(ref) != list(range(len(star_multipliers))):
        problems.append(f"estrellas incompletas: {sorted(ref)}")
    if star_multipliers and star_multipliers[0] != 10000:
        problems.append(f"multiplicador nv0 != 10000: {star_multipliers[0]}")

    # --- etiquetas de grado ---
    grades = {}
    for g, key in GRADE_NAME_KEYS.items():
        es, en = name2(key)
        grades[str(g)] = {"name": es, "nameEn": en}

    # --- artefactos: items 7001..7250 (Item.txt, 88 B) ---
    artifacts = {}
    for row in load_rows(os.path.join(G, "Item.txt")):
        iid = struct.unpack_from("<H", row, 0)[0]
        if not 7001 <= iid <= 7250:
            continue
        name_key, quality, desc_key = struct.unpack_from("<HHH", row, 2)
        grade = quality & 0xFF
        nes, nen = name2(name_key)
        des, den = name2(desc_key)
        if grade not in GRADE_NAME_KEYS:
            problems.append(f"item {iid}: calidad {quality} inesperada")
        artifacts[iid] = {
            "id": iid,
            "name": nes,
            "nameEn": nen,
            "desc": des or den,
            "grade": grade,
            "levels": [],
        }
    if not artifacts:
        raise SystemExit("no se encontraron artefactos (items 7001..7250)")

    # --- niveles (RelicsUpgrade, 52 B) ---
    for row in load_rows(os.path.join(G, "RelicsUpgrade.txt")):
        aid = struct.unpack_from("<H", row, 2)[0]
        level = struct.unpack_from("<H", row, 4)[0]
        art = artifacts.get(aid)
        if art is None:
            problems.append(f"RelicsUpgrade: artefacto {aid} sin fila en Item")
            continue
        cost = struct.unpack_from("<I", row, 8)[0]
        rec_item, rec_count = struct.unpack_from("<HH", row, 12)
        effs = []
        for off in range(24, len(row), 4):
            eid, value = struct.unpack_from("<HH", row, off)
            if not eid:
                continue
            if eid not in effects:
                problems.append(f"artefacto {aid} nv{level}: efecto {eid} sin Effect.txt")
                continue
            effs.append({"id": eid, "value": value})
        art["levels"].append(
            {
                "level": level,
                "cost": cost,
                "recordItem": rec_item,
                "recordCount": rec_count,
                "effects": effs,
            }
        )
    for art in artifacts.values():
        art["levels"].sort(key=lambda x: x["level"])
        lvls = [l["level"] for l in art["levels"]]
        if lvls != list(range(1, MAX_LEVEL + 1)):
            problems.append(f"artefacto {art['id']}: niveles {lvls}")

    # --- sets (RelicsCombination, 44 B) ---
    sets = []
    for row in load_rows(os.path.join(G, "RelicsCombination.txt")):
        sid = struct.unpack_from("<H", row, 0)[0]
        name_key = struct.unpack_from("<H", row, 2)[0]
        pieces = [struct.unpack_from("<H", row, off)[0] for off in (4, 6, 8)]
        nes, nen = name2(name_key)
        tiers = []
        for idx in range((len(row) - 12) // 4):
            eid, value = struct.unpack_from("<HH", row, 12 + idx * 4)
            if not eid:
                continue  # tier vacio (los huecos van al final)
            if idx >= len(TIER_CONDITIONS):
                problems.append(f"set {sid}: tier {idx} sin condicion conocida")
                continue
            if eid not in effects:
                problems.append(f"set {sid}: efecto {eid} sin Effect.txt")
                continue
            tiers.append(
                {
                    "condition": TIER_CONDITIONS[idx],
                    "effects": [{"id": eid, "value": value}],
                }
            )
        for p in pieces:
            if p not in artifacts:
                problems.append(f"set {sid}: pieza {p} sin fila en Item")
        sets.append({"id": sid, "name": nes, "nameEn": nen, "artifacts": pieces, "tiers": tiers})

    # efectos realmente usados (artefactos + sets)
    used = set()
    for art in artifacts.values():
        for lvl in art["levels"]:
            used.update(e["id"] for e in lvl["effects"])
    for s in sets:
        for tier in s["tiers"]:
            used.update(e["id"] for e in tier["effects"])
    used_effects = {str(e): effects[e] for e in sorted(used) if e in effects}

    doc = {
        "source": "LordsBot-Release/GameAssets (Item + RelicsUpgrade + RelicsCombination + RelicsEnhance + Effect)",
        "maxLevel": MAX_LEVEL,
        "grades": grades,
        "starMultipliers": star_multipliers,
        "effects": used_effects,
        "artifacts": {str(k): v for k, v in sorted(artifacts.items())},
        "sets": sets,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=args.indent or None)
        fh.write("\n")

    n_eff = sum(len(l["effects"]) for a in artifacts.values() for l in a["levels"])
    print(
        f"artifacts={len(artifacts)} levels={len(artifacts) * MAX_LEVEL} "
        f"effects={n_eff} usedEffects={len(used_effects)} sets={len(sets)} "
        f"starMult={star_multipliers} -> {args.out}"
    )
    for p in problems:
        print(f"PROBLEMA: {p}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
