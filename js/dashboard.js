/* MODULE: Dashboard — wordt in fase 1 gebouwd. */
CRM.registerModule('dashboard', {
  title:'Dashboard', icon:'◧', onderschrift:'Overzicht van vandaag',
  render(mount){
    mount.innerHTML = CRM.ui.leeg('Dashboard wordt gebouwd', 'Deze module staat klaar in het fundament en wordt nu ingevuld.');
  }
});
