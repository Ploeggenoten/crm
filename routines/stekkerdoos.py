"""
Stekkerdoos-margeoverzicht en flexprognose voor de weekroutine.

Sinds 16 nov 2026 is het marge-overzicht uit Pronkerts portaal de leidende bron
voor de flexmarge (besluit Tjeerd). Pronkert mailt van noreply@uitzendstekkerdoos.nl
een link app.uitzendstekkerdoos.nl/marge/<token>; elke mail heeft een eigen token
(±12 weken geldig). Achter <link>/gegevens zit JSON met ALLE weken van het jaar,
per dag en per looncomponent:
    w week · j jaar · k klant · p persoon · f functie · d datum · c component
    u uren · t tarief · om omzet · ma marge · fn deelfactuurnr · fd factuurdatum
Geen login nodig, dus ook geen browser.

Gebruik (via pronkert.sh, niet los):
    python3 stekkerdoos.py regels   <gegevens.json>  -> {"stekkerdoos":true,"regels":[...]}
    python3 stekkerdoos.py prognose <stand.json>     -> stand + prognose + doel, als tekst

De prognose (keuze Tjeerd, 16 nov 2026): per flexkracht het gemiddelde van de
laatste 4 gefactureerde weken, doorgetrokken tot zijn plaatsing stopt. Nieuwe
plaatsingen tellen mee vanaf hun startdatum. Een week hoort bij de maand waarin
zijn maandag valt — net als in Finance -> Flex. js/finance.js (flexDoelPrognose)
rekent precies hetzelfde; verander je hier iets, verander het daar ook.
"""
import datetime
import json
import re
import sys

GEWERKT = ("normale uren", "overwerkuren", "ploegentoeslag")


def splits_naam(p):
    m = re.match(r"\s*(.+?)\s*\(([^)]+)\)\s*$", str(p or ""))
    return (m.group(1).strip(), m.group(2).strip()) if m else (str(p or "").strip(), "")


def maandag(jaar, week):
    return datetime.date.fromisocalendar(int(jaar), int(week), 1).isoformat()


def regels(pad):
    d = json.load(open(pad, encoding="utf-8"))
    loc = d.get("locatie") or {}
    if loc.get("naam") != "Ploeggenoten B.V.":
        sys.exit(f"FOUT: overzicht is niet van Ploeggenoten B.V. maar van {loc.get('naam')!r}")
    uit = []
    for r in loc.get("regels") or []:
        fn, ma, u = r.get("fn") or 0, float(r.get("ma") or 0), float(r.get("u") or 0)
        if not fn and not ma and not u:
            continue        # 'niet gefactureerd'-regel van € 0: draagt niets
        naam, roep = splits_naam(r.get("p"))
        soort = str(r.get("c") or "")
        uit.append(dict(
            factuur=str(fn or ""), deelfactuur=str(fn or ""), factuurdatum=r.get("fd"),
            week=int(r["w"]), jaar=int(r["j"]), weekmaandag=maandag(r["j"], r["w"]),
            datum=r.get("d"), naam=naam, roepnaam=roep, functie=r.get("f") or "",
            klant_bron=r.get("k") or "", soort=soort,
            uren=u if any(x in soort.lower() for x in GEWERKT) else 0.0, uren_regel=u,
            tarief=r.get("t"), klantbedrag=r.get("om"), marge=ma))
    if not uit:
        sys.exit("FOUT: geen regels in het Stekkerdoos-overzicht")
    return {"stekkerdoos": True, "regels": uit}


# ── Prognose ────────────────────────────────────────────────────────────────

def _dag(s):
    return datetime.date.fromisoformat(str(s)[:10]) if s else None


def _woorden(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return [w for w in re.split(r"[^a-z0-9]+", "".join(c for c in s if unicodedata.category(c) != "Mn")) if w]


def prognose(stand, vandaag=None):
    vandaag = vandaag or datetime.date.today()
    kr = [k for k in stand.get("krachten") or [] if k.get("week")]
    if not kr:
        return None
    laatste = max(_dag(k["week"]) for k in kr)
    vier = [laatste - datetime.timedelta(weeks=i) for i in range(4)]
    pl = stand.get("plaatsingen") or []

    def plaatsing(roep):
        w = (_woorden(roep) or [None])[0]
        hits = [p for p in pl if w and w in _woorden(p.get("kandidaat"))]
        return hits[0] if len(hits) == 1 else None

    personen = {}
    for k in kr:
        s = (k.get("naam"), k.get("roepnaam"))
        p = personen.setdefault(s, {"naam": k.get("naam"), "roep": k.get("roepnaam"), "klant": k.get("klant"),
                                    "weken": {}, "eerste": _dag(k["week"])})
        wk = _dag(k["week"])
        p["weken"][wk] = p["weken"].get(wk, 0) + float(k.get("marge") or 0)
        p["eerste"] = min(p["eerste"], wk)
        if not p["klant"] and k.get("klant"):
            p["klant"] = k["klant"]

    lopers = []
    for p in personen.values():
        # Actief = marge in de laatste gefactureerde week, of in de week ervoor
        # met een plaatsing die niet gestopt is (een week ziek of vrij).
        x = plaatsing(p["roep"])
        if not p["weken"].get(vier[0]) and not (p["weken"].get(vier[1]) and x and not x.get("gestopt_op")):
            continue
        n = sum(1 for w in vier if w >= p["eerste"])          # nieuwkomer: niet door 4 delen
        gem = sum(p["weken"].get(w, 0) for w in vier) / max(n, 1)
        stop = _dag(x.get("gestopt_op")) if x else None
        if stop and stop <= laatste + datetime.timedelta(days=6):
            continue
        lopers.append({"naam": f"{p['naam']} ({p['roep']})", "klant": p["klant"], "per_week": round(gem, 2),
                       "stop": stop.isoformat() if stop else None, "nieuw": False, "start": None})

    # Nieuw: getekend, start na de laatste gefactureerde week, nog geen factuur.
    bekend = {(_woorden(p["roep"]) or [""])[0] for p in personen.values()}
    for x in pl:
        start = _dag(x.get("start"))
        if x.get("gestopt_op") or x.get("concept") or not start or start <= laatste:
            continue
        if (_woorden(x.get("kandidaat")) or [""])[0] in bekend:
            continue
        try:
            pw = (float(x["klantfactor"]) - float(x["inkoop_factor"])) * float(x["uurloon"]) * float(x.get("uren_pw") or 40)
        except (KeyError, TypeError, ValueError):
            pw = None
        lopers.append({"naam": x.get("kandidaat"), "klant": x.get("klant"), "per_week": round(pw, 2) if pw else None,
                       "stop": None, "nieuw": True, "start": start.isoformat()})

    # Drie maanden: deze en de twee volgende.
    m0 = vandaag.replace(day=1)
    maanden = [m0]
    for _ in range(2):
        maanden.append((maanden[-1] + datetime.timedelta(days=32)).replace(day=1))
    geboekt = {}
    for w in stand.get("weken") or []:
        d = _dag(w["week"])
        geboekt[(d.year, d.month)] = geboekt.get((d.year, d.month), 0) + float(w.get("bedrag") or 0)
    doel = stand.get("doel_pm")
    rij = []
    for m in maanden:
        verwacht, nieuw = 0.0, 0.0
        wk = laatste + datetime.timedelta(weeks=1)
        while wk <= (maanden[-1] + datetime.timedelta(days=32)).replace(day=1):
            if (wk.year, wk.month) == (m.year, m.month):
                for l in lopers:
                    if not l["per_week"]:
                        continue
                    if l["stop"] and wk >= _dag(l["stop"]):
                        continue
                    if l["start"] and wk + datetime.timedelta(days=6) < _dag(l["start"]):
                        continue
                    if l["nieuw"]:
                        nieuw += l["per_week"]
                    else:
                        verwacht += l["per_week"]
            wk += datetime.timedelta(weeks=1)
        g = geboekt.get((m.year, m.month), 0)
        totaal = g + verwacht + nieuw
        rij.append({"maand": m.strftime("%Y-%m"), "geboekt": round(g, 2), "verwacht": round(verwacht, 2),
                    "nieuw": round(nieuw, 2), "totaal": round(totaal, 2), "doel": doel,
                    "gat": round(doel - totaal, 2) if doel else None})
    lopend = [l for l in lopers if not l["nieuw"] and l["per_week"]]
    per_kracht_maand = (sum(l["per_week"] for l in lopend) / len(lopend) * 52 / 12) if lopend else None
    return {"laatste_week": laatste.isoformat(), "flexkrachten": lopers, "maanden": rij,
            "doel_pm": doel, "per_kracht_maand": round(per_kracht_maand, 2) if per_kracht_maand else None}


MND = ["", "jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]


def eur(x):
    return "€" + f"{x:,.0f}".replace(",", ".")


def als_tekst(pg):
    if not pg:
        return "Geen weken in het CRM — geen prognose."
    regels_ = [f"Laatste gefactureerde week: {pg['laatste_week']} · {len([l for l in pg['flexkrachten'] if not l['nieuw']])} lopende flexkrachten"]
    for m in pg["maanden"]:
        y, mm = m["maand"].split("-")
        t = f"{MND[int(mm)]} {y}: {eur(m['totaal'])} (geboekt {eur(m['geboekt'])} + verwacht {eur(m['verwacht'])}"
        t += f" + nieuw {eur(m['nieuw'])})" if m["nieuw"] else ")"
        if m["doel"]:
            gat = m["gat"]
            if gat > 0 and pg["per_kracht_maand"]:
                t += f" · doel {eur(m['doel'])}: nog {eur(gat)} te gaan ≈ {gat / pg['per_kracht_maand']:.1f}".replace(".", ",") + " flexkracht extra"
            else:
                t += f" · doel {eur(m['doel'])}: " + ("gehaald" if gat <= 0 else f"nog {eur(gat)} te gaan")
        regels_.append(t)
    if not pg["doel_pm"]:
        regels_.append("Nog geen maanddoel — vul het in bij Finance → Flex.")
    zonder = [l["naam"] for l in pg["flexkrachten"] if l["nieuw"] and not l["per_week"]]
    if zonder:
        regels_.append("Nieuw, maar zonder uurloon/factor (telt niet mee): " + ", ".join(zonder))
    return "\n".join(regels_)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("regels", "prognose"):
        sys.exit("Gebruik: stekkerdoos.py regels <gegevens.json> | prognose <stand.json>")
    if sys.argv[1] == "regels":
        print(json.dumps(regels(sys.argv[2])))
    else:
        tekst = open(sys.argv[2], encoding="utf-8").read().split("\nHTTP:")[0]
        stand = json.loads(tekst)
        pg = prognose(stand)
        print(als_tekst(pg))
        print("\nJSON:" + json.dumps(pg))
