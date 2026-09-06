#!/bin/bash
# Praat met de Edge Function pronkert-marge. Eén vaste commandovorm, zodat de
# allow-regel in ~/.claude/settings.json er altijd op past en de weekroutine
# nooit om toestemming hoeft te vragen. Zelfde opzet als radar.sh.
#
# Gebruik:
#   pronkert.sh stand                    -> weken + krachten die nu in de app staan
#   pronkert.sh lees   <factuur.txt>     -> lezen zonder op te slaan (controle)
#   pronkert.sh opslaan <factuur.txt>    -> lezen én opslaan
#   pronkert.sh regels <regels.json>     -> al gelezen regels opsturen (Excel-overzicht)
#
# <factuur.txt> is de kale tekstlaag van de margefactuur-PDF.
# Sleutels komen uit ~/.claude/ploeggenoten-secrets.env (buiten elke git-repo).
set -euo pipefail

# De functie heet in Supabase `dynamic-worker` — die naam verzon het dashboard
# zelf bij "Deploy via editor" en Tjeerd heeft hem zo gelaten (10 aug 2026).
# De code staat in supabase/functions/pronkert-marge/. Niet "opschonen" naar
# pronkert-marge zonder de functie eerst opnieuw te deployen: dan valt de hele
# weekroutine stil met een 404.
FUNCTIE="https://gyhrwjdlwamyjhxtdypw.supabase.co/functions/v1/dynamic-worker"
SECRETS="$HOME/.claude/ploeggenoten-secrets.env"

if [ ! -f "$SECRETS" ]; then
  echo "FOUT: $SECRETS ontbreekt." >&2
  exit 2
fi
set -a; . "$SECRETS"; set +a

if [ -z "${CRON_SECRET:-}" ]; then
  echo "FOUT: CRON_SECRET is leeg in $SECRETS." >&2
  exit 3
fi

# De factuurtekst als JSON-string inpakken doen we met python: aanhalingstekens,
# euro's en regeleindes in een shell-variabele gaan een keer per jaar mis.
pak_tekst(){ python3 -c 'import json,sys; print(json.dumps({"tekst": open(sys.argv[1], encoding="utf-8").read(), "droog": sys.argv[2]=="1"}))' "$1" "$2"; }

# De klantnaam staat WEL op het marge-overzicht van Sasja en NIET op de
# margefactuur-PDF. Dit maakt van dat overzicht een 'verrijk'-opdracht: geen
# euro's, alleen de vier velden waarop de functie de juiste regel terugvindt.
# De naam splitsen we net als pronkert_marge.splits_naam ('S. van Nicolaas
# (Sven)' -> naam + roepnaam); de functie sleutelt op naam+roepnaam, dus die
# twee moeten hier exact zo uit komen als bij het inlezen van de PDF.
pak_klanten(){ python3 -c '
import csv, datetime, json, re, sys

rijen = list(csv.reader(open(sys.argv[1], encoding="utf-8"), delimiter="\t"))
kop = next((r for r in rijen if "Flexwerker" in r and "Bedrijfsnaam" in r), None)
if not kop:
    print("FOUT: geen kopregel met Flexwerker/Bedrijfsnaam gevonden", file=sys.stderr)
    sys.exit(5)
ix = {h: i for i, h in enumerate(kop)}
uit, gezien = [], set()
for r in rijen[rijen.index(kop) + 1:]:
    try:
        jaar, week = int(r[ix["Jaar"]]), int(r[ix["Periode"]])
    except (IndexError, ValueError):
        continue          # lege regel of een tussenkopje: overslaan
    klant = r[ix["Bedrijfsnaam"]].strip()
    if not klant:
        continue
    m = re.match(r"\s*(.+?)\s*\(([^)]+)\)\s*$", r[ix["Flexwerker"]])
    naam, roep = (m.group(1).strip(), m.group(2).strip()) if m else (r[ix["Flexwerker"]].strip(), "")
    maandag = datetime.date.fromisocalendar(jaar, week, 1).isoformat()
    if (maandag, naam, roep) in gezien:
        continue          # per persoon per week is een regel genoeg
    gezien.add((maandag, naam, roep))
    uit.append({"factuur": r[ix["Factuurnummer"]].strip(), "weekmaandag": maandag,
                "week": week, "jaar": jaar, "naam": naam, "roepnaam": roep, "klant": klant})
if not uit:
    print("FOUT: geen bruikbare regels in het overzicht", file=sys.stderr)
    sys.exit(5)
print(json.dumps({"regels": uit, "verrijk": True}))
' "$1"; }

case "${1:-}" in
  stand)   BODY='{"stand":true}' ;;
  lees)    [ -f "${2:-}" ] || { echo "FOUT: bestand niet gevonden: ${2:-<geen>}" >&2; exit 4; }
           BODY="$(pak_tekst "$2" 1)" ;;
  opslaan) [ -f "${2:-}" ] || { echo "FOUT: bestand niet gevonden: ${2:-<geen>}" >&2; exit 4; }
           BODY="$(pak_tekst "$2" 0)" ;;
  regels)  [ -f "${2:-}" ] || { echo "FOUT: bestand niet gevonden: ${2:-<geen>}" >&2; exit 4; }
           BODY="$(cat "$2")" ;;
  klanten) [ -f "${2:-}" ] || { echo "FOUT: bestand niet gevonden: ${2:-<geen>}" >&2; exit 4; }
           BODY="$(pak_klanten "$2")" ;;
  *) echo "Gebruik: pronkert.sh stand | lees <txt> | opslaan <txt> | regels <json> | klanten <tsv>" >&2; exit 1 ;;
esac

curl -sS -X POST "$FUNCTIE" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "x-cron-key: ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -w '\nHTTP:%{http_code}\n' \
  -d "$BODY"
