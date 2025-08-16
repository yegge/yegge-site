import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginPanel = document.getElementById('login-panel');
const appPanel   = document.getElementById('app');
const whoami     = document.getElementById('whoami');

async function gate(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    loginPanel.classList.add('hidden');
    appPanel.classList.remove('hidden');
    whoami.textContent = session.user?.email || '';
  }else{
    appPanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
  }
}

document.getElementById('login-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get('email'); const password = fd.get('password');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if(error) return alert(error.message);
  gate();
});

document.getElementById('signout')?.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

gate();
