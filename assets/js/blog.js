// /assets/js/blog.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const api = (path, opts={}) => {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(opts.headers||{})
  };
  return fetch(url, { ...opts, headers });
};

function qs(obj){
  // Build PostgREST query string
  return Object.entries(obj).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/** List posts with filters & pagination */
export async function fetchPosts({ category='', tag='', q='', limit=9, offset=0 }={}){
  const select = 'id,slug,title,author,category,tags,publish_at';
  const params = {
    select,
    order: 'publish_at.desc,nullslast',
    limit,
    offset
  };

  // Category filter
  if (category) params['category'] = `eq.${category}`;

  // Tag filter (array contains)
  if (tag) params['tags'] = `cs.{${tag}}`;

  // Text search (title or body)
  // Using ilike for simplicity; fast enough for a small blog; upgrade to FTS later if needed.
  if (q) {
    params['or'] = `title.ilike.*${q}*,body_md.ilike.*${q}*`;
  }

  const res = await api(`blog_posts?${qs(params)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Fetch a single post by slug */
export async function fetchPost(slug){
  const select = 'id,slug,title,author,category,tags,publish_at,body_html,body_md';
  const res = await api(`blog_posts?slug=eq.${encodeURIComponent(slug)}&select=${encodeURIComponent(select)}&limit=1`);
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

/* ---------- Page bootstraps ---------- */
if (location.pathname.endsWith('/blog/index.html') || location.pathname.endsWith('/blog/')) {
  const pills = document.querySelectorAll('.pill');
  const list = document.getElementById('blog-list');
  const q = document.getElementById('q');
  const tag = document.getElementById('tag');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const pageEl = document.getElementById('page');

  let category = '';
  let page = 1;
  const pageSize = 9;
  let currentCount = 0;

  function render(posts){
    list.innerHTML = posts.map(p=>`
      <article class="card">
        <h3 style="margin-top:0"><a href="/blog/post.html?slug=${encodeURIComponent(p.slug)}">${p.title}</a></h3>
        <p class="muted">${p.category || ''} · ${p.publish_at ? new Date(p.publish_at).toLocaleDateString() : ''}</p>
      </article>
    `).join('') || '<p class="muted">No posts found.</p>';
  }

  async function load(){
    const posts = await fetchPosts({
      category,
      tag: tag.value.trim(),
      q: q.value.trim(),
      limit: pageSize,
      offset: (page-1)*pageSize
    });
    currentCount = posts.length;
    pageEl.textContent = `Page ${page}`;
    prev.disabled = page === 1;
    next.disabled = currentCount < pageSize;
    render(posts);
  }

  // Category pills
  pills.forEach(el=>{
    el.addEventListener('click', ()=>{
      pills.forEach(p=>p.classList.remove('active'));
      el.classList.add('active');
      category = el.dataset.cat || '';
      page = 1;
      load().catch(console.error);
    });
  });

  // Search & tag typing debounce
  let tmr;
  function onFilterInput(){
    clearTimeout(tmr);
    tmr = setTimeout(()=>{ page=1; load().catch(console.error); }, 250);
  }
  q.addEventListener('input', onFilterInput);
  tag.addEventListener('input', onFilterInput);

  // Pagination
  prev.addEventListener('click', ()=>{ if(page>1){ page--; load().catch(console.error);} });
  next.addEventListener('click', ()=>{ if(currentCount===pageSize){ page++; load().catch(console.error);} });

  load().catch(err=>{
    console.error(err);
    list.innerHTML = '<p class="muted">Failed to load posts. Check /assets/js/config.js</p>';
  });
}

if (location.pathname.endsWith('/blog/post.html')) {
  const bodyEl = document.getElementById('body');
  const titleEl = document.getElementById('title');
  const metaEl = document.getElementById('meta');

  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');

  (async ()=>{
    if(!slug){
      bodyEl.innerHTML = '<p class="muted">Missing slug.</p>';
      return;
    }
    try{
      const post = await fetchPost(slug);
      if(!post){
        bodyEl.innerHTML = '<p class="muted">Post not found.</p>';
        return;
      }
      titleEl.textContent = post.title;
      const date = post.publish_at ? new Date(post.publish_at).toLocaleDateString() : '';
      metaEl.textContent = [post.category||'', date, post.author||''].filter(Boolean).join(' · ');

      if (post.body_html && post.body_html.trim()) {
        bodyEl.innerHTML = post.body_html;
      } else if (post.body_md && post.body_md.trim()) {
        // marked is globally available from the CDN script tag
        bodyEl.innerHTML = window.marked.parse(post.body_md);
      } else {
        bodyEl.innerHTML = '<p class="muted">This post has no content.</p>';
      }
    }catch(err){
      console.error(err);
      bodyEl.innerHTML = '<p class="muted">Failed to load post. Check /assets/js/config.js</p>';
    }
  })();
}