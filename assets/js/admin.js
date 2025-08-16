// /assets/js/admin.js
// Purpose: Secure, zero-backend admin UI on Cloudflare Pages.
// Service used: Supabase (Auth + PostgREST + RLS). The anon key is public-safe;
// RLS + Auth is what enforces permissions.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- Auth gate ---------------- */
const loginPanel = document.getElementById('login-panel');
const appPanel   = document.getElementById('app');
const whoami     = document.getElementById('whoami');

async function gate() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    loginPanel?.classList.add('hidden');
    appPanel?.classList.remove('hidden');
    whoami.textContent = session.user?.email || '';
    await initApp();
  } else {
    appPanel?.classList.add('hidden');
    loginPanel?.classList.remove('hidden');
  }
}

document.getElementById('login-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get('email'); const password = fd.get('password');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  gate();
});

document.getElementById('signout')?.addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

sb.auth.onAuthStateChange(()=>{/* optional hook */});

/* ---------------- Tabs ---------------- */
const tabs = document.querySelectorAll('.tabs button');
const panels = {
  catalog: document.getElementById('tab-catalog'),
  blog: document.getElementById('tab-blog'),
  submissions: document.getElementById('tab-submissions')
};
tabs.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(panels).forEach(p=>p.classList.add('hidden'));
    panels[btn.dataset.tab].classList.remove('hidden');
  });
});

/* ---------------- Catalog: albums & tracks ---------------- */
const albumsTable = document.querySelector('#albums-table tbody');
const albumForm   = document.getElementById('album-form');
const albumFormTitle = document.getElementById('album-form-title');
const newAlbumBtn = document.getElementById('new-album');
const deleteAlbumBtn = document.getElementById('delete-album');

const tracksFor  = document.getElementById('tracks-for');
const tracksTable = document.querySelector('#tracks-table tbody');
const trackForm   = document.getElementById('track-form');
const deleteTrackBtn = document.getElementById('delete-track');

let currentAlbum = null;

function jparse(v, fallback){ try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function jstring(v){ try { return JSON.stringify(v ?? [], null, 0); } catch { return '[]'; } }

async function loadAlbums(){
  const { data, error } = await sb
    .from('albums')
    .select('*')
    .order('release_date', { ascending: false, nullsFirst: true });
  if (error) { console.error(error); return; }
  albumsTable.innerHTML = (data||[]).map(a=>`
    <tr data-id="${a.id}">
      <td>${a.album_artist||''}</td>
      <td>${a.album_name||''}</td>
      <td>${a.album_type||''}</td>
      <td>${a.visibility||''}</td>
      <td>${a.release_date||''}</td>
      <td><button class="btn outline edit-album">Edit</button></td>
    </tr>
  `).join('');
}

function fillAlbumForm(a){
  albumFormTitle.textContent = a?.id ? `Edit Album #${a.id}` : 'New Album';
  albumForm.id.value = a?.id || '';
  albumForm.album_artist.value = a?.album_artist || '';
  albumForm.album_name.value = a?.album_name || '';
  albumForm.album_type.value = a?.album_type || 'LP';
  albumForm.catalog_no.value = a?.catalog_no || '';
  albumForm.catalog_roman.value = a?.catalog_roman || '';
  albumForm.visibility.value = a?.visibility || 'PUBLIC';
  albumForm.release_date.value = a?.release_date || '';
  albumForm.physical_release_date.value = a?.physical_release_date || '';
  albumForm.album_status.value = a?.album_status || 'In Development';
  albumForm.art_front.value = a?.art_front || '';
  albumForm.art_back.value = a?.art_back || '';
  albumForm.art_sleeve.value = a?.art_sleeve || '';
  albumForm.art_sticker.value = a?.art_sticker || '';
  albumForm.stream_links.value = jstring(a?.stream_links);
  albumForm.purchase_links.value = jstring(a?.purchase_links);
  albumForm.distributor.value = a?.distributor || '';
  albumForm.label.value = a?.label || '';
  albumForm.album_commentary.value = a?.album_commentary || '';

  currentAlbum = a || null;
  tracksFor.textContent = a?.album_name ? `${a.album_name} (#${a.id})` : '[select an album]';
  loadTracks(a?.id);
}

albumsTable?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.edit-album'); if(!btn) return;
  const tr = btn.closest('tr'); const id = tr.dataset.id;
  const { data, error } = await sb.from('albums').select('*').eq('id', id).single();
  if (error) return alert(error.message);
  fillAlbumForm(data);
});

newAlbumBtn?.addEventListener('click', ()=> fillAlbumForm(null));

albumForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(albumForm);
  const payload = Object.fromEntries(fd.entries());
  payload.stream_links = jparse(payload.stream_links, []);
  payload.purchase_links = jparse(payload.purchase_links, []);
  for (const k of ['release_date','physical_release_date']) if (!payload[k]) payload[k] = null;

  let resp;
  if (payload.id) {
    const id = payload.id; delete payload.id;
    resp = await sb.from('albums').update(payload).eq('id', id).select().single();
  } else {
    resp = await sb.from('albums').insert(payload).select().single();
  }
  if (resp.error) return alert(resp.error.message);
  await loadAlbums();
  fillAlbumForm(resp.data);
});

deleteAlbumBtn?.addEventListener('click', async ()=>{
  const id = albumForm.id.value;
  if (!id) return alert('No album selected.');
  if (!confirm('Delete this album and its tracks?')) return;
  const { error } = await sb.from('albums').delete().eq('id', id);
  if (error) return alert(error.message);
  await loadAlbums();
  fillAlbumForm(null);
  tracksTable.innerHTML = '';
});

async function loadTracks(albumId){
  if (!albumId) { tracksTable.innerHTML = ''; return; }
  const { data, error } = await sb
    .from('tracks')
    .select('*')
    .eq('album_id', albumId)
    .order('track_no', { ascending: true, nullsFirst: true });
  if (error) { console.error(error); return; }
  tracksTable.innerHTML = (data||[]).map(t=>`
    <tr data-id="${t.id}">
      <td>${t.track_no ?? ''}</td>
      <td>${t.track_name ?? ''}</td>
      <td>${t.track_status ?? ''}</td>
      <td>${t.stage ?? ''}</td>
      <td>${t.duration ?? ''}</td>
      <td><button class="btn outline edit-track">Edit</button></td>
    </tr>
  `).join('');
}

tracksTable?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.edit-track'); if(!btn) return;
  const tr = btn.closest('tr'); const id = tr.dataset.id;
  const { data, error } = await sb.from('tracks').select('*').eq('id', id).single();
  if (error) return alert(error.message);
  fillTrackForm(data);
});

function fillTrackForm(t){
  trackForm.id.value = t?.id || '';
  trackForm.album_id.value = t?.album_id || (currentAlbum?.id || '');
  trackForm.track_no.value = t?.track_no ?? '';
  trackForm.track_name.value = t?.track_name ?? '';
  trackForm.track_status.value = t?.track_status ?? 'WIP';
  trackForm.stage.value = t?.stage ?? 'CONCEPTION';
  trackForm.duration.value = t?.duration ?? '';
  trackForm.stream_embed.value = t?.stream_embed ?? '';
  trackForm.purchase_url.value = t?.purchase_url ?? '';
  trackForm.track_commentary.value = t?.track_commentary ?? '';
}

trackForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(trackForm);
  const payload = Object.fromEntries(fd.entries());
  if (payload.track_no) payload.track_no = parseInt(payload.track_no, 10);
  ['album_id','purchase_url','stream_embed','duration','track_commentary'].forEach(k=>{
    if (payload[k] === '') payload[k] = null;
  });

  let resp;
  if (payload.id) {
    const id = payload.id; delete payload.id;
    resp = await sb.from('tracks').update(payload).eq('id', id).select().single();
  } else {
    if (!payload.album_id) return alert('Select an album first.');
    resp = await sb.from('tracks').insert(payload).select().single();
  }
  if (resp.error) return alert(resp.error.message);
  await loadTracks(resp.data.album_id);
  fillTrackForm(null);
});

deleteTrackBtn?.addEventListener('click', async ()=>{
  const id = trackForm.id.value;
  if (!id) return alert('No track selected.');
  if (!confirm('Delete this track?')) return;
  const { data, error } = await sb.from('tracks').delete().eq('id', id).select().single();
  if (error) return alert(error.message);
  await loadTracks(data.album_id);
  fillTrackForm(null);
});

/* ---------------- Blog posts ---------------- */
const postsTable = document.querySelector('#posts-table tbody');
const postForm   = document.getElementById('post-form');
const postFormTitle = document.getElementById('post-form-title');
const newPostBtn = document.getElementById('new-post');
const deletePostBtn = document.getElementById('delete-post');

function fillPostForm(p){
  postFormTitle.textContent = p?.id ? `Edit Post #${p.id}` : 'New Post';
  postForm.id.value = p?.id || '';
  postForm.slug.value = p?.slug || '';
  postForm.title.value = p?.title || '';
  postForm.author.value = p?.author || 'Brian Yegge';
  postForm.category.value = p?.category || 'Yegge';
  postForm.tags.value = (p?.tags || []).join(', ');
  postForm.draft.checked = p?.draft ?? true;
  postForm.publish_at.value = p?.publish_at ? toLocalInput(p.publish_at) : '';
  postForm.body_md.value = p?.body_md || '';
  postForm.body_html.value = p?.body_html || '';
}

function toLocalInput(iso){
  const d = new Date(iso);
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadPosts(){
  const { data, error } = await sb
    .from('blog_posts')
    .select('*')
    .order('publish_at', { ascending:false, nullsFirst:true });
  if (error) { console.error(error); return; }
  postsTable.innerHTML = (data||[]).map(p=>`
    <tr data-id="${p.id}">
      <td>${p.title||''}</td>
      <td>${p.category||''}</td>
      <td>${p.draft ? 'yes' : 'no'}</td>
      <td>${p.publish_at ? new Date(p.publish_at).toLocaleString() : ''}</td>
      <td><button class="btn outline edit-post">Edit</button></td>
    </tr>
  `).join('');
}

postsTable?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.edit-post'); if(!btn) return;
  const tr = btn.closest('tr'); const id = tr.dataset.id;
  const { data, error } = await sb.from('blog_posts').select('*').eq('id', id).single();
  if (error) return alert(error.message);
  fillPostForm(data);
});

newPostBtn?.addEventListener('click', ()=> fillPostForm(null));

postForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(postForm);
  const payload = Object.fromEntries(fd.entries());
  payload.tags = (payload.tags || '').split(',').map(s=>s.trim()).filter(Boolean);
  payload.draft = postForm.draft.checked;
  payload.publish_at = payload.publish_at ? new Date(payload.publish_at).toISOString() : null;

  let resp;
  if (payload.id) {
    const id = payload.id; delete payload.id;
    resp = await sb.from('blog_posts').update(payload).eq('id', id).select().single();
  } else {
    resp = await sb.from('blog_posts').insert(payload).select().single();
  }
  if (resp.error) return alert(resp.error.message);
  await loadPosts();
  fillPostForm(resp.data);
});

deletePostBtn?.addEventListener('click', async ()=>{
  const id = postForm.id.value;
  if (!id) return alert('No post selected.');
  if (!confirm('Delete this post?')) return;
  const { error } = await sb.from('blog_posts').delete().eq('id', id);
  if (error) return alert(error.message);
  await loadPosts();
  fillPostForm(null);
});

/* ---------------- Submissions (read-only) ---------------- */
const subsTable = document.querySelector('#subs-table tbody');
const inqTable  = document.querySelector('#inq-table tbody');

async function loadSubs(){
  const { data, error } = await sb
    .from('subscriptions')
    .select('first_name,last_name,email,country,created_at')
    .order('created_at', { ascending:false });
  if (error) { console.error(error); return; }
  subsTable.innerHTML = (data||[]).map(r=>`
    <tr>
      <td>${[r.first_name,r.last_name].filter(Boolean).join(' ')}</td>
      <td>${r.email||''}</td>
      <td>${r.country||''}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

async function loadInquiries(){
  const { data, error } = await sb
    .from('inquiries')
    .select('first_name,last_name,email,messenger,created_at')
    .order('created_at', { ascending:false });
  if (error) { console.error(error); return; }
  inqTable.innerHTML = (data||[]).map(r=>`
    <tr>
      <td>${[r.first_name,r.last_name].filter(Boolean).join(' ')}</td>
      <td>${r.email||''}</td>
      <td>${r.messenger||''}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

/* ---------------- Init after login ---------------- */
async function initApp(){
  await loadAlbums();
  fillAlbumForm(null);
  await loadPosts();
  await loadSubs();
  await loadInquiries();
}

/* ---------------- Boot ---------------- */
gate().catch(console.error);