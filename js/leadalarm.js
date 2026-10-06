/* ═══════════════════════════════════════════════════════════════
   MODULE: LEAD-ALARM

   Rode balk bovenaan elk scherm zodra er te lang geen nieuwe Meta-lead
   is binnengekomen. Aanleiding: 5 okt 2026 stopte de leadstroom (mislukte
   Meta-betaling of een storing in Meta → n8n → Wati → CRM) en dat werd pas
   de volgende ochtend gezien. Tjeerd: "als er 5 uur lang geen lead is
   binnengekomen moet ik een waarschuwing krijgen".

   Regel: DREMPEL_UUR wakkere uren (07:00-23:00 Nederlandse tijd) zonder
   nieuwe lead. Nachturen tellen niet mee: nachtgaten van 5 tot 9 uur komen
   voor (o.a. 2 okt 23:08 → 07:50) en zouden elke ochtend vals alarm geven.

   Vraagt elke twee minuten de nieuwste Meta-lead rechtstreeks aan de
   database (één rij) in plaats van State.leads te vertrouwen: een tabblad
   dat uren openstaat met een verbroken realtime-verbinding zou anders
   juist op het slechtste moment een vals alarm geven.

   Leest alleen crm_leads. Schrijft niets.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const h = CRM.h;
  const DREMPEL_UUR = 5;
  const WAKKER_VAN = 7, WAKKER_TOT = 23;
  const CONTROLE_MS = 2 * 60 * 1000;
  const SNOOZE_KEY = 'crm_leadalarm_snooze';
  const TITEL_ORIG = document.title;

  const uurFmt = new Intl.DateTimeFormat('nl-NL', {timeZone:'Europe/Amsterdam', hour:'numeric', hourCycle:'h23'});
  const nlUur = ms => +uurFmt.format(new Date(ms));

  /* Stilte in wakkere uren, in stappen van 5 minuten (maximaal 7 dagen terug). */
  function wakkerUren(vanMs, totMs){
    const STAP = 5 * 60 * 1000;
    const start = Math.max(vanMs, totMs - 7 * 86400000);
    let n = 0;
    for(let t = start; t < totMs; t += STAP){
      const u = nlUur(t);
      if(u >= WAKKER_VAN && u < WAKKER_TOT) n++;
    }
    return n * 5 / 60;
  }

  const snoozeTot = () => { try{ return +sessionStorage.getItem(SNOOZE_KEY) || 0; }catch(e){ return 0; } };
  const zetSnooze = ms => { try{ sessionStorage.setItem(SNOOZE_KEY, String(ms)); }catch(e){} };

  function balk(){
    let el = document.getElementById('leadalarm');
    if(!el){
      const main = document.querySelector('main.content');
      if(!main) return null;
      el = document.createElement('div');
      el.id = 'leadalarm';
      main.insertBefore(el, main.firstChild);
    }
    return el;
  }

  function wis(){
    const el = document.getElementById('leadalarm');
    if(el) el.remove();
    document.title = TITEL_ORIG;
  }

  function toon(laatsteMs, uren){
    const el = balk(); if(!el) return;
    const laatst = new Date(laatsteMs).toLocaleString('nl-NL', {timeZone:'Europe/Amsterdam', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    el.innerHTML = `
      <div class="la-in">
        <div class="la-t">
          <b>Geen nieuwe Meta-lead in ${h(uren.toFixed(1).replace('.', ','))} wakkere uur</b>
          <span>Laatste lead: ${h(laatst)}. Kijk in deze volgorde: (1) Meta Ads Manager: staan de campagnes op Actief, is de betaling gelukt? (2) Meta Leads Center: komen daar nog leads binnen? (3) n8n bij Smit: draait de workflow nog? (4) Wati: is de WhatsApp-koppeling verbonden?</span>
        </div>
        <button class="la-x" type="button" title="Verberg voor een uur">Verberg 1 uur</button>
      </div>`;
    el.querySelector('.la-x').onclick = () => { zetSnooze(Date.now() + 3600000); wis(); };
    document.title = '⚠ Geen leads · ' + TITEL_ORIG;
  }

  async function nieuwsteLead(){
    try{
      const r = await CRM.sb.from('crm_leads').select('binnen_op').eq('bron', 'Meta')
        .order('binnen_op', {ascending:false}).limit(1);
      if(!r.error && r.data && r.data[0]?.binnen_op) return new Date(r.data[0].binnen_op).getTime();
    }catch(e){}
    const l = (CRM.state?.leads || []).filter(x => x.bron === 'Meta' && x.binnen_op)
      .reduce((m, x) => Math.max(m, new Date(x.binnen_op).getTime()), 0);
    return l || null;
  }

  async function controleer(){
    if(!CRM.user) return;
    const laatste = await nieuwsteLead();
    if(!laatste) return;
    const nu = Date.now();
    const uren = wakkerUren(laatste, nu);
    if(uren < DREMPEL_UUR){ wis(); return; }
    if(nu < snoozeTot()) return;
    toon(laatste, uren);
  }

  CRM.leadAlarm = {controleer, wakkerUren};
  setTimeout(controleer, 4000);
  setInterval(controleer, CONTROLE_MS);
})();
