-- Start rest (spec §11.5): rest length, rest music source, Up next.
-- Additive only: existing rows get the defaults.

-- Space-separated OAuth scopes from the last token response. NULL = logged in before scopes were tracked.
alter table users add column scopes text;

alter table settings
  add column rest_ms           integer not null default 210000 check (rest_ms between 30000 and 300000),
  add column rest_source       text,                            -- 'liked', 'tagged', or a Spotify playlist id; NULL = Liked Songs
  add column rest_source_name  text,                            -- display name of the playlist
  add column next_drop_id      uuid references drops(id) on delete set null;  -- "Up next"; cleared after use
