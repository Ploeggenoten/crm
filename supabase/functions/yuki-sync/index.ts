// ═══ YUKI-SYNC v3 · Supabase Edge Function ═══
// Dagvers uit Yuki / Nmbrs Accounting (alleen-lezen): saldi/winst/omzet,
// open debiteuren & crediteuren, werkelijke kosten per afgesloten maand,
// en (v3, 27 okt 2026) de hele winst-en-verliesrekening PER POST PER
// MAAND — dezelfde cijfers als Yuki's "Vergelijking maanden", maar live,
// zodat het CRM kosten per post kan meten en stijgingen kan signaleren.
// Gebruikt exact dezelfde aanroepen als v2 (GLAccountBalance per
// maandeinde); er komt alleen meer van het antwoord in de database.
// Bron staat sinds v3 in het CRM-repo (supabase/functions/yuki-sync).
// Sleutel staat als secret YUKI_ACCESS_KEY; alleen tjeerd@ploeggenoten.nl.
import { createClient } from "jsr:@supabase/supabase-js@2";

const YUKI = "https://api.yukiworks.nl/ws/Accounting.asmx";
const OWNER = "tjeerd@ploeggenoten.nl";

async function soap(action: string, body: string): Promise<string> {
  const res = await fetch(YUKI, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `"http://www.theyukicompany.com/${action}"`,
    },
    body: `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`,
  });
  return await res.text();
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

function parseBalans(xml: string) {
  return [...xml.matchAll(
    /<GLAccount Code="(\d+)" BalanceType="(\w)"><Description>([^<]*)<\/Description><Amount>([-\d.]+)<\/Amount>/g,
  )].map((m) => ({ code: m[1], type: m[2], naam: m[3], bedrag: Number(m[4]) }));
}

function parseOpenItems(xml: string) {
  return [...xml.matchAll(
    /<Item ID="[^"]+"><Date>([^<]*)<\/Date><Description>([^<]*)<\/Description><Contact>([^<]*)<\/Contact>[\s\S]*?<OpenAmount>([-\d.]+)<\/OpenAmount><OriginalAmount>([-\d.]+)<\/OriginalAmount>[\s\S]*?<Reference>([^<]*)<\/Reference><DueDate>([^<]*)<\/DueDate>/g,
  )].map((m) => ({
    datum: m[1] || null, omschrijving: m[2], contact: m[3],
    open_bedrag: Number(m[4]), origineel_bedrag: Number(m[5]),
    referentie: m[6] || null, vervaldatum: m[7] || null,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // ── alleen de eigenaar ──
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if ((user?.email ?? "").toLowerCase() !== OWNER) return json({ error: "geen toegang" }, 403);

    const key = Deno.env.get("YUKI_ACCESS_KEY");
    const adminId = Deno.env.get("YUKI_ADMIN_ID");
    if (!key || !adminId) return json({ error: "YUKI_ACCESS_KEY / YUKI_ADMIN_ID nog niet ingesteld als secret" }, 500);

    const authXml = await soap("Authenticate",
      `<Authenticate xmlns="http://www.theyukicompany.com/"><accessKey>${key}</accessKey></Authenticate>`);
    const sessie = authXml.match(/<AuthenticateResult>([^<]+)</)?.[1];
    if (!sessie) return json({ error: "Yuki-authenticatie mislukt (sleutel verlopen/ingetrokken?)" }, 502);

    const balansOp = async (datum: string) => parseBalans(await soap("GLAccountBalance",
      `<GLAccountBalance xmlns="http://www.theyukicompany.com/"><sessionID>${sessie}</sessionID><administrationID>${adminId}</administrationID><transactionDate>${datum}</transactionDate></GLAccountBalance>`));

    // ── 1. saldi van vandaag ──
    const vandaag = new Date().toISOString().slice(0, 10);
    const accounts = await balansOp(vandaag);
    if (!accounts.length) return json({ error: "geen saldi ontvangen van Yuki" }, 502);
    const van = (code: string) => accounts.find((a) => a.code === code)?.bedrag ?? 0;
    const winst = -accounts.filter((a) => a.type === "W").reduce((s, a) => s + a.bedrag, 0);
    const omzet = -van("80000");
    const saldo = van("11000");
    const debiteuren = van("13000");
    const rcTve = -van("20200");

    // ── 2. open posten (debiteuren + crediteuren) ──
    const openXml = async (methode: string) => parseOpenItems(await soap(methode,
      `<${methode} xmlns="http://www.theyukicompany.com/"><sessionID>${sessie}</sessionID><administrationID>${adminId}</administrationID><includeBankTransactions>true</includeBankTransactions><sortOrder>DateAsc</sortOrder></${methode}>`));
    const deb = await openXml("OutstandingDebtorItems");
    const cred = await openXml("OutstandingCreditorItems");

    // ── 3. per maand: kosten (totaal) én de hele W&V per post ──
    // Winst-en-verliesrekeningen (type W) zijn in Yuki cumulatief binnen het
    // boekjaar; het verschil tussen twee maandeinden is dus de maand zelf.
    // De lopende maand loopt t/m vandaag. Omzet staat als credit (negatief).
    const jaar = vandaag.slice(0, 4);
    const dezeMaand = Number(vandaag.slice(5, 7));
    const kostenAccounts = (accs: ReturnType<typeof parseBalans>) =>
      accs.filter((a) => a.type === "W" && !a.code.startsWith("8")).reduce((s, a) => s + a.bedrag, 0);
    const maandKosten: { maand: string; bedrag: number }[] = [];
    const maandPL: Record<string, { c: string; n: string; b: number }[]> = {};
    const namen = new Map<string, string>();
    let vorigeCum = 0;
    let vorigePerPost = new Map<string, number>();
    for (let m = 1; m <= dezeMaand; m++) {
      const lopend = m === dezeMaand;
      const eind = lopend ? vandaag : new Date(Date.UTC(Number(jaar), m, 0)).toISOString().slice(0, 10); // laatste dag maand m
      const accs = lopend ? accounts : await balansOp(eind);
      if (!lopend) {
        const cum = kostenAccounts(accs);
        maandKosten.push({ maand: `${jaar}-${String(m).padStart(2, "0")}-01`, bedrag: Math.round((cum - vorigeCum) * 100) / 100 });
        vorigeCum = cum;
      }
      const w = accs.filter((a) => a.type === "W");
      w.forEach((a) => namen.set(a.code, a.naam));
      const nu = new Map(w.map((a) => [a.code, a.bedrag]));
      const rijen: { c: string; n: string; b: number }[] = [];
      for (const code of new Set([...nu.keys(), ...vorigePerPost.keys()])) {
        const b = Math.round(((nu.get(code) ?? 0) - (vorigePerPost.get(code) ?? 0)) * 100) / 100;
        if (Math.abs(b) >= 0.01) rijen.push({ c: code, n: namen.get(code) ?? "", b });
      }
      maandPL[`${jaar}-${String(m).padStart(2, "0")}`] = rijen;
      vorigePerPost = nu;
    }

    // ── wegschrijven ──
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const r1 = await db.from("fin_settings").upsert([
      { key: "yuki_winst_ytd", value: Math.round(winst * 100) / 100 },
      { key: "yuki_winst_datum", value: vandaag },
      { key: "yuki_omzet_ytd", value: Math.round(omzet * 100) / 100 },
      { key: "yuki_debiteuren", value: Math.round(debiteuren * 100) / 100 },
      { key: "yuki_crediteuren_open", value: Math.round(cred.reduce((s, i) => s + i.open_bedrag, 0) * 100) / 100 },
      { key: "yuki_rc_tve", value: Math.round(rcTve * 100) / 100 },
      { key: "yuki_synced_at", value: new Date().toISOString() },
      { key: "yuki_pl_maanden", value: maandPL },
      { key: "yuki_pl_datum", value: vandaag },
    ]);
    if (r1.error) throw r1.error;

    const r2 = await db.from("fin_bank_saldo").upsert(
      { datum: vandaag, saldo, note: "Automatisch uit Yuki" }, { onConflict: "datum" });
    if (r2.error) throw r2.error;

    await db.from("fin_yuki_open").delete().neq("id", -1);
    const rijen = [
      ...deb.map((i) => ({ ...i, soort: "debiteur" })),
      ...cred.map((i) => ({ ...i, soort: "crediteur" })),
    ];
    if (rijen.length) {
      const r3 = await db.from("fin_yuki_open").insert(rijen);
      if (r3.error) throw r3.error;
    }

    if (maandKosten.length) {
      const r4 = await db.from("fin_costs_actual").upsert(
        maandKosten.map((k) => ({ maand: k.maand, categorie: "Werkelijk totaal (Yuki)", bedrag: k.bedrag, note: "automatisch" })),
        { onConflict: "maand,categorie" });
      if (r4.error) throw r4.error;
    }

    return json({
      ok: true, datum: vandaag, saldo, winst, omzet, debiteuren,
      openDebiteuren: deb.length, openCrediteuren: cred.length,
      maandenKosten: maandKosten.length, maandenPL: Object.keys(maandPL).length, rcTve,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
