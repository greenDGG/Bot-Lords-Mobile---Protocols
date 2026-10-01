#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera items.json (catálogo de ítems del cliente Lords Mobile).

Fuente: `item.bytes` + `stringtable_spa.bytes` del cliente (88 B/fila, u16 id @0,
u16 nameKey @2, u16 minutos @18).

  * `name`   → nameKey resuelto con el stringtable en español
  * `type`   → reglas sobre el nombre (cofre, acelerar, recurso, combate, hero,
               unico); TYPE_OVERRIDE conserva excepciones ya decididas a mano
  * `effect` → para aceleradores: [1, minutos * 60] (minutos en @18)
  * `gems` y `drops` → se conservan del items.json previo (son manuales:
               `docs/investigacion/items.md`)

RESOURCE_ITEM_IDS / BAG_ITEMS / ITEM_VALUES se RECONSTRUYEN buscando en el
cliente cada cantidad del previo ("60 000 000 de comida" → id 1103). Así se
corrigen ids que en el cliente son otra cosa (1029 = "Acelerar (1 min.)",
1035/1036/1038 ni existen) — esos ids se enviaban/valoraban mal en el supply.

Uso:
  python gen-items.py --alltables <dir> --tables <dir> --prev <items.json> --out <items.json>
"""
import argparse
import json
import os
import re
import struct
import sys

ITEM_RS = 88  # bytes por fila en item.bytes

# palabra del recurso -> clave de BAG_ITEMS / RESOURCE_ITEM_IDS
RECURSOS = {
    "comida": "wheat",
    "piedra": "stone",
    "madera": "wood",
    "mineral": "mineral",
    "oro": "gold",
}
NUM_RE = re.compile(r"^(\d[\d .,]*?)\s*(?:de\s+)?(comida|piedras?|mineral|madera|oro)\b")

# type que se respetan aunque la regla diga otra cosa (decidido a mano)
TYPE_OVERRIDE = {
    3701: "recurso",  # Fragmento
    3702: "recurso",  # Poción de EXP
}


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
        return " ".join(st[data_start + 4 + off: data_start + 4 + off + length].decode("utf-8", "replace").split())

    return nm


def load_items(path, nm):
    """id -> {nombre, minutos} desde item.bytes."""
    with open(path, "rb") as fh:
        data = fh.read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1 or len(data) != 4 + count * ITEM_RS:
        raise SystemExit(f"item.bytes: cabecera inesperada ({kind}, {count} filas)")
    out = {}
    for i in range(count):
        row = data[4 + i * ITEM_RS: 4 + (i + 1) * ITEM_RS]
        iid = struct.unpack_from("<H", row, 0)[0]
        out[iid] = {
            "nombre": " ".join(nm(struct.unpack_from("<H", row, 2)[0]).split()),
            "minutos": struct.unpack_from("<H", row, 18)[0],
        }
    return out


def clasifica(nombre):
    n = (nombre or "").lower()
    if "cofre" in n or "caja" in n:
        return "cofre"
    if re.match(r"^acel", n) or "martillo de oro" in n:
        return "acelerar"
    if re.match(r"^\s*\d[\d .,]*\s*(de\s+)?(comida|piedras?|mineral|madera|oro|gemas|ánima)", n):
        return "recurso"
    if "energ" in n and re.match(r"^\s*\d", n):
        return "acelerar"
    if any(w in n for w in ("escudo", "antiexplor", "retirar escuadrón", "botas aladas",
                            "corazón valiente", "reubicador", "sello emocionante")):
        return "combate"
    if "medalla" in n or "observador" in n:
        return "hero"
    return "unico"


def parse_cantidad(nombre):
    """'60 000 000 de comida' -> ('wheat', 6000000) | (None, None)"""
    m = NUM_RE.match((nombre or "").lower())
    if not m:
        return None, None
    digitos = m.group(1).replace(" ", "").replace(".", "").replace(",", "")
    if not digitos.isdigit():
        return None, None
    pal = "piedra" if m.group(2).startswith("piedra") else m.group(2)
    return RECURSOS[pal], int(digitos)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--alltables", required=True, help="directorio con item.bytes")
    ap.add_argument("--tables", required=True, help="directorio con los stringtable_*.bytes")
    ap.add_argument("--prev", required=True, help="items.json previo (fuente de gems/drops)")
    ap.add_argument("--out", required=True, help="items.json de salida")
    ap.add_argument("--indent", type=int, default=2)
    args = ap.parse_args()

    nm_es = make_nm(args.tables, "spa")
    items = load_items(os.path.join(args.alltables, "item.bytes"), nm_es)
    prev = json.load(open(args.prev, encoding="utf-8"))
    prev_db = prev.get("ITEMS_DB") or {}

    # ---------------------------------------------------------- ITEMS_DB
    db = {}
    sin_nombre = 0
    effects = 0
    gems_conservados = 0
    gems_descartados = 0
    drops_conservados = 0
    for iid in sorted(items):
        nombre = items[iid]["nombre"]
        if not nombre:
            sin_nombre += 1
            continue
        tipo = TYPE_OVERRIDE.get(iid) or clasifica(nombre)
        entry = {}
        entry["name"] = nombre
        vieja = prev_db.get(str(iid)) or {}
        # sólo se conservan los campos manuales si el id significaba lo mismo
        # antes (mismo type): evita heredar gems/drops de ids con otro sentido
        coherente = vieja.get("type") == tipo
        if coherente and "gems" in vieja:
            entry["gems"] = vieja["gems"]
            gems_conservados += 1
        elif "gems" in vieja:
            gems_descartados += 1
        entry["type"] = tipo
        if coherente and "drops" in vieja:
            entry["drops"] = vieja["drops"]
            drops_conservados += 1
        if coherente and "effect" in vieja:
            entry["effect"] = vieja["effect"]
        elif tipo == "acelerar" and re.match(r"^acel", nombre.lower()) and items[iid]["minutos"] > 0:
            entry["effect"] = [1, items[iid]["minutos"] * 60]
        if "effect" in entry:
            effects += 1
        db[str(iid)] = entry

    # ------------------------------------- recursos: cantidades -> id real
    por_recurso = {}
    for iid, info in items.items():
        res, cant = parse_cantidad(info["nombre"])
        if res and cant:
            por_recurso.setdefault(res, {}).setdefault(cant, []).append(iid)

    correcciones = []
    sin_candidato = []
    bag_nuevo = {}
    for res, pares in (prev.get("BAG_ITEMS") or {}).items():
        nuevos = []
        for viejo_id, cant in pares:
            cands = sorted(por_recurso.get(res, {}).get(cant, []))
            if not cands:
                sin_candidato.append((res, viejo_id, cant))
                continue
            nuevo = viejo_id if viejo_id in cands else cands[0]
            if nuevo != viejo_id:
                correcciones.append((res, viejo_id, nuevo, cant))
            if all(nuevo != n for n, _ in nuevos):
                nuevos.append([nuevo, cant])
        bag_nuevo[res] = nuevos

    res_ids = {res: [p[0] for p in pares] for res, pares in bag_nuevo.items()}
    values = {str(p[0]): p[1] for pares in bag_nuevo.values() for p in pares}

    # los gems de la tabla manual eran "por cantidad": al corregir el id
    # (mismo ítem, id real del cliente) se heredan al id nuevo
    for _res, viejo_id, nuevo, _cant in correcciones:
        gems = (prev_db.get(str(viejo_id)) or {}).get("gems")
        entry = db.get(str(nuevo))
        if gems is not None and entry is not None and "gems" not in entry:
            db[str(nuevo)] = {"name": entry["name"], "gems": gems,
                              **{k: v for k, v in entry.items() if k != "name"}}
            gems_conservados += 1

    # ------------------------------------------------------------ sanity
    malos = []
    for res, pares in bag_nuevo.items():
        for iid, cant in pares:
            info = items.get(iid)
            if not info:
                malos.append(f"{res}: id {iid} no existe en item.bytes")
                continue
            r2, c2 = parse_cantidad(info["nombre"])
            if r2 != res or c2 != cant:
                malos.append(f"{res}: id {iid} es '{info['nombre']}' (esperado {cant})")
    if sin_candidato:
        malos.append(f"{len(sin_candidato)} cantidades sin id en el cliente: {sin_candidato}")

    por_type = {}
    for e in db.values():
        por_type[e["type"]] = por_type.get(e["type"], 0) + 1

    doc = {
        "ITEMS_DB": db,
        "ITEM_VALUES": values,
        "RESOURCE_ITEM_IDS": res_ids,
        "BAG_ITEMS": bag_nuevo,
    }
    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=args.indent)
        fh.write("\n")

    print(f"items: {len(db)} con nombre · {sin_nombre} sin nombre (descartados)")
    print("type: " + "  ".join(f"{k}={v}" for k, v in sorted(por_type.items())))
    print(f"gems conservados: {gems_conservados} · descartados por id reutilizado: {gems_descartados} · "
          f"drops: {drops_conservados} · effect: {effects}")
    if correcciones:
        print(f"recursos: {len(correcciones)} ids CORREGIDOS contra el cliente:")
        for res, viejo, nuevo, cant in correcciones:
            print(f"   {res:7} {viejo} -> {nuevo}  ({cant} · {items[nuevo]['nombre']})")
    if malos:
        print("AVISOS:")
        for m in malos:
            print("   " + m)
    print(f"-> {args.out} ({os.path.getsize(args.out)} bytes)")


if __name__ == "__main__":
    main()
