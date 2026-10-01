#!/usr/bin/env python3
"""Genera src/bot/data/monsters-data.json a partir de monster.bytes (cliente Lords Mobile).

Nota: el JSON se llama monsters-data.json (y no monsters.json) porque con ts-node
el require('../bot/data/monsters') resolvería el .json antes que el .ts.

Entradas (tablas .bytes extraidas con UnityPy de Table.unity3d + stringtables):
  monster.bytes -> 300 filas de 57 B (cabecera u16 kind=1, u16 count):
                     u16 @0   id de especie (el mismo u16[0] del tile type 0x0a)
                     u16 @5   nameKey   (nombre; algunas filas traen "Reclu.")
                     u16 @11  key "Tipo de daño"  (Físico | Mágico | Físico y mágico | Daño directo)
                     u16 @13  key de defensa      (DEFF alta | DEFM alta | Físico y mágico)
                     u16 @15  descKey  (texto del Manual de monstruos)
  stringtable_spa.bytes / stringtable_spa2.bytes -> key -> texto

`debilidad` = con qué payload del 2488 hay que golpear al bicho
(getHuntPayloadHex: magia -> payloadHexMagia, fisico -> payloadHexFisico):

  * @13 "DEFF alta"          -> magia   (defensa física alta: hay que pegarle con magia)
  * @13 "DEFM alta"          -> fisico  (defensa mágica alta: hay que pegarle con físico)
  * @13 "Físico y mágico"    -> null    (el manual no marca una debilidad única)
  * fila sin datos           -> null

La regla se validó contra los ids que ya estaban cargados a mano en monsters.ts:
  8 Terrospín (DEFM alta) fisico ✓ · 10 Noceros (DEFF alta) magia ✓
  15 Titán de Marea (DEFF alta) magia ✓ · 16 Buen Apetito (DEFM alta) fisico ✓
  18 AlaNegra (DEFM alta) fisico ✓ · 231 Astra Buen Apetito (DEFM alta) fisico ✓
  217/259 son cofres (cofre: true, nunca entran en la caza).
  Alaescarcha (ids 2, 218 y 302) no tiene debilidad marcada en el manual: el
  usuario la caza con físico, así que SOBRESCRIBIR_DEBILIDAD la fija en "fisico".

Con --huntdata (+ --heros) se mezcla huntData.json (héroes recomendados por
monstruo y nivel, en inglés) del pack LordsBot-Release:
  * los NOMBRES EN del cliente (nameKey con stringtable_eng, quitando el
    prefijo "Astra ") casan con las claves de huntData;
  * los héroes se resuelven a ids con heros.json (name/nameEn/altName);
  * la escuadra recomendada define la familia mágica/física, con la que se
    rellenan los debilidad = null (p. ej. Grifo y Drider infernal → fisico);
  * se guardan `heroes` y `heroesP2p` (ids por nivel) para que la runtime
    ataque con esa escuadra si el bot tiene los héroes (si no, usa la
    debilidad).

Uso:
  python gen-monsters.py --alltables <dir> --tables <dir> --out <monsters-data.json> \
         [--huntdata <huntData.json> --heros <heros.json>]
"""
import argparse
import json
import os
import re
import struct
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

MONSTER_RS = 57
COLOR_RE = re.compile(r"</?color[^>]*>", re.IGNORECASE)
JUNK_NAMES = {"", "Reclu.", "Reclutar", "¿Reclutar?", "Hire"}

# nameKey basura pero el nombre real sale de la descripción del manual
NOMBRES_FALLBACK = {
    2: "Alaescarcha",     # nameKey 6401 = "Reclu."; desc 8365 = "Alaescarcha siempre…"
    42: "Bon Viveur",     # nameKey basura; desc 13014 = "¡Atención! El Bon Viveur…"
    302: "Alaescarcha",   # copia del id 2 (mismo nameKey basura, misma desc)
}

# ids que ya estaban validados en monsters.ts / verificados por el usuario
# (el manual no les marca debilidad única: "Físico y mágico")
SOBRESCRIBIR_DEBILIDAD = {
    2: "fisico",    # Alaescarcha: el usuario la caza con físico
    218: "fisico",  # Astra Alaescarcha (mismo bicho)
    302: "fisico",  # copia del id 2
}

# valores esperados de la regla para los ids cargados a mano (sanidad)
ESPERADOS = {
    8: "fisico",
    10: "magia",
    15: "magia",
    16: "fisico",
    18: "fisico",
    231: "fisico",
}

# @13 -> debilidad
DEBILIDAD_POR_DEFENSA = {
    "DEFF alta": "magia",
    "DEFM alta": "fisico",
}

# nameKey basura en inglés (mismos ids que NOMBRES_FALLBACK)
NOMBRES_FALLBACK_EN = {
    2: "Frostwing",
    302: "Frostwing",
}

# familias de escuadra observadas en huntData.json
HEROES_MAGICOS = {
    "Sage of Storms", "Snow Queen", "Incinerator", "Bombin' Goblin",
    "Elementalist", "Prima Donna", "Child of Light",
}
HEROES_FISICOS = {
    "Black Crow", "Scarlet Bolt", "Trickster", "Demon Slayer", "Tracker",
    "Death Archer", "Death Knight", "Rose Knight", "Shade", "Femme Fatale",
}


def familia(heroes):
    """Escuadra mágica o física según los héroes recomendados (None = empate)."""
    mag = sum(1 for h in heroes if h in HEROES_MAGICOS)
    fis = sum(1 for h in heroes if h in HEROES_FISICOS)
    if mag == fis:
        return None
    return "magia" if mag > fis else "fisico"


def aplicar_huntdata(monsters, huntdata_path, heros_path, nm_en, nombres_en, verbose=True):
    """Rellena debilidad (null) + heroes/heroesP2p desde huntData.json.

    nombres_en: id de especie -> nameKey (para leer el nombre EN del cliente).
    """
    hunt = json.load(open(huntdata_path, encoding="utf-8"))["Data"]
    heros = json.load(open(heros_path, encoding="utf-8")).get("heroes", {})

    # nombre EN del héroe -> id
    por_heroe = {}
    for h in heros.values():
        for k in ("name", "nameEn", "altName"):
            v = (h.get(k) or "").strip()
            if v:
                por_heroe.setdefault(v, h["id"])

    # nombre EN base (sin el prefijo "Astra ") -> TODOS los ids que lo comparten
    # (las series 204+/302+ son copias de la misma especie y heredan la escuadra)
    grupos = {}
    for mid_s in monsters:
        mid = int(mid_s)
        nk = nombres_en.get(mid, 0)
        nombre_en = clean(nm_en(nk)) if nk else ""
        if not nombre_en or nombre_en in JUNK_NAMES:
            continue
        base = nombre_en[6:] if nombre_en.startswith("Astra ") else nombre_en
        ids = grupos.setdefault(base, [])
        if mid not in ids:
            ids.append(mid)
    for mid, name in NOMBRES_FALLBACK_EN.items():
        if str(mid) in monsters:
            ids = grupos.setdefault(name, [])
            if mid not in ids:
                ids.append(mid)
    for ids in grupos.values():
        ids.sort()

    mapeados = sin_id = con_escuadra = rellenados = 0
    heroes_ok = heroes_malos = 0
    for nombre, niveles in hunt.items():
        grupo = grupos.get(nombre.strip())
        if not grupo:
            sin_id += 1
            if verbose:
                print(f"  AVISO huntData: '{nombre}' no matchea ningún id")
            continue
        mapeados += 1

        escuadras, escuadras_p2p = {}, {}
        familia_nivel = {}
        for nivel, data in niveles.items():
            for clave, destino in (("Heroes", escuadras), ("P2PHeroes", escuadras_p2p)):
                nombres = data.get(clave) or []
                ids_h = [por_heroe.get((n or "").strip()) for n in nombres]
                if len(ids_h) == 5 and all(i is not None for i in ids_h):
                    destino[nivel] = ids_h
                    heroes_ok += 1
                else:
                    heroes_malos += 1
            if data.get("Heroes"):
                familia_nivel[nivel] = familia(data["Heroes"])

        familias = [f for f in familia_nivel.values() if f]
        mayoria = max(set(familias), key=familias.count) if familias else None

        for mid in grupo:
            entry = monsters[str(mid)]
            if escuadras:
                entry["heroes"] = dict(escuadras)
            if escuadras_p2p:
                entry["heroesP2p"] = dict(escuadras_p2p)
            if escuadras or escuadras_p2p:
                con_escuadra += 1
            # debilidad: sólo se rellenan los null (la regla del manual manda)
            if entry.get("debilidad") is None and mayoria:
                entry["debilidad"] = mayoria
                rellenados += 1

    if verbose:
        print(f"huntData: {mapeados} claves mapeadas · {sin_id} sin id · "
              f"{con_escuadra} ids con escuadra")
        print(f"huntData: escuadras resueltas {heroes_ok} · incompletas {heroes_malos} · "
              f"debilidad rellenada {rellenados}")
    return {"mapeados": mapeados, "sin_id": sin_id, "rellenados": rellenados}


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


def clean(text):
    return " ".join(COLOR_RE.sub("", text or "").split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--alltables", required=True, help="directorio con monster.bytes")
    ap.add_argument("--tables", required=True, help="directorio con los stringtable_*.bytes")
    ap.add_argument("--out", required=True, help="archivo monsters-data.json de salida")
    ap.add_argument("--indent", type=int, default=0, help="sangría del JSON (0 = una línea)")
    ap.add_argument("--huntdata", default=None,
                    help="huntData.json (héroes recomendados por monstruo/nivel)")
    ap.add_argument("--heros", default=None,
                    help="heros.json (nombres de héroes -> id); obligatorio con --huntdata")
    args = ap.parse_args()
    if bool(args.huntdata) != bool(args.heros):
        raise SystemExit("--huntdata y --heros se usan juntos")

    nm_es = make_nm(args.tables, "spa")
    nm_en = make_nm(args.tables, "eng")

    monsters = {}
    nombres_en = {}
    total = 0
    sin_nombre = 0
    sin_datos = 0
    cofres = 0

    for row in load_rows(os.path.join(args.alltables, "monster.bytes"), MONSTER_RS):
        total += 1
        mid = struct.unpack_from("<H", row, 0)[0]
        name_key = struct.unpack_from("<H", row, 5)[0]
        key11 = struct.unpack_from("<H", row, 11)[0]
        key13 = struct.unpack_from("<H", row, 13)[0]
        desc_key = struct.unpack_from("<H", row, 15)[0]

        nombre = clean(nm_es(name_key))
        if nombre in JUNK_NAMES:
            nombre = NOMBRES_FALLBACK.get(mid, "")
        if not nombre:
            sin_nombre += 1
            continue

        defensa = clean(nm_es(key13)) if key13 else ""
        tipo = clean(nm_es(key11)) if key11 else ""
        desc = clean(nm_es(desc_key)) if desc_key else ""
        if not defensa and not tipo and not desc:
            sin_datos += 1

        es_cofre = nombre.lower().startswith("cofre")
        debilidad = None if es_cofre else DEBILIDAD_POR_DEFENSA.get(defensa)
        if mid in SOBRESCRIBIR_DEBILIDAD:
            debilidad = SOBRESCRIBIR_DEBILIDAD[mid]
        if es_cofre:
            cofres += 1

        entry = {"id": mid, "nombre": nombre, "debilidad": debilidad}
        if es_cofre:
            entry["cofre"] = True
        monsters[str(mid)] = entry
        nombres_en[mid] = name_key

    # huntData: escuadras recomendadas + relleno de debilidad (sólo null)
    if args.huntdata:
        aplicar_huntdata(monsters, args.huntdata, args.heros, nm_en, nombres_en)

    por_debilidad = {"magia": 0, "fisico": 0, "null": 0}
    for entry in monsters.values():
        d = entry.get("debilidad")
        por_debilidad[d if d else "null"] += 1

    # sanidad: la regla debe reproducir los ids ya validados
    malos = []
    for mid, esperado in ESPERADOS.items():
        entry = monsters.get(str(mid))
        if not entry or entry["debilidad"] != esperado:
            malos.append(f"id {mid}: esperado {esperado}, obtenido {entry and entry['debilidad']}")
    if malos:
        print("AVISO - la regla no reproduce los ids validados:")
        for m in malos:
            print("   " + m)

    source = "monster.bytes + stringtable_spa.bytes (cliente Lords Mobile)"
    rule = ("debilidad desde la columna de defensa del Manual: DEFF alta->magia, "
            "DEFM alta->fisico, 'Físico y mágico'->null; cofres sin debilidad")
    if args.huntdata:
        source += " + huntData.json (LordsBot-Release) resuelto con heros.json"
        rule += "; los null se rellenan con la escuadra recomendada de huntData"

    doc = {
        "source": source,
        "rule": rule,
        "count": len(monsters),
        "monsters": monsters,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=args.indent)
        fh.write("\n")

    con_escuadra = sum(1 for e in monsters.values() if e.get("heroes"))
    print(f"filas totales: {total}  sin nombre (descartadas): {sin_nombre}  sin datos: {sin_datos}")
    print(f"monstruos exportados: {len(monsters)}  cofres: {cofres}  con escuadra: {con_escuadra}")
    print(f"debilidad: magia={por_debilidad['magia']}  fisico={por_debilidad['fisico']}  "
          f"null={por_debilidad['null']}")
    print(f"-> {args.out} ({os.path.getsize(args.out)} bytes)")


if __name__ == "__main__":
    main()
