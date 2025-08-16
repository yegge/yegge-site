import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

async function submitForm(table, data){
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
function serialize(form){
  const d = Object.fromEntries(new FormData(form).entries());
  for (const el of form.querySelectorAll('input[type="checkbox"]')) d[el.name] = el.checked;
  return d;
}
function hook(id, table, onDone){
  const form = document.getElementById(id);
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = serialize(form);
    form.querySelector('button, input[type=submit]').disabled = true;
    try{ await submitForm(table, data); onDone && onDone(); }
    catch(err){ alert('Submission failed. Check config.js and RLS.\n'+err.message); }
    finally{ form.querySelector('button, input[type=submit]').disabled = false; }
  });
}
window.addEventListener('DOMContentLoaded', ()=>{
  hook('subscribe-form', 'subscriptions', ()=>{
    document.getElementById('subscribe-success').classList.remove('hidden');
    document.getElementById('subscribe-form').reset();
  });
  hook('inquiry-form', 'inquiries', ()=>{
    document.getElementById('inquiry-success').classList.remove('hidden');
    document.getElementById('inquiry-form').reset();
  });
});