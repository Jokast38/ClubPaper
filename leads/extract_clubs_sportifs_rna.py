#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_clubs_sportifs_rna.py

Extrait et filtre les clubs SPORTIFS depuis le jeu de données open data
"Répertoire national des associations (RNA) - Île-de-France"
(plateforme Opendatasoft : data.iledefrance.fr).

Sortie : un fichier CSV propre avec nom, adresse, code postal, ville,
objet de l'association, site web (quand disponible).

Installation :
    pip install requests pandas

Utilisation :
    python extract_clubs_sportifs_rna.py
    python extract_clubs_sportifs_rna.py --departement 75,92,93
    python extract_clubs_sportifs_rna.py --mots-cles "sport,club,football,tennis"

Notes importantes :
- Le RNA ne contient PAS de numéro de téléphone ou d'email (RGPD / non
  collecté par le ministère). Pour ces infos, il faudra croiser avec
  les sites des fédérations sportives ou les annuaires type HelloAsso.
- Le champ "objet" est en texte libre déclaré par l'association elle-même :
  le filtrage par mots-clés n'est donc jamais parfait à 100 %. Relis le
  CSV final et ajuste la liste de mots-clés / mots à exclure si besoin.
"""

import argparse
import sys
import time
from pathlib import Path

# Windows consoles default to cp1252, which can't encode "✅" or accented
# characters printed to stderr/stdout — force UTF-8 so this doesn't crash
# after a successful run.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

import requests
import pandas as pd

BASE_URL = "https://data.iledefrance.fr"
DATASET_ID = "repertoire-national-des-associations-ile-de-france"
API_DATASET_INFO = f"{BASE_URL}/api/explore/v2.1/catalog/datasets/{DATASET_ID}/"
API_RECORDS = f"{BASE_URL}/api/explore/v2.1/catalog/datasets/{DATASET_ID}/records"

# Mots-clés par défaut pour repérer un objet social "sport"
DEFAULT_KEYWORDS = [
    "sport", "sportif", "sportive", "club", "football", "tennis", "judo",
    "rugby", "basket", "handball", "natation", "athlétisme", "athletisme",
    "danse", "gymnastique", "cyclisme", "vélo", "velo", "yoga", "fitness",
    "musculation", "karaté", "karate", "boxe", "escalade", "voile", "golf",
    "équitation", "equitation", "escrime", "aviron", "randonnée", "randonnee",
    "pétanque", "petanque", "badminton", "volley", "roller", "skate",
]

# Départements d'Île-de-France (utilisés par défaut pour partitionner les
# requêtes et rester sous la limite de pagination de l'API — voir
# API_OFFSET_LIMIT plus bas).
IDF_DEPARTEMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

# Mots-clés à exclure pour réduire les faux positifs
# (ex: "esprit sportif" dans une association non sportive, clubs de loisirs
# divers qui utilisent le mot "sport" au sens large, etc.)
EXCLUDE_KEYWORDS = [
    "anciens combattants",  # associations d'anciens combattants qui parlent parfois de "sport"
]


def discover_fields() -> list[str]:
    """Interroge l'API pour lister les champs réels du dataset (robuste aux
    changements de schéma)."""
    resp = requests.get(API_DATASET_INFO, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    fields = [f["name"] for f in data.get("fields", [])]
    if not fields:
        raise RuntimeError(
            "Impossible de récupérer le schéma du dataset. "
            "Vérifie que l'URL/ID du dataset est toujours valide sur "
            "data.iledefrance.fr."
        )
    return fields


def guess_field(fields: list[str], candidates: list[str]) -> str | None:
    """Trouve le premier champ du schéma dont le nom contient un des mots
    candidats (insensible à la casse)."""
    for cand in candidates:
        for f in fields:
            if cand in f.lower():
                return f
    return None


def build_field_map(fields: list[str]) -> dict:
    """Construit une correspondance nom générique -> nom réel du champ API.

    Le dataset a été vu sous deux schémas différents (FR historique, EN
    actuel sur data.iledefrance.fr) — chaque candidat liste les deux formes.
    """
    return {
        "titre": guess_field(fields, ["titre_court", "short_title", "titre", "title"]),
        # NB: social_object1/2 (a.k.a. objet_social1/2) are numeric nomenclature
        # codes (e.g. "011050"), not free text — "object" is the actual
        # free-text description and must be tried first for keyword matching.
        "objet": guess_field(fields, ["object", "objet_social1", "social_object1", "objet_social", "social_object", "objet"]),
        "objet2": None,
        "adresse_num": guess_field(fields, ["adrs_numvoie", "street_number", "numvoie"]),
        "adresse_type_voie": guess_field(fields, ["adrs_typevoie", "street_type", "typevoie"]),
        "adresse_lib_voie": guess_field(fields, ["adrs_libvoie", "street_name", "libvoie"]),
        "adresse_complement": guess_field(fields, ["adrs_complement", "comp_address", "complement"]),
        "code_postal": guess_field(fields, ["codepostal", "code_postal", "pc_address"]),
        "commune": guess_field(fields, ["libcommune", "commune", "com_name"]),
        "departement": guess_field(fields, ["departement", "dept", "dep_code"]),
        "site_web": guess_field(fields, ["site_web", "siteweb", "website", "web"]),
        "date_creation": guess_field(fields, ["date_creat", "date_creation", "creation_date"]),
        "rna_id": guess_field(fields, ["id_rna", "rna"]) or "id",
        "nature": guess_field(fields, ["nature"]),
        "geo_point": guess_field(fields, ["geo_point", "position", "coordonnees"]),
    }


def build_where_clause(field_map: dict, keywords: list[str],
                        departements: list[str] | None) -> str:
    """Construit une clause `where` ODSQL : filtre sur objet (+ objet2 si
    dispo) contenant un des mots-clés, optionnellement restreint à une liste
    de départements."""
    objet_fields = [f for f in (field_map["objet"], field_map["objet2"]) if f]
    if not objet_fields:
        raise RuntimeError(
            "Impossible de trouver un champ 'objet' dans le schéma du "
            "dataset. Lance le script avec --debug-schema pour voir les "
            "champs disponibles et adapte build_field_map()."
        )

    kw_clauses = []
    for f in objet_fields:
        for kw in keywords:
            kw_clauses.append(f'{f} like "{kw}"')
    where = "(" + " OR ".join(kw_clauses) + ")"

    if departements and field_map["code_postal"]:
        dep_clauses = [
            f'startswith({field_map["code_postal"]}, "{d.strip()}")'
            for d in departements
        ]
        where += " AND (" + " OR ".join(dep_clauses) + ")"

    return where


API_OFFSET_LIMIT = 10_000  # OpenDataSoft explore v2.1 hard cap on offset + limit


def fetch_all_records(where: str, page_size: int = 100,
                       max_records: int | None = None) -> list[dict]:
    """Pagine sur l'API records pour récupérer tous les résultats du filtre.

    S'arrête proprement (avec un avertissement) si la requête dépasse la
    limite de pagination de l'API (offset + limit <= 10 000) au lieu de
    planter — au niveau appelant, restreindre le `where` (ex: par
    département) permet de rester sous cette limite.
    """
    records = []
    offset = 0
    while True:
        if offset + page_size > API_OFFSET_LIMIT:
            print(
                f"  -> Limite de pagination de l'API atteinte ({API_OFFSET_LIMIT}) "
                "pour ce filtre : résultats tronqués. Restreins la requête "
                "(ex: --departement) pour tout récupérer.",
                file=sys.stderr,
            )
            break
        params = {
            "where": where,
            "limit": page_size,
            "offset": offset,
        }
        resp = requests.get(API_RECORDS, params=params, timeout=60)
        if resp.status_code == 429:
            print("  -> Rate limit atteint, pause de 5s...", file=sys.stderr)
            time.sleep(5)
            continue
        resp.raise_for_status()
        payload = resp.json()
        batch = payload.get("results", [])
        if not batch:
            break
        records.extend(batch)
        print(f"  -> {len(records)} enregistrements récupérés...", file=sys.stderr)
        offset += page_size
        if max_records and len(records) >= max_records:
            records = records[:max_records]
            break
        time.sleep(0.2)  # petite pause pour rester correct avec l'API publique
    return records


def clean_and_export(records: list[dict], field_map: dict,
                      exclude_keywords: list[str], output_path: Path) -> pd.DataFrame:
    rows = []
    for r in records:
        objet = (r.get(field_map["objet"]) or "") if field_map["objet"] else ""
        objet2 = (r.get(field_map["objet2"]) or "") if field_map["objet2"] else ""
        objet_full = f"{objet} {objet2}".strip()

        # exclusion de faux positifs
        low = objet_full.lower()
        if any(exc in low for exc in exclude_keywords):
            continue

        adresse_parts = [
            str(r.get(field_map["adresse_num"]) or "").strip() if field_map["adresse_num"] else "",
            str(r.get(field_map["adresse_type_voie"]) or "").strip() if field_map["adresse_type_voie"] else "",
            str(r.get(field_map["adresse_lib_voie"]) or "").strip() if field_map["adresse_lib_voie"] else "",
        ]
        adresse = " ".join(p for p in adresse_parts if p)

        lat, lon = None, None
        if field_map["geo_point"]:
            geo = r.get(field_map["geo_point"])
            if isinstance(geo, dict):
                lat = geo.get("lat")
                lon = geo.get("lon")
            elif isinstance(geo, list) and len(geo) == 2:
                lat, lon = geo[1], geo[0]

        rows.append({
            "nom": r.get(field_map["titre"]) if field_map["titre"] else "",
            "objet": objet_full,
            "adresse": adresse,
            "code_postal": r.get(field_map["code_postal"]) if field_map["code_postal"] else "",
            "commune": r.get(field_map["commune"]) if field_map["commune"] else "",
            "site_web": r.get(field_map["site_web"]) if field_map["site_web"] else "",
            "date_creation": r.get(field_map["date_creation"]) if field_map["date_creation"] else "",
            "id_rna": r.get(field_map["rna_id"]) if field_map["rna_id"] else "",
            "latitude": lat,
            "longitude": lon,
        })

    columns = ["nom", "objet", "adresse", "code_postal", "commune", "site_web",
               "date_creation", "id_rna", "latitude", "longitude"]
    df = pd.DataFrame(rows, columns=columns)

    # nettoyage basique
    df = df.drop_duplicates(subset=["id_rna"]).reset_index(drop=True)
    df["nom"] = df["nom"].astype(str).str.strip()
    df = df[df["nom"] != ""]
    df = df.sort_values(by=["code_postal", "commune", "nom"], na_position="last")

    df.to_csv(output_path, index=False, encoding="utf-8-sig", sep=";")
    return df


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mots-cles", type=str, default=None,
        help="Liste de mots-clés séparés par des virgules (remplace la liste par défaut)."
    )
    parser.add_argument(
        "--departement", type=str, default=None,
        help="Filtrer par départements (ex: 75,92,93,94). Par défaut : toute l'IDF "
             "(75,77,78,91,92,93,94,95), interrogée département par département "
             "pour rester sous la limite de pagination de l'API."
    )
    parser.add_argument(
        "--max", type=int, default=None,
        help="Nombre maximum d'enregistrements à récupérer (utile pour tester rapidement)."
    )
    parser.add_argument(
        "--output", type=str, default="clubs_sportifs_idf.csv",
        help="Chemin du fichier CSV de sortie."
    )
    parser.add_argument(
        "--debug-schema", action="store_true",
        help="Affiche uniquement les champs disponibles dans le dataset et quitte."
    )
    args = parser.parse_args()

    print("Découverte du schéma du dataset...", file=sys.stderr)
    fields = discover_fields()

    if args.debug_schema:
        print("Champs disponibles :")
        for f in fields:
            print(f"  - {f}")
        return

    field_map = build_field_map(fields)
    print("Correspondance de champs détectée :", file=sys.stderr)
    for k, v in field_map.items():
        print(f"  {k:20s} -> {v}", file=sys.stderr)

    keywords = (
        [k.strip() for k in args.mots_cles.split(",")]
        if args.mots_cles else DEFAULT_KEYWORDS
    )
    departements = (
        [d.strip() for d in args.departement.split(",")]
        if args.departement else IDF_DEPARTEMENTS
    )

    # Fetch one department at a time: a region-wide query can return well
    # over the API's 10 000-record pagination cap, so we partition by
    # department (each comfortably under that cap) and concatenate results.
    print("Récupération des enregistrements (pagination, par département)...", file=sys.stderr)
    records: list[dict] = []
    for dep in departements:
        where = build_where_clause(field_map, keywords, [dep])
        print(f"\n-- Département {dep} --", file=sys.stderr)
        print(f"Clause de filtre : {where}", file=sys.stderr)
        remaining = (args.max - len(records)) if args.max else None
        if remaining is not None and remaining <= 0:
            break
        records.extend(fetch_all_records(where, max_records=remaining))
    print(f"\nTotal récupéré avant nettoyage : {len(records)}", file=sys.stderr)

    output_path = Path(args.output)
    df = clean_and_export(records, field_map, EXCLUDE_KEYWORDS, output_path)

    print(f"\n✅ {len(df)} clubs sportifs exportés vers : {output_path.resolve()}")
    print(df.head(10).to_string(index=False))


if __name__ == "__main__":
    main()
