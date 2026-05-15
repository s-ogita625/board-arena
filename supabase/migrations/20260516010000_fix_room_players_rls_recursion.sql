-- Fix infinite recursion in boardarena RLS policies.
-- The previous policy on boardarena.room_players had an EXISTS subquery that
-- referenced boardarena.room_players itself. When a SELECT on room_players ran
-- under RLS, evaluating the policy required SELECTing room_players, which
-- re-evaluated the same policy, etc. PostgREST returned SQLSTATE 42P17:
--   "infinite recursion detected in policy for relation room_players"
--
-- The rooms policies referenced room_players, so any client SELECT on rooms
-- ran into the same recursion via the cascaded RLS check.
--
-- Fix: route the membership test through a SECURITY DEFINER helper function
-- so the inner check runs with elevated privilege and bypasses RLS.

create or replace function boardarena.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from boardarena.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

revoke all on function boardarena.is_room_member(uuid) from public;
grant execute on function boardarena.is_room_member(uuid) to anon, authenticated;

-- room_players: drop the self-referential policy and replace it with one that
-- delegates the membership check to the helper.
drop policy if exists "ba_room_players_readable" on boardarena.room_players;
create policy "ba_room_players_readable" on boardarena.room_players
  for select using (boardarena.is_room_member(room_id));

-- rooms: same treatment for both SELECT and UPDATE so the cascaded RLS
-- evaluation no longer triggers the recursive policy.
drop policy if exists "ba_rooms_readable_by_participants" on boardarena.rooms;
create policy "ba_rooms_readable_by_participants" on boardarena.rooms
  for select using (boardarena.is_room_member(id));

drop policy if exists "ba_rooms_update_by_participants" on boardarena.rooms;
create policy "ba_rooms_update_by_participants" on boardarena.rooms
  for update using (boardarena.is_room_member(id));

-- room_private_state already restricts to user_id = auth.uid(), so it is not
-- recursive. No change required.
