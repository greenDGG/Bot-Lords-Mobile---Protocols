#!/usr/bin/env python3
"""Genera backend/src/bot/data/daily-missions.json (misiones diarias, proto 3144).

Fuentes (GameAssets del cliente):
  DailyMission.txt      191 filas x 28 B: <HBHIHIHIBHHH>
                        u16 id, u8 missionRank, u16 type, u32 requirement,
                        (u16 rewardType, u32 rewardValue) x2,
                        u8 rewardEnergyValue, 3 x u16 reserve.
  DailyMissionKind.txt   31 filas x 19 B: <HHHBHHII>
                        u16 id (=type de arriba), u16 iconID, u16 descStringID,
                        u8 restrictionType, u16 restrictionParameter,
                        u16 hintStringID, u16 r1, u16 r2.
  Strings/{Spa,Eng}/StringTable*.txt  descripción de cada kind.

Los cofres de PA (20/40/60/80/100) NO están en ninguna tabla: se verificaron
contra los logs (byte "pa" y byte "chestMask" del header del 3144):
  PA 25 -> mask 1 | PA 35 -> 1 | PA 40 -> 3 | PA 45 -> 3
  PA 50 -> 3 | PA 65 -> 7 | PA 70 -> 7   (20*boxRank)

Uso:
  python backend/scripts/gen-daily-missions.py --gameassets <dir GameAssets> \
      --out backend/src/bot/data/daily-missions.json
"""
import argparse
import json
import os
import struct
import sys


def load_rows(path):
    data = open(path, "rb").read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1:
        raise SystemExit(f"{os.path.basename(path)}: kind inesperado {kind}")
    rec = (len(data) - 4) // count
    if rec * count != len(data) - 4:
        raise SystemExit(f"{os.path.basename(path)}: recsize {rec} no divide el payload")
    return [data[4 + i * rec: 4 + (i + 1) * rec] for i in range(count)], rec


def clean(text):
    if not text:
        return None
    out, depth_sq, depth_lt = [], 0, False
    for ch in text:
        if ch == "[":
            depth_sq += 1
        elif ch == "]":
            if depth_sq:
                depth_sq -= 1
        elif ch == "<":
            depth_lt = True
        elif ch == ">":
            depth_lt = False
        elif depth_sq == 0 and not depth_lt:
            out.append(ch)
    return "".join(out).replace("\\n", " ").strip() or None


def nm_factory(gameassets, lang):
    base = os.path.join(gameassets, "Strings", lang)
    st = open(os.path.join(base, "StringTable.txt"), "rb").read()
    idx = open(os.path.join(base, "StringTable2.txt"), "rb").read()
    data_start = struct.unpack_from("<I", st, 0)[0]

    def nm(key):
        if key <= 0 or 4 + key * 2 > len(idx):
            return None
        i = struct.unpack_from("<H", idx, 4 + (key - 1) * 2)[0]
        if i == 0 or 4 + i * 8 + 8 > len(st):
            return None
        off, length = struct.unpack_from("<II", st, 4 + i * 8)
        if data_start + 4 + off + length > len(st):
            return None
        raw = st[data_start + 4 + off: data_start + 4 + off + length].decode("utf-8", "replace")
        return clean(raw)
    return nm


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gameassets", required=True, help="directorio GameAssets del cliente")
    ap.add_argument("--out", default=os.path.join("backend", "src", "bot", "data", "daily-missions.json"))
    args = ap.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ga = args.gameassets
    nm_spa = nm_factory(ga, "Spa")
    nm_eng = nm_factory(ga, "Eng")

    kind_rows, _ = load_rows(os.path.join(ga, "DailyMissionKind.txt"))
    kinds = {}
    for r in kind_rows:
        kid, icon, desc, restr, param, hint, _r1, _r2 = struct.unpack_from("<HHHBHHII", r, 0)
        kinds[kid] = {
            "icon": icon,
            "desc": nm_spa(desc),
            "descEn": nm_eng(desc),
            "hint": nm_spa(hint) if hint else None,
            "restr": restr,
            "param": param,
        }

    mis_rows, _ = load_rows(os.path.join(ga, "DailyMission.txt"))
    missions = {}
    for r in mis_rows:
        mid, mrank, mtype = struct.unpack_from("<HBH", r, 0)
        requirement = struct.unpack_from("<I", r, 5)[0]
        energy = r[21]
        k = kinds.get(mtype, {})
        entry = {
            "rank": mrank,
            "type": mtype,
            "requirement": requirement,
            "energy": energy,
            "icon": k.get("icon", 0),
            "desc": k.get("desc"),
            "descEn": k.get("descEn"),
            "hint": k.get("hint"),
            "restr": k.get("restr", 0),
            "param": k.get("param", 0),
        }
        missions[str(mid)] = entry

    # PA máxima por rango = suma de las energías de sus misiones (rank 7: 150)
    max_pa = {}
    for r in mis_rows:
        mid, mrank = struct.unpack_from("<HB", r, 0)
        max_pa[mrank] = max_pa.get(mrank, 0) + r[21]

    out = {
        "source": "LordsBot-Release/GameAssets (DailyMission + DailyMissionKind + Strings)",
        "generatedBy": "gen-daily-missions.py",
        "note": (
            "Misiones diarias (proto 3144/3143). 'energy' es el RewardEnergyValue "
            "que suma PA al reclamar; 'requirement' es el objetivo del contador. "
            "Los cofres de PA (20/40/60/80/100) no están en ninguna tabla: "
            "se verificaron contra los logs del header del 3144."
        ),
        "chests": [20, 40, 60, 80, 100],
        "maxPaByRank": {str(k): v for k, v in sorted(max_pa.items())},
        "count": len(missions),
        "missions": missions,
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    r7 = [m for m in missions.values() if m["rank"] == 7]
    print(f"misiones: {len(missions)} (rango 7: {len(r7)}) -> {args.out}")
    print(f"kinds: {len(kinds)} | PA max por rango: {out['maxPaByRank']}")
    print(f"cofres: {out['chests']}")


if __name__ == "__main__":
    main()
