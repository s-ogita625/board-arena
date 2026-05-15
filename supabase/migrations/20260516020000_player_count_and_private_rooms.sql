-- Add player-count and private-room support.
--   * rooms.desired_players : how many players the match needs (2-4)
--   * rooms.visibility      : 'public' (auto-match) / 'private' (passcode)
--   * rooms.passcode        : 6-char alphanumeric code, NULL for public rooms
--   * rooms.host_id         : creator for private rooms; null otherwise
--   * rooms.rated           : false for private/friend rooms
--   * match_queue.desired_players : the size of pool the user wants to join
--
-- All defaults preserve previous 2-player, rated, public behavior.

alter table boardarena.rooms
  add column if not exists desired_players int not null default 2,
  add column if not exists visibility text not null default 'public',
  add column if not exists passcode text,
  add column if not exists host_id uuid references auth.users(id) on delete set null,
  add column if not exists rated boolean not null default true;

-- Loosen check on visibility values
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_visibility_check'
  ) then
    alter table boardarena.rooms
      add constraint rooms_visibility_check
      check (visibility in ('public','private'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_desired_players_check'
  ) then
    alter table boardarena.rooms
      add constraint rooms_desired_players_check
      check (desired_players between 2 and 4);
  end if;
end $$;

create index if not exists ba_rooms_passcode_idx
  on boardarena.rooms(passcode) where passcode is not null;

create index if not exists ba_rooms_host_idx
  on boardarena.rooms(host_id) where host_id is not null;

-- match_queue gets desired_players too so pools don't mix.
alter table boardarena.match_queue
  add column if not exists desired_players int not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'match_queue_desired_players_check'
  ) then
    alter table boardarena.match_queue
      add constraint match_queue_desired_players_check
      check (desired_players between 2 and 4);
  end if;
end $$;

create index if not exists ba_match_queue_game_size_idx
  on boardarena.match_queue(game, desired_players);

-- Private rooms start out without a chosen game (host picks in the lobby), so
-- relax the rooms.game NOT NULL constraint by allowing the placeholder string
-- 'lobby'. The 'lobby' value is intentionally NOT a valid GameId so it cannot
-- be confused with a real game by /play routes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_game_check'
  ) then
    alter table boardarena.rooms
      add constraint rooms_game_check
      check (game in ('chess','shogi','babanuki','daifugo','shinkei','lobby'));
  end if;
end $$;

-- Allow the host (auth.uid() = host_id) to update lobby-phase rooms even if
-- they aren't yet in room_players (they will be inserted alongside, but we
-- want host updates to work right after create).
drop policy if exists "ba_rooms_host_can_update" on boardarena.rooms;
create policy "ba_rooms_host_can_update" on boardarena.rooms
  for update using (host_id = auth.uid());

-- Allow anyone authenticated to read a private room *by passcode* via a
-- security-definer RPC. We deliberately do not loosen the SELECT RLS for
-- arbitrary passcode probing.
create or replace function boardarena.find_private_room(p_passcode text)
returns table (
  id uuid,
  status text,
  game text,
  visibility text,
  desired_players int,
  host_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.status, r.game, r.visibility, r.desired_players, r.host_id
  from boardarena.rooms r
  where r.visibility = 'private'
    and r.passcode = upper(p_passcode)
    and r.status in ('waiting','lobby','playing')
  limit 1;
$$;

revoke all on function boardarena.find_private_room(text) from public;
grant execute on function boardarena.find_private_room(text) to authenticated;
