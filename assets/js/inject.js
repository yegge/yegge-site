// /assets/js/inject.js
async function inject(partial, targetId){
  try{
    const res = await fetch(`/assets/${partial}.html`);
    const html = await res.text();
    document.getElementById(targetId).innerHTML = html;
  }catch(e){ console.error('inject failed', partial, e); }
}
document.addEventListener('DOMContentLoaded', ()=>{
  if(document.getElementById('site-header')) inject('header', 'site-header');
  if(document.getElementById('site-footer')) inject('footer', 'site-footer');
});