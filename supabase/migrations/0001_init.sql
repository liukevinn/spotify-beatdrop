create extension if not exists pgcrypto;

create table users (
  id                       uuid primary key default gen_random_uuid(),
  spotify_user_id          text not null unique,
  display_name             text,
  refresh_token_enc        text not null,          -- AES-256-GCM, base64 "iv.tag.ciphertext"
  access_token             text,                    -- short-lived; stored plain for caching
  access_token_expires_at  timestamptz,
  needs_reauth             boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table settings (
  user_id              uuid primary key references users(id) on delete cascade,
  lead_ms              integer not null default 20000 check (lead_ms between 5000 and 60000),
  reaction_offset_ms   integer not null default 250   check (reaction_offset_ms between 0 and 600),
  queue_mode           text    not null default 'shuffle' check (queue_mode in ('shuffle','sequential')),
  avoid_repeat_within  integer not null default 5 check (avoid_repeat_within between 0 and 50),
  device_id            text,
  device_name          text,
  updated_at           timestamptz not null default now()
);

create table drops (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  track_id          text not null,
  track_uri         text not null,
  track_name        text not null,
  artists           text not null,                 -- comma-joined display string
  album_art_url     text,
  duration_ms       integer not null,
  drop_ms           integer not null check (drop_ms >= 0),
  lead_ms_override  integer check (lead_ms_override between 5000 and 60000),
  enabled           boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, track_id)
);
create index drops_user_idx on drops(user_id);

create table sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  drop_id      uuid references drops(id) on delete set null,
  track_id     text not null,
  track_name   text not null,
  cued_at      timestamptz not null default now(),
  position_ms  integer not null,
  lead_ms      integer not null,
  source       text not null check (source in ('pwa','shortcut'))
);
create index sets_user_cued_idx on sets(user_id, cued_at desc);

create table api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  label         text not null,
  token_hash    text not null unique,              -- sha256 hex of the raw token
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- Server-only access via service role. Enable RLS with no policies so the anon key can read nothing.
alter table users      enable row level security;
alter table settings   enable row level security;
alter table drops      enable row level security;
alter table sets       enable row level security;
alter table api_tokens enable row level security;
