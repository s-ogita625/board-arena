-- =====================================================
-- BoardArena initial schema (isolated under `boardarena` schema)
-- Does NOT touch existing public.* tables in event-planner project.
-- =====================================================

create extension if not exists "pgcrypto";

create schema if not exists boardarena;

-- Expose schema to PostgREST so Supabase client can use it via { db: { schema: 'boardarena' } }
grant usage on schema boardarena to anon, authenticated, service_role;
alter default privileges in schema boardarena grant all on tables to anon, authenticated, service_role;
alter default privileges in schema boardarena grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema boardarena grant all on functions to anon, authenticated, service_role;

-- ----- profiles -----
create table if not exists boardarena.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 2 and 24),
  bio text check (char_length(bio) <= 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table boardarena.profiles enable row level security;

drop policy if exists "ba_profiles_readable" on boardarena.profiles;
create policy "ba_profiles_readable" on boardarena.profiles
  for select using (true);

drop policy if exists "ba_profiles_self_insert" on boardarena.profiles;
create policy "ba_profiles_self_insert" on boardarena.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "ba_profiles_self_update" on boardarena.profiles;
create policy "ba_profiles_self_update" on boardarena.profiles
  for update using (auth.uid() = id);

-- ----- game_stats -----
create table if not exists boardarena.game_stats (
  user_id uuid not null references boardarena.profiles(id) on delete cascade,
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table boardarena.game_stats enable row level security;

drop policy if exists "ba_game_stats_readable" on boardarena.game_stats;
create policy "ba_game_stats_readable" on boardarena.game_stats
  for select using (true);

drop policy if exists "ba_game_stats_self_insert" on boardarena.game_stats;
create policy "ba_game_stats_self_insert" on boardarena.game_stats
  for insert with check (auth.uid() = user_id);

-- writes are mostly performed by service-role (via api routes) which bypasses RLS.

-- ----- rooms -----
create table if not exists boardarena.rooms (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  max_players int not null default 2,
  state jsonb,
  public_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ba_rooms_status_idx on boardarena.rooms(status);

alter table boardarena.rooms enable row level security;

-- ----- room_players (defined here so subsequent rooms policies can reference it) -----
create table if not exists boardarena.room_players (
  room_id uuid not null references boardarena.rooms(id) on delete cascade,
  user_id uuid not null references boardarena.profiles(id) on delete cascade,
  seat int not null,
  rating_before int not null default 1000,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists ba_room_players_user_idx on boardarena.room_players(user_id);

alter table boardarena.room_players enable row level security;

drop policy if exists "ba_room_players_readable" on boardarena.room_players;
create policy "ba_room_players_readable" on boardarena.room_players
  for select using (
    exists (
      select 1 from boardarena.room_players rp2
      where rp2.room_id = room_players.room_id and rp2.user_id = auth.uid()
    )
  );

-- rooms policies (defined after room_players)
drop policy if exists "ba_rooms_readable_by_participants" on boardarena.rooms;
create policy "ba_rooms_readable_by_participants" on boardarena.rooms
  for select using (
    exists (
      select 1 from boardarena.room_players rp
      where rp.room_id = rooms.id and rp.user_id = auth.uid()
    )
  );

drop policy if exists "ba_rooms_update_by_participants" on boardarena.rooms;
create policy "ba_rooms_update_by_participants" on boardarena.rooms
  for update using (
    exists (
      select 1 from boardarena.room_players rp
      where rp.room_id = rooms.id and rp.user_id = auth.uid()
    )
  );

-- ----- match_queue -----
create table if not exists boardarena.match_queue (
  user_id uuid primary key references boardarena.profiles(id) on delete cascade,
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  rating int not null,
  joined_at timestamptz not null default now()
);

create index if not exists ba_match_queue_game_idx on boardarena.match_queue(game);

alter table boardarena.match_queue enable row level security;

drop policy if exists "ba_queue_self_insert" on boardarena.match_queue;
create policy "ba_queue_self_insert" on boardarena.match_queue
  for insert with check (auth.uid() = user_id);

drop policy if exists "ba_queue_self_delete" on boardarena.match_queue;
create policy "ba_queue_self_delete" on boardarena.match_queue
  for delete using (auth.uid() = user_id);

drop policy if exists "ba_queue_self_select" on boardarena.match_queue;
create policy "ba_queue_self_select" on boardarena.match_queue
  for select using (auth.uid() = user_id);

-- ----- match_results -----
create table if not exists boardarena.match_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references boardarena.rooms(id) on delete set null,
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  winner_id uuid references boardarena.profiles(id) on delete set null,
  rating_changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ba_match_results_game_idx on boardarena.match_results(game);

alter table boardarena.match_results enable row level security;

drop policy if exists "ba_results_readable" on boardarena.match_results;
create policy "ba_results_readable" on boardarena.match_results
  for select using (true);

-- =====================================================
-- Realtime: add boardarena.rooms to the supabase_realtime publication
-- =====================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'boardarena'
        and tablename = 'rooms'
    ) then
      execute 'alter publication supabase_realtime add table boardarena.rooms';
    end if;
  end if;
end$$;

-- =====================================================
-- Storage bucket for BoardArena avatars (separate from any existing bucket)
-- =====================================================

insert into storage.buckets (id, name, public)
values ('boardarena-avatars', 'boardarena-avatars', true)
on conflict (id) do nothing;

drop policy if exists "ba_avatars_public_read" on storage.objects;
create policy "ba_avatars_public_read" on storage.objects
  for select using (bucket_id = 'boardarena-avatars');

drop policy if exists "ba_avatars_self_write" on storage.objects;
create policy "ba_avatars_self_write" on storage.objects
  for insert with check (
    bucket_id = 'boardarena-avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "ba_avatars_self_update" on storage.objects;
create policy "ba_avatars_self_update" on storage.objects
  for update using (
    bucket_id = 'boardarena-avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "ba_avatars_self_delete" on storage.objects;
create policy "ba_avatars_self_delete" on storage.objects
  for delete using (
    bucket_id = 'boardarena-avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
