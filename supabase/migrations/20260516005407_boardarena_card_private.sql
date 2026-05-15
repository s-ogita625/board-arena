-- =====================================================
-- BoardArena: per-player private state for online card games
-- (babanuki / shinkei / daifugo)
--
-- The public room state lives in boardarena.rooms.public_state and is
-- broadcast via Realtime to all participants. Each player's hand is
-- written here and only readable by that player, so opponents cannot
-- inspect each other's cards.
-- =====================================================

create table if not exists boardarena.room_private_state (
  room_id uuid not null references boardarena.rooms(id) on delete cascade,
  user_id uuid not null references boardarena.profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists ba_room_private_state_user_idx
  on boardarena.room_private_state(user_id);

alter table boardarena.room_private_state enable row level security;

-- Only the owning user can read their own private state. Writes happen
-- exclusively through service-role (API routes), so no insert/update
-- policy is exposed to authenticated users.
drop policy if exists "ba_private_state_self_select" on boardarena.room_private_state;
create policy "ba_private_state_self_select" on boardarena.room_private_state
  for select using (auth.uid() = user_id);

-- Add to realtime publication so each player can subscribe to their row.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'boardarena'
        and tablename = 'room_private_state'
    ) then
      execute 'alter publication supabase_realtime add table boardarena.room_private_state';
    end if;
  end if;
end$$;
