import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

async function sbFetch(path, opts={}){
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(opts.headers||{})
  };
  const res = await fetch(url, { ...opts, headers });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// host → album_artist filter
function hostToAlbumArtist(){
  const h = location.hostname.toLowerCase();
  if (h.includes('angershade')) return 'Angershade';
  if (h.includes('thecorruptive')) return 'The Corruptive';
  return null; // yegge.com shows all
}

function renderLinks(jsonStr, label){
  try{
    const links = JSON.parse(jsonStr||'[]');
    if(!Array.isArray(links) || links.length===0) return '';
    return `<div>${label}: `+links.map(l=>`<a href="${l.url}" target="_blank" rel="noopener">${l.name}</a>`).join(' · ') + `</div>`;
  }catch{ return ''; }
}

async function loadAlbums(){
  const artist = hostToAlbumArtist();
  const select = 'id,album_name,album_type,album_artist,catalog_roman,release_date,art_front,art_back,art_sleeve,art_sticker,distributor,label,stream_links,purchase_links,album_commentary';
  let path = `albums?select=${encodeURIComponent(select)}&visibility=eq.PUBLIC&order=release_date.desc`;
  if (artist) path += `&album_artist=eq.${encodeURIComponent(artist)}`;

  const albums = await sbFetch(path);
  const list = document.getElementById('album-list');
  list.innerHTML = '';
  for (const a of albums){
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="grid cols-2">
        <div>
          <img class="album-cover" src="${a.art_front||''}" alt="${a.album_name||''} cover">
          <div class="thumbs">
            ${[a.art_front,a.art_back,a.art_sleeve,a.art_sticker].filter(Boolean).map(u=>`<img src="${u}" alt="thumb">`).join('')}
          </div>
        </div>
        <div>
          <h2>${a.album_name||''}</h2>
          <p class="muted">${a.album_artist||''} · ${a.album_type||''} · ${a.catalog_roman||''}</p>
          <p class="muted">Released: ${a.release_date||''}</p>
          <div class="mt-2">${a.album_commentary||''}</div>
          <div class="mt-4">
            ${renderLinks(a.stream_links, 'Stream')}
            ${renderLinks(a.purchase_links, 'Purchase')}
          </div>
          <div class="mt-4">
            <button class="btn outline" data-album="${a.id}">View Tracks</button>
          </div>
        </div>
      </div>`;
    list.appendChild(card);
  }
  list.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-album]');
    if(!btn) return;
    await loadTracks(parseInt(btn.dataset.album,10));
  });
}

async function loadTracks(albumId){
  const select = 'id,track_no,track_name,artist_names,composer_names,key_contributors,stage,stage_date,duration,stream_embed,purchase_url,track_commentary';
  const path = `tracks?select=${encodeURIComponent(select)}&album_id=eq.${albumId}&visibility=eq.PUBLIC&order=track_no.asc`;
  const tracks = await sbFetch(path);
  const modal = document.getElementById('tracks-modal');
  modal.querySelector('.content').innerHTML = tracks.map(t=>`
    <div class="card mb-2">
      <strong>${t.track_no||''}. ${t.track_name||''}</strong>
      <div class="muted">Duration: ${t.duration||''} · Stage: ${t.stage||''} (${t.stage_date||''})</div>
      <div class="mt-2">${t.stream_embed ? t.stream_embed : '<div class="overlay" style="height:56px"></div>'}</div>
      <div class="mt-2">${t.track_commentary||''}</div>
      ${t.purchase_url ? `<div class="mt-2"><a class="btn" href="${t.purchase_url}" target="_blank" rel="noopener">Buy Download</a></div>` : ''}
    </div>`).join('') || '<p class="muted">No tracks yet.</p>';
  modal.classList.remove('hidden');
}

function closeModal(){ document.getElementById('tracks-modal').classList.add('hidden'); }

window.addEventListener('DOMContentLoaded', ()=>{
  const close = document.querySelector('#tracks-modal .close');
  if(close) close.addEventListener('click', closeModal);
  loadAlbums().catch(err=>{
    console.error(err);
    document.getElementById('album-list').innerHTML = '<p class="muted">Failed to load catalog. Configure Supabase in /assets/js/config.js</p>';
  });
});