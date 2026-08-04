const $ = (id) => document.getElementById(id);
const melden = (t, s) => { const m = $('melding'); m.textContent = t || ''; m.className = 'melding ' + (s || ''); };

function toon(ingelogd, email) {
  $('uitgelogd').classList.toggle('verborgen', ingelogd);
  $('ingelogd').classList.toggle('verborgen', !ingelogd);
  if (ingelogd) $('wie').textContent = email || '';
}

const STD_SJABLOON = 'Hoi {voornaam}, leuk je profiel als {functie} bij {bedrijf} te zien. Ik help productie- en logistiekbedrijven aan goed personeel — maak graag kennis. Groet, {mij}';

async function laadInstel() {
  const o = await chrome.storage.local.get('pg_instel');
  const i = (o && o.pg_instel) || {};
  $('s_naam').value = i.naam || '';
  $('s_sjabloon').value = i.sjabloon || STD_SJABLOON;
}

$('s_bewaar').addEventListener('click', async () => {
  const instel = { naam: $('s_naam').value.trim(), sjabloon: $('s_sjabloon').value.trim() || STD_SJABLOON };
  await chrome.storage.local.set({ pg_instel: instel });
  melden('Instellingen bewaard ✓', 'ok');
});

async function verversStatus() {
  const s = await chrome.runtime.sendMessage({ action: 'status' });
  toon(!!s.ingelogd, s.email);
  if (s.ingelogd) laadInstel();
}

$('login').addEventListener('click', async () => {
  const email = $('email').value.trim(), pw = $('pw').value;
  if (!email || !pw) { melden('Vul e-mail en wachtwoord in.', 'err'); return; }
  $('login').disabled = true; melden('Inloggen…');
  const res = await chrome.runtime.sendMessage({ action: 'login', email, wachtwoord: pw });
  $('login').disabled = false;
  if (res.ok) { $('pw').value = ''; melden('Ingelogd ✓', 'ok'); toon(true, res.email); laadInstel(); }
  else melden(res.error || 'Inloggen mislukt', 'err');
});

$('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login').click(); });

// Injecteert het lees-paneel in de pagina die je open hebt staan.
// Bewust op jouw klik: zo staat er geen knop op élke website die je bezoekt.
$('lees').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) { melden('Geen actieve pagina gevonden.', 'err'); return; }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    window.close();                       // paneel opent zich in de pagina zelf
  } catch (e) {
    // Chrome blokkeert injectie op chrome://-pagina's, de Web Store en PDF-viewers.
    melden('Kan deze pagina niet uitlezen (' + (e.message || 'geblokkeerd door Chrome') + ').', 'err');
  }
});

$('logout').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'logout' });
  melden('Uitgelogd.', 'ok'); toon(false);
});

verversStatus();
