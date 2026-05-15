-- =====================================================
-- Online Board Games initial schema
-- =====================================================

create extension if not exists "pgcrypto";

-- ----- profiles -----
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 2 and 24),
  bio text check (char_length(bio) <= 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select using (true);

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id);

-- ----- game_stats -----
create table if not exists public.game_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table public.game_stats enable row level security;

drop policy if exists "game_stats readable" on public.game_stats;
create policy "game_stats readable" on public.game_stats
  for select using (true);

-- writes are performed by service-role only; no anon policies for write.

-- ----- rooms -----
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  max_players int not null default 2,
  state jsonb,
  public_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_status_idx on public.rooms(status);

alter table public.rooms enable row level security;

drop policy if exists "rooms readable by participants" on public.rooms;
create policy "rooms readable by participants" on public.rooms
  for select using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = rooms.id and rp.user_id = auth.uid()
    )
  );

-- ----- room_players -----
create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat int not null,
  rating_before int not null default 1000,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_players_user_idx on public.room_players(user_id);

alter table public.room_players enable row level security;

drop policy if exists "room_players readable by participants" on public.room_players;
create policy "room_players readable by participants" on public.room_players
  for select using (
    exists (
      select 1 from public.room_players rp2
      where rp2.room_id = room_players.room_id and rp2.user_id = auth.uid()
    )
  );

-- ----- match_queue -----
create table if not exists public.match_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  rating int not null,
  joined_at timestamptz not null default now()
);

alter table public.match_queue enable row level security;

drop policy if exists "queue self insert" on public.match_queue;
create policy "queue self insert" on public.match_queue
  for insert with check (auth.uid() = user_id);

drop policy if exists "queue self delete" on public.match_queue;
create policy "queue self delete" on public.match_queue
  for delete using (auth.uid() = user_id);

drop policy if exists "queue self select" on public.match_queue;
create policy "queue self select" on public.match_queue
  for select using (auth.uid() = user_id);

-- ----- match_results -----
create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  game text not null check (game in ('chess','shogi','babanuki','daifugo','shinkei')),
  winner_id uuid references public.profiles(id) on delete set null,
  rating_changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists match_results_game_idx on public.match_results(game);

alter table public.match_results enable row level security;

drop policy if exists "results readable" on public.match_results;
create policy "results readable" on public.match_results
  for select using (true);

-- =====================================================
-- Helpers / triggers
-- =====================================================

-- Auto-create profile row + per-game stats on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
begin
  base_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'player_' || substr(new.id::text, 1, 6)
  );

  insert into public.profiles (id, username)
  values (new.id, base_username)
  on conflict (id) do nothing;

  insert into public.game_stats (user_id, game)
  select new.id, g
  from unnest(array['chess','shogi','babanuki','daifugo','shinkei']) as g
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars self write" on storage.objects;
create policy "avatars self write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars self update" on storage.objects;
create policy "avatars self update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars self delete" on storage.objects;
create policy "avatars self delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
