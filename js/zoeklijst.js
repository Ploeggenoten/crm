/* ─── Doorzoekbare dropdowns, systeembreed ─────────────────────────
   Tjeerd, 3 sep 2026: "bij een dropdown, in geheel het systeem, moet je
   alles kunnen intypen en dan komt hij er automatisch op."

   Eén globale laag in plaats van elk scherm verbouwen: elke <select>
   met genoeg opties krijgt bij het openen een zoekpaneel dat over de
   pagina heen valt — typ en de lijst filtert live. Het paneel is puur
   presentatie: de keuze wordt op de onderliggende <select> gezet en
   die vuurt zijn gewone change-event, dus alle bestaande onchange-
   handlers in het hele CRM blijven ongewijzigd werken.

   Kleine lijsten (minder dan MIN opties) blijven native: daar is een
   zoekveld trager dan twee keer pijltje-omlaag. */
(function(){
  const MIN = 8;
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  let paneel = null;

  function sluit(){
    if(paneel){ paneel.remove(); paneel = null; }
  }

  function open(sel, startTekst){
    sluit();
    const r = sel.getBoundingClientRect();
    paneel = document.createElement('div');
    paneel.className = 'zoeklijst';
    paneel.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
    paneel.style.minWidth = Math.max(r.width, 240) + 'px';
    paneel.innerHTML = `<input type="search" placeholder="Typ om te zoeken…" autocomplete="off"><div class="zl-opties"></div>`;
    document.body.appendChild(paneel);
    /* Onder het veld, tenzij daar geen ruimte is — dan erboven. */
    const hoogte = Math.min(300, paneel.offsetHeight + 260);
    if(r.bottom + hoogte > window.innerHeight && r.top > hoogte)
         paneel.style.top = (r.top - Math.min(300, paneel.offsetHeight || 300) - 4) + 'px';
    else paneel.style.top = (r.bottom + 4) + 'px';

    const inp = paneel.querySelector('input');
    const box = paneel.querySelector('.zl-opties');
    const opts = Array.from(sel.options).map(o => ({v:o.value, t:o.textContent}));
    let actief = 0, zicht = opts;

    const kies = v => {
      sluit();
      if(v === sel.value) return;
      sel.value = v;
      sel.dispatchEvent(new Event('change', {bubbles:true}));
    };
    const teken = () => {
      const q = norm(inp.value);
      zicht = opts.filter(o => !q || norm(o.t).includes(q));
      if(actief >= zicht.length) actief = Math.max(0, zicht.length - 1);
      box.innerHTML = zicht.length ? zicht.map((o, j) =>
        `<div class="zl-optie${j===actief?' act':''}${o.v===sel.value?' sel':''}" data-i="${j}">${
          o.t.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>`).join('')
        : `<div class="zl-leeg">niets gevonden</div>`;
      const a = box.querySelector('.act');
      if(a) a.scrollIntoView({block:'nearest'});
    };
    inp.oninput = () => { actief = 0; teken(); };
    inp.onkeydown = e => {
      if(e.key === 'ArrowDown'){ e.preventDefault(); actief = Math.min(actief+1, zicht.length-1); teken(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); actief = Math.max(actief-1, 0); teken(); }
      else if(e.key === 'Enter'){ e.preventDefault(); if(zicht[actief]) kies(zicht[actief].v); }
      else if(e.key === 'Escape' || e.key === 'Tab'){ sluit(); }
    };
    /* mousedown, niet click: vóór blur, anders sluit het paneel zichzelf. */
    box.onmousedown = e => {
      const d = e.target.closest('.zl-optie');
      if(d){ e.preventDefault(); kies(zicht[+d.dataset.i].v); }
    };
    if(startTekst){ inp.value = startTekst; }
    teken();
    inp.focus();
  }

  const geschikt = sel => sel && sel.tagName === 'SELECT' && !sel.multiple
    && !sel.disabled && sel.size <= 1 && sel.options.length >= MIN;

  /* capture-fase: vóór de native dropdown opengaat. */
  document.addEventListener('mousedown', e => {
    if(paneel && paneel.contains(e.target)) return;
    const sel = e.target.closest && e.target.closest('select');
    if(geschikt(sel)){ e.preventDefault(); open(sel); return; }
    sluit();
  }, true);
  /* Toetsenbord: op een gefocuste select meteen beginnen te typen. */
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ sluit(); return; }
    if(paneel) return;
    const sel = document.activeElement;
    if(geschikt(sel) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
      e.preventDefault(); open(sel, e.key);
    }
  }, true);
  window.addEventListener('scroll', e => { if(paneel && !paneel.contains(e.target)) sluit(); }, true);
  window.addEventListener('resize', sluit);
})();
