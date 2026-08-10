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

case "${1:-}" in
  stand)   BODY='{"stand":true}' ;;
  lees)    [ -f "${2:-}" ] || { echo "FOUT: bestand niet gevonden: ${2:-<geen>}" >&2; exit 4; }
           BODY="$(pak_tekst "$2" 1)" ;;
  opslaan) [ -f "${2:-}" ] || { echo "FOUT: bestand niet gevonden: ${2:-<geen>}" >&2; exit 4; }
           BODY="$(pak_tekst "$2" 0)" ;;
  regels)  [ -f "${2:-}" ] || { echo "FOUT: bestand niet gevonden: ${2:-<geen>}" >&2; exit 4; }
           BODY="$(cat "$2")" ;;
  *) echo "Gebruik: pronkert.sh stand | lees <txt> | opslaan <txt> | regels <json>" >&2; exit 1 ;;
esac

curl -sS -X POST "$FUNCTIE" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "x-cron-key: ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -w '\nHTTP:%{http_code}\n' \
  -d "$BODY"
