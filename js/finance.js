/* ═══════════════════════════════════════════════════════════════
   MODULE: FINANCE — alleen zichtbaar voor Tjeerd.
   Dit is een SAMENVATTING, geen tweede finance-app. Het rekenwerk
   (facturatie, cashflow, advies) blijft in de bestaande app; hier
   staat wat je dagelijks wilt zien zonder van app te wisselen.

   Privacy: de fin_*-tabellen hebben RLS waardoor alleen Tjeerd ze kan
   lezen. Deze module is bovendien adminOnly, dus het team ziet hem niet
   eens staan. Dubbele grens: database én interface.
   ═══════════════════════════════════════════════════════════════ */

const FIN_APP = 'https://ploeggenoten.github.io/ploeggenoten-finance/';
let _fin = null, _finFout = null;

async function finLaad(){
  if(_fin) return _fin;
  if(CRM.demo){ _fin = {demo:true}; return _fin; }
  const q = t => CRM.sb.from(t).select('*');
  try{
    const [pl, inst, sal, st, yo, fx] = await Promise.all([
      q('fin_placements'), q('fin_installments'), q('fin_bank_saldo'),
      q('fin_settings'), q('fin_yuki_open'), q('fin_flex_weken')
    ]);
    if(pl.error) throw pl.error;
    _fin = {
      placements: pl.data||[], installments: inst.data||[],
      saldi: (sal.data||[]).slice().sort((a,b)=>String(b.datum).localeCompare(String(a.datum))),
      settings: Object.fromEntries((st.data||[]).map(r=>[r.key, r.value])),
      yukiOpen: yo.error?[]:(yo.data||[]), flex: fx.error?[]:(fx.data||[])
    };
  }catch(e){ _finFout = e; _fin = null; }
  return _fin;
}

function finMaandOmzet(f, mk){
  return (f.installments||[])
    .filter(i => String(i.geplande_datum||'').slice(0,7)===mk && i.status!=='vervallen')
    .reduce((s,i)=>s+Number(i.bedrag||0),0);
}

CRM.registerModule('finance', {
  title:'Finance', icon:'€', onderschrift:'Cashflow, facturatie en signalen', adminOnly:true,

  async render(mount, acties){
    acties.innerHTML = `<a class="btn ghost" href="${FIN_APP}" target="_blank" rel="noopener">Volledige finance-app openen ↗</a>`;
    mount.innerHTML = CRM.ui.laden('Financiële gegevens ophalen…');

    const f = await finLaad();

    if(CRM.demo){
      mount.innerHTML = `
        <div class="note info" style="margin-bottom:18px">
          <b>Demo-modus.</b> Financiële cijfers komen uit de beveiligde fin_-tabellen en worden
          alleen geladen wanneer je echt ingelogd bent als eigenaar. In deze demo blijft dit scherm leeg —
          dat is precies de bedoeling.
        </div>
        ${CRM.ui.leeg('Geen financiële gegevens in demo','Log in met je eigen account om cashflow, facturatie en signalen te zien.')}`;
      return;
    }
    if(!f){
      mount.innerHTML = `<div class="note warn"><b>Financiële gegevens niet geladen.</b><br>
        ${CRM.h(_finFout?.message || 'Onbekende fout')}<br>
        <span class="meta">Dit is verwacht als je niet als eigenaar bent ingelogd — de fin_-tabellen zijn met RLS afgeschermd.</span></div>`;
      return;
    }

    const mk = new Date().toISOString().slice(0,7);
    const saldo = f.saldi[0];
    const openTermijnen = f.installments.filter(i => i.status==='te_factureren');
    const gefactureerd  = f.installments.filter(i => i.status==='gefactureerd');
    const openBedrag    = gefactureerd.reduce((s,i)=>s+Number(i.bedrag||0),0);
    const teFactureren  = openTermijnen.filter(i => String(i.geplande_datum||'') <= CRM.todayISO());
    const concepten     = f.placements.filter(p => p.concept);
    const omzetMaand    = finMaandOmzet(f, mk);
    const yukiOpen      = f.yukiOpen.reduce((s,r)=>s+Number(r.open_bedrag||r.openamount||0),0);
    const pl            = CRM.plaatsingenMaand(mk);
    const target        = CRM.maandTarget(mk);

    const acts = [];
    if(concepten.length) acts.push({ico:'📋', titel:`${concepten.length} plaatsing${concepten.length>1?'en':''} nog te bevestigen`,
      tekst:'Fee en factuurschema invullen in de finance-app.'});
    if(teFactureren.length) acts.push({ico:'🧾', titel:`${teFactureren.length} termijn${teFactureren.length>1?'en':''} klaar om te factureren`,
      tekst:CRM.euro(teFactureren.reduce((s,i)=>s+Number(i.bedrag||0),0)) + ' aan facturen die vandaag of eerder gepland stonden.'});
    const laatsteFlex = f.flex.map(w=>w.week).sort().pop();
    if(laatsteFlex && CRM.dagenGeleden(laatsteFlex) > 21) acts.push({ico:'📄', titel:'Margefactuur Pronkert ontbreekt',
      tekst:`Laatste verwerkte week is ${CRM.fmtDate(laatsteFlex)} — dat is ${CRM.dagenGeleden(laatsteFlex)} dagen geleden.`});

    mount.innerHTML = `
      <div class="grid c4" style="margin-bottom:18px">
        ${CRM.ui.kpi('Banksaldo', saldo ? CRM.euro(saldo.bedrag) : '—',
          saldo ? `stand van ${CRM.fmtDate(saldo.datum)}` : 'nog geen saldo bekend', 'accent')}
        ${CRM.ui.kpi('Gepland deze maand', CRM.euro(omzetMaand), 'som van de geplande termijnen')}
        ${CRM.ui.kpi('Openstaand', CRM.euro(openBedrag),
          yukiOpen ? `Yuki meldt ${CRM.euro(yukiOpen)} open` : `${gefactureerd.length} facturen verstuurd`)}
        ${CRM.ui.kpi('Plaatsingen', `<span class="num">${pl.netto}</span> <span style="font-size:15px;color:var(--muted)">/ ${target}</span>`,
          `${pl.getekend.length} getekend · ${pl.gestopt.length} gestopt`)}
      </div>

      <div class="grid c2">
        <div class="card">
          <div class="card-h"><div class="h2">Wat vraagt aandacht</div></div>
          <div class="card-b">
            ${acts.length ? CRM.ui.tijdlijn(acts.map(a=>({ico:a.ico, titel:a.titel, tekst:a.tekst, wanneer:''})))
                          : `<div class="note ok">Niets open — facturatie en plaatsingen zijn bij.</div>`}
            ${acts.length ? `<a class="btn" style="margin-top:14px" href="${FIN_APP}" target="_blank" rel="noopener">Afhandelen in de finance-app ↗</a>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-h"><div class="h2">Deze maand getekend</div></div>
          <div class="card-b">
            ${pl.getekend.length ? `<div class="tblwrap" style="border:none">
              <table class="tbl"><tbody>
              ${pl.getekend.map(c=>`<tr><td style="width:38px">${CRM.avatar(c.naam,'sm')}</td>
                <td><b>${CRM.h(c.naam)}</b><div class="rowsub">${CRM.h(c.functie)} · ${CRM.h(c.klant)}</div></td>
                <td class="n"><span class="num meta">${CRM.fmtDateShort(c.geplaatstOp)}</span></td></tr>`).join('')}
              </tbody></table></div>`
              : CRM.ui.leeg('Nog niets getekend deze maand','')}
            ${pl.gestopt.length ? `<div class="note warn" style="margin-top:12px">
              ${pl.gestopt.length} gestopt deze maand: ${pl.gestopt.map(c=>CRM.h(c.naam)).join(', ')}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="note info" style="margin-top:18px">
        Het volledige rekenwerk — cashflowprognose, facturatie, kosten, flexmarge en de advies-engine —
        staat in de finance-app. Dit scherm is de dagelijkse samenvatting.
      </div>`;
  }
});
