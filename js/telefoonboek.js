/* ═══ TELEFOONBOEK — namen herkennen bij "Nieuwe contactpersoon" ══════
   Tjeerd, 3 nov 2026: "als ik contactpersonen toevoeg in het CRM moet hij
   dat herkennen, dat ik niet al het nummer weer hoef op te zoeken." Hij
   voegt toe op de laptop én op zijn iPhone, dus twee wegen:

   1. TYPEN (overal) — onder het naamveld verschijnen namen uit je eigen
      telefoonboek; kies er een en nummer, mail en functie staan erin.
      Bron: crm_telefoonboek, elke ochtend door de leadradar-routine gevuld
      vanuit Contacten op de Mac (iCloud = iPhone). Alleen eigen rijen
      (RLS op e-mail, zie supabase/telefoonboek.sql). Wie geen rijen heeft,
      merkt van dit alles niets.
   2. KIEZEN (iPhone) — knop "Uit telefoon": Safari's eigen contactkiezer.
      Staat in iOS standaard uit (Instellingen → Apps → Safari → Geavanceerd
      → Feature Flags → Contact Picker API). Zonder die vlag geen knop.

   Eén aanroep per venster: CRM.telefoonboek.hang(modal, {naam, functie,
   tel, mail, klant}) met selectors of een functie die de relatienaam geeft.
   Het venster blijft verder van zichzelf; wij vullen alleen velden. */
(function(){
  const h = CRM.h;
  let boek = null, laden = null;

  /* Eén keer per sessie, in stukken van 1000 (de Supabase-grens). */
  async function haal(){
    if(boek) return boek;
    if(laden) return laden;
    laden = (async () => {
      if(CRM.demo) return boek = DEMO;
      const uit = [];
      for(let van = 0; van < 10000; van += 1000){
        const {data, error} = await CRM.sb.from('crm_telefoonboek')
          .select('naam,bedrijf,functie,telefoons,emails').order('naam').range(van, van + 999);
        if(error){ console.warn('telefoonboek', error.message); break; }
        uit.push(...(data||[]));
        if(!data || data.length < 1000) break;
      }
      return boek = uit.map(c => Object.assign(c, {_z: plat(c.naam + ' ' + (c.bedrijf||''))}));
    })();
    return laden;
  }

  const plat = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cijfers = s => String(s||'').replace(/\D/g, '').slice(-9);
  const mobiel = t => /^(\+?31|0031|0)\s*\(?0?\)?\s*6/.test(String(t||'').replace(/[\s-]/g, ''));
  const besteNummer = c => (c.telefoons||[]).find(mobiel) || (c.telefoons||[])[0] || '';

  /* Staat dit nummer al bij een CRM-contactpersoon? Dan zeggen we dat,
     zodat je geen dubbele aanmaakt. */
  function alInCrm(c){
    const nrs = new Set((c.telefoons||[]).map(cijfers).filter(n => n.length === 9));
    if(!nrs.size) return null;
    return (CRM.state.contacten||[]).find(x => nrs.has(cijfers(x.telefoon))) || null;
  }

  function zoek(tekst, klant){
    const woorden = plat(tekst).split(/\s+/).filter(Boolean);
    if(!boek || !woorden.length || woorden.join('').length < 2) return [];
    const zelf = c => klant && c.bedrijf && CRM.zelfdeKlant(c.bedrijf, klant);
    return boek
      .filter(c => woorden.every(w => c._z.includes(w)))
      .map(c => ({c, s: (zelf(c) ? 0 : 2) + (plat(c.naam).startsWith(woorden[0]) ? 0 : 1)}))
      .sort((a, b) => a.s - b.s || a.c.naam.localeCompare(b.c.naam))
      .slice(0, 6).map(x => x.c);
  }

  function hang(m, sel){
    const veld = k => typeof sel[k] === 'string' ? m.querySelector(sel[k]) : null;
    const naam = veld('naam'); if(!naam) return;
    const klant = () => typeof sel.klant === 'function' ? sel.klant() : (sel.klant || '');

    /* Alleen lege velden vullen: bij bewerken overschrijven we niets wat je
       al had. Een nieuw venster is leeg, dus daar komt alles erin. */
    function vul(c){
      naam.value = c.naam;
      const zet = (k, w) => { const v = veld(k); if(v && w && !v.value.trim()){ v.value = w; v.dispatchEvent(new Event('input', {bubbles:true})); } };
      zet('tel', c.tel || besteNummer(c));
      zet('mail', c.mail || (c.emails||[])[0]);
      zet('functie', c.functie);
      sluit();
      CRM.toast(`${c.naam} uit je telefoon overgenomen`, 'ok');
    }

    /* 2. iPhone-kiezer */
    if(navigator.contacts && typeof navigator.contacts.select === 'function'){
      const lbl = naam.closest('.f-row')?.querySelector('label');
      if(lbl){
        lbl.insertAdjacentHTML('beforeend', ' <button type="button" class="tb-kies">📇 Uit telefoon</button>');
        lbl.querySelector('.tb-kies').onclick = async e => {
          e.preventDefault();
          try{
            const [k] = await navigator.contacts.select(['name','tel','email'], {multiple:false});
            if(k) vul({naam: (k.name||[])[0] || '', tel: (k.tel||[]).find(mobiel) || (k.tel||[])[0] || '', mail: (k.email||[])[0] || ''});
          }catch(_){ /* venster weggeklikt */ }
        };
      }
    }

    /* 1. Typen */
    const rij = naam.closest('.f-row') || naam.parentNode;
    rij.classList.add('tb-rij');
    const lijst = document.createElement('div');
    lijst.className = 'tb-lijst'; lijst.hidden = true;
    rij.appendChild(lijst);
    naam.setAttribute('autocomplete', 'off');
    let treffers = [], actief = -1;
    function sluit(){ lijst.hidden = true; treffers = []; actief = -1; }
    function teken(){
      if(!treffers.length) return sluit();
      lijst.innerHTML = `<div class="tb-kop">Uit je telefoon</div>` + treffers.map((c, i) => {
        const al = alInCrm(c);
        return `<button type="button" class="tb-optie${i === actief ? ' act' : ''}" data-i="${i}">
          <b>${h(c.naam)}</b>${c.bedrijf ? `<span>${h(c.bedrijf)}</span>` : ''}
          <small>${h(besteNummer(c) || (c.emails||[])[0] || '')}${al ? ` · staat al bij ${h(al.klant || 'een relatie')}` : ''}</small>
        </button>`;
      }).join('');
      lijst.hidden = false;
    }
    naam.addEventListener('input', async () => {
      await haal();
      treffers = zoek(naam.value, klant()); actief = -1; teken();
    });
    naam.addEventListener('keydown', e => {
      if(lijst.hidden) return;
      if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
        e.preventDefault();
        actief = (actief + (e.key === 'ArrowDown' ? 1 : -1) + treffers.length) % treffers.length; teken();
      } else if(e.key === 'Enter' && actief >= 0){ e.preventDefault(); vul(treffers[actief]); }
      else if(e.key === 'Escape'){ e.stopPropagation(); sluit(); }
    });
    /* mousedown i.p.v. click: anders sluit blur de lijst vóór de klik. */
    lijst.addEventListener('mousedown', e => {
      const b = e.target.closest('.tb-optie'); if(!b) return;
      e.preventDefault(); vul(treffers[+b.dataset.i]);
    });
    naam.addEventListener('blur', () => setTimeout(sluit, 150));
    haal();   // alvast laden, dan is de eerste letter meteen raak
  }

  const DEMO = [
    {naam:'Jan de Vries', bedrijf:'Koomstra & Co', functie:'Productiemanager', telefoons:['06 12 34 56 78'], emails:['jan@koomstra.example']},
    {naam:'Janneke Bos', bedrijf:'', functie:'', telefoons:['06 98 76 54 32'], emails:[]},
    {naam:'Peter Jansen', bedrijf:'Starcuisine', functie:'HR-adviseur', telefoons:['0172 123 456', '06 11 22 33 44'], emails:['p.jansen@starcuisine.example']},
    {naam:'Sandra Meijer', bedrijf:'MBS Groep', functie:'Operationeel manager', telefoons:['06 55 44 33 22'], emails:['sandra@mbs.example']}
  ].map(c => Object.assign(c, {_z: plat(c.naam + ' ' + c.bedrijf)}));

  CRM.telefoonboek = {hang, haal};
})();
