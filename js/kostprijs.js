/* ═══════════════════════════════════════════════════════════════
   KOSTPRIJSFACTOR — Pronkert CAO-rekentool nagebouwd
   Bron: "Kostprijsberekening UZB" (Pronkert, 15-07-26), tabblad
   'Kostprijsfactor - uitbetalen' (onze standaardvariant — componenten
   direct uitbetaald i.p.v. gereserveerd). Geen Excel meer nodig: CAO
   kiezen + contractfase + uurloon geeft dezelfde kostprijsfactor als
   de tool van Pronkert.

   Marge-afspraak (Tjeerd, 11 aug 2026): altijd 0,6 factorpunt boven de
   kostprijs, ook wanneer een CAO een los €/uur-bedrag kent (EJU/pensioen-
   compensatie/IKB/B&I-fondsen) — dat bedrag wordt eerst omgerekend naar
   een factor-equivalent (÷ uurloon) en bij de kostprijsfactor opgeteld,
   zodat één verkoopfactor alles dekt. De brontool zelf telt dat bedrag
   niet mee in zijn eigen margecel (B44/B46 op tabblad 2) — dat hebben we
   dus bewust gecorrigeerd, niet blind overgenomen.
   ═══════════════════════════════════════════════════════════════ */

/* Basisfactor per contractfase (identiek op beide tabbladen van de bron). */
CRM.CONTRACTFASE = [
  {naam:'Fase 1/2',          basisfactor:1.77},
  {naam:'Fase 1/2 Bouw cao', basisfactor:1.82},
  {naam:'Fase 3',            basisfactor:1.82},
  {naam:'Fase 3 bouw',       basisfactor:1.88},
  {naam:'Fase 4',            basisfactor:1.79},
  {naam:'Fase 4 Bouw',       basisfactor:1.90},
  {naam:'AOW gerechtigd',    basisfactor:1.50}
];

/* CAO-brondata, 1-op-1 overgetypt uit tabblad 'CAO brondata' (59 CAO's).
   Kolommen: vakantiegeld% · extra verlofdagen · extra feestdagen ·
   ADV dagen · ADV% · eindejaarsuitkering% · pensioen WG-extra% · IKB%.
   Wijzig alleen als Pronkert de brontool bijwerkt (zelfde regel als in de
   Excel: eerst controleren of de kostprijsfactor nog klopt). */
CRM.CAO_DATA = [
{naam:'Afbouw',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:10,advPct:3.85,eju:0,pensioenExtra:0.4282,ikb:0,info:'LET OP; extra verlof <18 jaar. Is niet meegenomen in deze tool'},
{naam:'Afbouw Natuursteen',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:6,advPct:2.31,eju:0,pensioenExtra:0.4282,ikb:0,info:'LET OP; extra verlof <18 jaar. Is niet meegenomen in deze tool'},
{naam:'Afbouw UTA',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:10,advPct:3.85,eju:0,pensioenExtra:0.4282,ikb:0,info:''},
{naam:'Bakkersbedrijf Industrieel',vakantiegeld:8,verlofdagen:0,feestdagen:4,advDagen:0,advPct:0,eju:0,pensioenExtra:0.53,ikb:0,info:''},
{naam:'Beroepsgoederenvervoer (TLN)',vakantiegeld:8,verlofdagen:-1,feestdagen:1,advDagen:3.5,advPct:1.35,eju:0,pensioenExtra:3.94,ikb:0,info:'PKB (IKB) is vrijwillig mogelijk, opdrachtgever kan dit zelf bepalen.'},
{naam:'Bouw & Infra',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:20,advPct:8,eju:0,pensioenExtra:0.4282,ikb:0,info:'LET OP; voor BBL geldt een schooldagbonus per leeftijd. Deze is niet meegenomen in deze tool'},
{naam:'Bouw & Infra UTA',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:17,advPct:6.8,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Branche cao Gemeenten',vakantiegeld:8,verlofdagen:3,feestdagen:2,advDagen:0,advPct:0,eju:7.55,pensioenExtra:3,ikb:1.5,info:'LET OP; vakantiegeld en EJU zit in het IKB. Deze worden door Pronkert als die looncomponenten gereserveerd en/of uitgekeerd per uur'},
{naam:'Drankindustrie en groothandel',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:13,advPct:5,eju:2,pensioenExtra:0.3075,ikb:0,info:''},
{naam:'Foodservice Groothandel Levensmiddelen',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:1.23,ikb:0,info:''},
{naam:'Gehandicaptenzorg (GHZ)',vakantiegeld:8,verlofdagen:2.92,feestdagen:2,advDagen:0,advPct:0,eju:8.33,pensioenExtra:0,ikb:0,info:''},
{naam:'Graanbe- en verwerkende bedrijven',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:0,pensioenExtra:4.37,ikb:0,info:''},
{naam:'Groen, Grond en Infrastructuur',vakantiegeld:8.33,verlofdagen:1,feestdagen:2,advDagen:13,advPct:6.5,eju:0,pensioenExtra:3.19,ikb:0,info:''},
{naam:'Groenten- en Fruitverwerkende Industrie',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:9.5,advPct:3.66,eju:4.5,pensioenExtra:3.19,ikb:0,info:''},
{naam:'Groothandel in bloemen en planten',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:1,pensioenExtra:0,ikb:0,info:''},
{naam:'Groothandel in groenten en fruit',vakantiegeld:8,verlofdagen:1,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Groothandel in textielgoederen',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:0,pensioenExtra:0.6,ikb:0,info:''},
{naam:'Handel in Bouwmaterialen',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:12,advPct:5.16,eju:0,pensioenExtra:1,ikb:0,info:''},
{naam:'Hellende daken',vakantiegeld:8,verlofdagen:-5,feestdagen:3,advDagen:10,advPct:4,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'HISWA Watersport',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Hoger Beroepsonderwijs',vakantiegeld:8,verlofdagen:5.2,feestdagen:2,advDagen:0,advPct:0,eju:8.3,pensioenExtra:3.07,ikb:0,info:'IKB in de vorm van uitruil mogelijk (vakantiegeld kan bijvoorbeeld omgezet worden in extra pensioenopbouw)'},
{naam:'Horeca- en aanverwante bedrijf',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Houtverwerkende industrie',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:15.5,advPct:5.97,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Hoveniersbedrijf in Nederland',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:0,pensioenExtra:3.19,ikb:0,info:''},
{naam:'Interieurbouw & Meubelindustrie 37,50 uur',vakantiegeld:8.33,verlofdagen:-1,feestdagen:4,advDagen:5,advPct:1.93,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Interieurbouw & Meubelindustrie 38,75 uur',vakantiegeld:8.33,verlofdagen:-1,feestdagen:4,advDagen:12,advPct:4.62,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Interieurbouw & Meubelindustrie 40 uur',vakantiegeld:8.33,verlofdagen:-1,feestdagen:4,advDagen:19,advPct:7.32,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Kinderopvang en centra, gastouderbureaus',vakantiegeld:8,verlofdagen:4.2,feestdagen:2,advDagen:0,advPct:0,eju:8,pensioenExtra:0,ikb:0,info:''},
{naam:'Kunststof- en rubber- en lijmindustrie',vakantiegeld:8,verlofdagen:-1,feestdagen:3,advDagen:0,advPct:0,eju:3,pensioenExtra:0.864,ikb:0,info:''},
{naam:'Levensmiddelenbedrijf (Supermarkt)',vakantiegeld:8,verlofdagen:-1,feestdagen:3,advDagen:19.5,advPct:8.1,eju:0,pensioenExtra:3.74,ikb:0,info:''},
{naam:'Metaal & Techniek 38 uur',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:0,pensioenExtra:1.8,ikb:0,info:''},
{naam:'Metaal & Techniek 40 uur',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:13,advPct:5.01,eju:0,pensioenExtra:1.8,ikb:0,info:''},
{naam:'Metalelektro',vakantiegeld:8,verlofdagen:2,feestdagen:1,advDagen:13,advPct:4.98,eju:0,pensioenExtra:1.19,ikb:0,info:''},
{naam:'Mode-, Interieur-, Tapijt- en Textielindustrie',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:1.7,ikb:0,info:''},
{naam:'Motorvoertuigen- en tweewielerbedrijf 38 uur',vakantiegeld:8,verlofdagen:0,feestdagen:2,advDagen:0,advPct:0,eju:0,pensioenExtra:1.8,ikb:0,info:''},
{naam:'Motorvoertuigen- en tweewielerbedrijf 40 uur',vakantiegeld:8,verlofdagen:0,feestdagen:2,advDagen:13,advPct:5.01,eju:0,pensioenExtra:1.8,ikb:0,info:''},
{naam:'Nederlandse Horeca Gilde',vakantiegeld:8,verlofdagen:0,feestdagen:0,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:'Bron onvolledig bij Pronkert (alleen vakantiegeld ingevuld) — vraag actuele cijfers na voor gebruik.'},
{naam:'Nederlandse Universtiteiten',vakantiegeld:8,verlofdagen:4,feestdagen:5,advDagen:0,advPct:0,eju:8.3,pensioenExtra:3.07,ikb:0,info:'IKB in de vorm van uitruil mogelijk (vakantiegeld kan bijvoorbeeld omgezet worden in extra pensioenopbouw)'},
{naam:'Open Teelten',vakantiegeld:8.25,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:0,pensioenExtra:3.19,ikb:0,info:''},
{naam:'Partikuliere kaaspakhuisbedrijf',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:2.66,ikb:0,info:''},
{naam:'Primair Onderwijs',vakantiegeld:8,verlofdagen:33.5,feestdagen:2,advDagen:0,advPct:0,eju:8.33,pensioenExtra:3.07,ikb:0,info:''},
{naam:'Recreatie',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Retail Non-food',vakantiegeld:8,verlofdagen:-1,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:2.6625,ikb:0,info:''},
{naam:'Retail Non-food Tuincentra 40 uur',vakantiegeld:8,verlofdagen:-1,feestdagen:3,advDagen:13,advPct:5.01,eju:0,pensioenExtra:2.6625,ikb:0,info:''},
{naam:'Rijk CAO',vakantiegeld:8,verlofdagen:4,feestdagen:4,advDagen:0,advPct:0,eju:8.3,pensioenExtra:3.07,ikb:0.2,info:''},
{naam:'Schilders-, Afwerkings-, Vastgoedonderhouds- en Glaszetbedrijf',vakantiegeld:8,verlofdagen:0,feestdagen:4,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:'Recht op 4 betaalde scholingsdagen. Indien dit niet geregeld is, dan recht op eigen cursus. Cursus- en verletkosten zijn dan voor rekening van de inlener'},
{naam:'Schoonmaak- en Glazenwassersbedrijf',vakantiegeld:8,verlofdagen:1,feestdagen:3,advDagen:0,advPct:0,eju:5,pensioenExtra:0,ikb:0,info:''},
{naam:'Technische Groothandel',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Textielverzorging',vakantiegeld:8.25,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:5.33,pensioenExtra:1.7,ikb:0,info:''},
{naam:'Timmerindustrie',vakantiegeld:8.25,verlofdagen:7,feestdagen:1,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Uitgeverijbedrijf',vakantiegeld:8,verlofdagen:-1,feestdagen:4,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:2.4,info:'LET OP; vakantiegeld en bovenwettelijk verlof zit in het IKB. Deze worden door Pronkert als die looncomponenten gereserveerd en/of uitgekeerd per uur'},
{naam:'UMC',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:0,advPct:0,eju:8.3,pensioenExtra:3,ikb:0,info:'IKB in de vorm van uitruil mogelijk (vakantiegeld kan bijvoorbeeld omgezet worden in extra pensioenopbouw)'},
{naam:'Verpleeg- Verzorgingshuizen en Thuiszorg en Jeugdgezondheidszorg',vakantiegeld:8,verlofdagen:8,feestdagen:4,advDagen:0,advPct:0,eju:8.33,pensioenExtra:0,ikb:0,info:''},
{naam:'Vlakglas glasbewerkings glazeniersbedrijf',vakantiegeld:8,verlofdagen:0,feestdagen:1,advDagen:13,advPct:5.01,eju:0,pensioenExtra:0,ikb:0,info:''},
{naam:'Vleessector',vakantiegeld:8,verlofdagen:-1,feestdagen:1,advDagen:0,advPct:0,eju:2,pensioenExtra:0,ikb:0,info:''},
{naam:'Vleeswarenindustrie',vakantiegeld:8,verlofdagen:-1,feestdagen:1,advDagen:0,advPct:0,eju:3.25,pensioenExtra:3.84,ikb:0,info:''},
{naam:'Voortgezet Onderwijs',vakantiegeld:8,verlofdagen:35.5,feestdagen:2,advDagen:0,advPct:0,eju:8.33,pensioenExtra:3.07,ikb:0,info:''},
{naam:'Ziekenhuizen',vakantiegeld:8.33,verlofdagen:2.92,feestdagen:4,advDagen:0,advPct:0,eju:8.33,pensioenExtra:0,ikb:0,info:'20 verlofdagen + 57 PLB uren op basis van FT'},
{naam:'Zwembaden',vakantiegeld:8,verlofdagen:0,feestdagen:3,advDagen:0,advPct:0,eju:0,pensioenExtra:0,ikb:0,info:''}
];

/* B&I-CAO's krijgen bovenop EJU/pensioen/IKB nog drie fondsafdrachten
   (duurzame inzetbaarheid 4,51% / O&O 1,5% / kort verzuim 1,19%) — in de
   brontool alleen voor deze twee namen (C29/C30/C31 in beide tabbladen). */
CRM.CAO_BI = ['Bouw & Infra', 'Bouw & Infra UTA'];

/* Voorkeurslijst voor de CAO-suggestie: branches waar Ploeggenoten
   voornamelijk in zit (productie, logistiek, industrie). Deze komen
   bovenaan te staan; de rest van CRM.CAO_DATA blijft gewoon doorzoekbaar
   voor de uitzondering. */
CRM.CAO_PRIORITEIT = [
  'Metaal & Techniek 38 uur','Metaal & Techniek 40 uur','Metalelektro',
  'Beroepsgoederenvervoer (TLN)','Kunststof- en rubber- en lijmindustrie',
  'Technische Groothandel','Handel in Bouwmaterialen',
  'Groenten- en Fruitverwerkende Industrie','Graanbe- en verwerkende bedrijven',
  'Vleessector','Vleeswarenindustrie','Houtverwerkende industrie',
  'Bouw & Infra','Bouw & Infra UTA','Drankindustrie en groothandel',
  'Foodservice Groothandel Levensmiddelen','Levensmiddelenbedrijf (Supermarkt)',
  'Groothandel in groenten en fruit','Groothandel in bloemen en planten',
  'Groothandel in textielgoederen','Mode-, Interieur-, Tapijt- en Textielindustrie',
  'Interieurbouw & Meubelindustrie 37,50 uur','Interieurbouw & Meubelindustrie 38,75 uur',
  'Interieurbouw & Meubelindustrie 40 uur','Timmerindustrie',
  'Vlakglas glasbewerkings glazeniersbedrijf',
  'Motorvoertuigen- en tweewielerbedrijf 38 uur','Motorvoertuigen- en tweewielerbedrijf 40 uur',
  'Hellende daken','Schilders-, Afwerkings-, Vastgoedonderhouds- en Glaszetbedrijf',
  'Groen, Grond en Infrastructuur','Hoveniersbedrijf in Nederland',
  'Partikuliere kaaspakhuisbedrijf','Textielverzorging'
];

CRM.caoBijNaam = naam => CRM.CAO_DATA.find(c => c.naam === naam) || null;

/* Zoekt CAO's op (deel van) naam; voorkeurslijst eerst. Lege zoekterm geeft
   de voorkeurslijst als startpunt (i.p.v. alle 59 in willekeurige volgorde). */
CRM.caoZoek = (zoekterm) => {
  const q = String(zoekterm || '').trim().toLowerCase();
  const inPrio = n => CRM.CAO_PRIORITEIT.includes(n);
  if(!q) return CRM.CAO_DATA.filter(c => inPrio(c.naam));
  const treffers = CRM.CAO_DATA.filter(c => c.naam.toLowerCase().includes(q));
  return treffers.sort((a,b) => (inPrio(b.naam)?1:0) - (inPrio(a.naam)?1:0));
};

/* Kostprijsfactor + verkoopfactor-voorstel, exact zoals tabblad
   'Kostprijsfactor - uitbetalen' — geverifieerd tegen het voorbeeld in de
   sheet (Ziekenhuizen · NBBU Fase 1/2 · €20/u): Factor Pronkert 1,81752,
   extra kosten €2,5823/u. Zie ook: extra verlofdagen >20 wordt (net als op
   tabblad 'reserveren') gelezen als tot-en-met-25 i.p.v. als zuivere
   'extra' dagen — de uitbetalen-tab in de brontool mist die correctie,
   wat voor twee onderwijs-CAO's een veel te hoge factor zou geven. Raakt
   geen van onze eigen branches (allemaal ruim onder de grens van 20). */
CRM.kostprijsfactor = (caoNaam, faseNaam, uurloon) => {
  const cao = CRM.caoBijNaam(caoNaam);
  const fase = CRM.CONTRACTFASE.find(f => f.naam === faseNaam);
  uurloon = Number(uurloon);
  if(!cao || !fase || !uurloon || uurloon <= 0) return null;

  const vakantiegeldFactor = cao.vakantiegeld === 8.25 ? 0.004 : cao.vakantiegeld === 8.33 ? 0.006 : 0;
  const verlofdagenNetto = cao.verlofdagen > 20 ? Math.max(0, cao.verlofdagen - 25) : cao.verlofdagen;
  const verlofFactor = 0.006 * verlofdagenNetto;
  const feestFactor = 0.006 * cao.feestdagen;
  const extraFactor = vakantiegeldFactor + verlofFactor + feestFactor;
  const factorPronkert = fase.basisfactor + extraFactor;

  const opslag = 1.55; /* vaste Pronkert-opslag op EJU/pensioen/IKB/B&I-fondsen */
  let extraKostenPerUur = opslag * (uurloon/100) * (cao.eju + cao.pensioenExtra + cao.ikb);
  const isBI = CRM.CAO_BI.includes(caoNaam);
  if(isBI) extraKostenPerUur += opslag * (uurloon/100) * (4.51 + 1.5 + 1.19); /* DI + O&O + kort verzuim */

  const kostprijsfactor = factorPronkert + (extraKostenPerUur / uurloon);
  const margeFactor = 0.6; /* vaste afspraak Tjeerd, 11 aug 2026 */
  const verkoopfactorVoorstel = kostprijsfactor + margeFactor;

  return {
    cao: caoNaam, fase: faseNaam, uurloon,
    basisfactor: fase.basisfactor, extraFactor, factorPronkert,
    extraKostenPerUur, kostprijsfactor, margeFactor, verkoopfactorVoorstel,
    tariefKostprijs: uurloon * kostprijsfactor,
    margeEurPerUur: margeFactor * uurloon
  };
};
