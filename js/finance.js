/* MODULE: Finance — alleen zichtbaar voor Tjeerd (adminOnly).
   De harde beveiliging zit in Supabase RLS op de fin_*-tabellen. */
CRM.registerModule('finance', {
  title:'Finance', icon:'€', onderschrift:'Cashflow, facturatie en advies', adminOnly:true,
  render(mount){
    mount.innerHTML = CRM.ui.leeg('Finance wordt gebouwd', 'Alleen jij ziet deze module. Het team kan er ook technisch niet bij.');
  }
});
