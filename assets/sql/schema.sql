---- NEW WEBSITE — Supabase/Postgres schema
-- Purpose:
-- - Real relational catalog (albums ↔ tracks) with PUBLIC/VIP/ADMIN visibility
-- - Client-only static site reads PUBLIC via RLS
-- - Triggers keep track visibility and release stage/dates in sync
-- - Forms (subscriptions, inquiries) accept anonymous inserts
-- - Optional blog with public-only policy (draft/scheduled control)

-- ==============
-- TABLES
-- ==============

create table if not exists albums (
  id                   bigserial primary key,
  art_front            text,
  art_back             text,
  art_sleeve           text,
  art_sticker          text,
  album_name           varchar(255) not null,
  album_type           varchar(10) check (album_type in ('EP','LP','SP')),
  album_artist         varchar(255) not null,
  catalog_no           varchar(255),
  catalog_roman        varchar(255),   -- precomputed/display value
  upc                  varchar(20),
  distributor          text,
  label                text,
  release_date         date,
  removal_date         date,
  physical_release_date date,
  producer             text[],         -- multiple entries allowed
  engineer             text[],
  mastering            text[],
  key_contributors     jsonb,          -- [{name, role, url}]
  album_status         varchar(20) check (album_status in ('In Development','Released','Removed')) default 'In Development',
  visibility           varchar(10) check (visibility in ('PUBLIC','ADMIN','VIP')) default 'PUBLIC',
  stream_links         jsonb,          -- [{name,url}]
  purchase_links       jsonb,          -- [{name,url}]
  album_commentary     text,
  inserted_at          timestamptz default now(),
  updated_at           timestamptz default now()
);

create table if not exists tracks (
  id                 bigserial primary key,
  album_id           bigint not null references albums(id) on delete cascade,
  track_no           int,
  track_name         text not null,
  artist_names       text[],      -- multiple
  composer_names     text[],
  key_contributors   jsonb,       -- [{name, role, url}]
  isrc               varchar(15),
  track_status       varchar(12) check (track_status in ('WIP','B-SIDE','RELEASED','SHELVED')) default 'WIP',
  stage              varchar(20) check (stage in ('CONCEPTION','DEMO','IN SESSION','OUT SESSION','MIXDOWN','MASTERING','DISTRIBUTION','SHELVED','REMOVED','RELEASED')) default 'CONCEPTION',
  stage_date         date default current_date,
  visibility         varchar(10), -- kept in sync with parent album via triggers
  duration           text,        -- "MM:SS"
  stream_embed       text,        -- raw HTML embed (players); sanitize on the way in
  purchase_url       text,
  track_commentary   text,
  inserted_at        timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Optional: blog if you don't want Git/Markdown
create table if not exists blog_posts (
  id          bigserial primary key,
  slug        text unique not null,
  title       text not null,
  author      text default 'Brian Yegge',
  category    text check (category in ('Angershade','The Corruptive','Yegge')),
  tags        text[],
  draft       boolean default true,
  publish_at  timestamptz,
  body_md     text,       -- Markdown
  body_html   text,       -- optional pre-rendered
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Forms: accept anonymous inserts; reads are blocked unless you add a policy
create table if not exists subscriptions (
  id          bigserial primary key,
  first_name  text,
  last_name   text,
  phone       text,
  email       text not null,
  country     text,
  subscribe   boolean default true,
  created_at  timestamptz default now()
);

create table if not exists inquiries (
  id          bigserial primary key,
  first_name  text,
  last_name   text,
  phone       text,
  email       text not null,
  messenger   text,
  message     text,
  created_at  timestamptz default now()
);

-- ==============
-- INDEXES (helpful for filters/sorts)
-- ==============
create index if not exists idx_albums_artist      on albums (album_artist);
create index if not exists idx_albums_visibility  on albums (visibility);
create index if not exists idx_albums_release     on albums (release_date desc);

create index if not exists idx_tracks_album       on tracks (album_id);
create index if not exists idx_tracks_visibility  on tracks (visibility);
create index if not exists idx_tracks_no          on tracks (track_no);

create index if not exists idx_blog_category      on blog_posts (category);
create index if not exists idx_blog_publish_at    on blog_posts (publish_at);

-- ==============
-- UTILITY FUNCTIONS (timestamps)
-- ==============
create or replace function set_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_set_ts_albums on albums;
create trigger trg_set_ts_albums
before update on albums
for each row execute function set_timestamp();

drop trigger if exists trg_set_ts_tracks on tracks;
create trigger trg_set_ts_tracks
before update on tracks
for each row execute function set_timestamp();

drop trigger if exists trg_set_ts_blog on blog_posts;
create trigger trg_set_ts_blog
before update on blog_posts
for each row execute function set_timestamp();

-- ==============
-- BUSINESS LOGIC: TRACK STAGE SYNC
-- If a track goes RELEASED, set stage to RELEASED and stage_date to album release date
-- ==============
create or replace function trg_tracks_sync_stage()
returns trigger language plpgsql as $$
declare album_release date;
begin
  if new.track_status = 'RELEASED' then
    select release_date into album_release from albums where id = new.album_id;
    new.stage := 'RELEASED';
    new.stage_date := coalesce(album_release, current_date);
  end if;
  return new;
end
$$;

drop trigger if exists tracks_sync_stage on tracks;
create trigger tracks_sync_stage
before insert or update on tracks
for each row execute function trg_tracks_sync_stage();

-- If an album's release_date changes, align any RELEASED tracks' stage_date
create or replace function trg_album_release_bubble()
returns trigger language plpgsql as $$
begin
  if new.release_date is distinct from old.release_date then
    update tracks
       set stage_date = coalesce(new.release_date, stage_date)
     where album_id = new.id
       and track_status = 'RELEASED';
  end if;
  return new;
end
$$;

drop trigger if exists album_release_bubble on albums;
create trigger album_release_bubble
after update of release_date on albums
for each row execute function trg_album_release_bubble();

-- ==============
-- BUSINESS LOGIC: TRACK VISIBILITY INHERITANCE VIA TRIGGERS
-- ==============
-- On insert, copy visibility from parent album
create or replace function set_track_visibility_on_insert()
returns trigger language plpgsql as $$
begin
  select visibility into new.visibility from albums where id = new.album_id;
  return new;
end
$$;

drop trigger if exists trg_set_track_visibility on tracks;
create trigger trg_set_track_visibility
before insert on tracks
for each row execute function set_track_visibility_on_insert();

-- If a track is moved to a different album, refresh its visibility
create or replace function set_track_visibility_on_update_album()
returns trigger language plpgsql as $$
begin
  if new.album_id is distinct from old.album_id then
    select visibility into new.visibility from albums where id = new.album_id;
  end if;
  return new;
end
$$;

drop trigger if exists trg_set_track_visibility_on_update_album on tracks;
create trigger trg_set_track_visibility_on_update_album
before update of album_id on tracks
for each row execute function set_track_visibility_on_update_album();

-- If an album's visibility changes, update all its tracks
create or replace function update_track_visibility_on_album_change()
returns trigger language plpgsql as $$
begin
  update tracks
     set visibility = new.visibility
   where album_id = new.id;
  return new;
end
$$;

drop trigger if exists trg_update_track_visibility on albums;
create trigger trg_update_track_visibility
after update of visibility on albums
for each row execute function update_track_visibility_on_album_change();

-- ==============
-- ROW LEVEL SECURITY (RLS)
-- ==============
alter table albums        enable row level security;
alter table tracks        enable row level security;
alter table blog_posts    enable row level security;
alter table subscriptions enable row level security;
alter table inquiries     enable row level security;

-- PUBLIC read: only PUBLIC albums/tracks
drop policy if exists "public albums" on albums;
create policy "public albums" on albums
for select using (visibility = 'PUBLIC');

drop policy if exists "public tracks" on tracks;
create policy "public tracks" on tracks
for select using (visibility = 'PUBLIC');

-- PUBLIC read for blog: only non-draft and already published
drop policy if exists "public blog read" on blog_posts;
create policy "public blog read" on blog_posts
for select using (draft = false and (publish_at is null or publish_at <= now()));

-- PUBLIC inserts to forms (no public reads by default)
drop policy if exists "public subscribes" on subscriptions;
create policy "public subscribes" on subscriptions
for insert with check (true);

drop policy if exists "public inquiries" on inquiries;
create policy "public inquiries" on inquiries
for insert with check (true);

-- (Optional) Admin/service role can do everything via service key; configure in Supabase dashboard.