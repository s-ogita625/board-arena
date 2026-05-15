import { notFound, redirect } from "next/navigation";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { isGameId } from "@/lib/utils";
import { OnlineChess } from "@/components/online/OnlineChess";
import { OnlineShogi } from "@/components/online/OnlineShogi";
import { OnlineBabanuki } from "@/components/online/OnlineBabanuki";
import { OnlineShinkei } from "@/components/online/OnlineShinkei";
import { OnlineDaifugo } from "@/components/online/OnlineDaifugo";

// Always render dynamically so we don't serve a stale 404 from RSC cache to the
// 2nd player whose room_players row was just inserted milliseconds ago.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchRoomWithRetry(
  supabase: ReturnType<typeof createSupabaseServer>,
  roomId: string,
) {
  // RLS on `rooms` requires the requester to be in `room_players`. The 2nd
  // player can land here a few hundred ms before their `room_players` row is
  // visible to their authenticated session, which would otherwise return null.
  // Retry briefly to ride out the replication / snapshot lag.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from("rooms")
      .select("id, game, status, state")
      .eq("id", roomId)
      .maybeSingle();
    if (data) return data;
    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }
  return null;
}

async function fetchPlayersWithRetry(
  supabase: ReturnType<typeof createSupabaseServer>,
  roomId: string,
  myUserId: string,
) {
  // Same lag issue applies to `room_players`: their RLS policy requires the
  // requester to already be a member of the room. Retry until we either see
  // ourselves in the result or give up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from("room_players")
      .select("user_id, seat, profiles!inner(username, avatar_url)")
      .eq("room_id", roomId)
      .order("seat", { ascending: true });
    if (data && data.some((p) => p.user_id === myUserId)) return data;
    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }
  return null;
}

export default async function RoomPage({
  params,
}: {
  params: { game: string; roomId: string };
}) {
  if (!isGameId(params.game)) notFound();
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let room = await fetchRoomWithRetry(supabase, params.roomId);

  // Final fallback: verify with service-role that this user actually belongs
  // to the room, then read the room without RLS. This avoids 404s caused by
  // RLS visibility lag right after match creation.
  if (!room) {
    const admin = createSupabaseAdmin();
    const { data: membership } = await admin
      .from("room_players")
      .select("room_id")
      .eq("room_id", params.roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership) {
      const { data: adminRoom } = await admin
        .from("rooms")
        .select("id, game, status, state")
        .eq("id", params.roomId)
        .maybeSingle();
      if (adminRoom) room = adminRoom;
    }
  }
  if (!room) notFound();

  let players = await fetchPlayersWithRetry(supabase, room.id, user.id);

  // Final fallback for room_players: confirm membership via service-role and
  // fetch the full participant list without RLS. Without this, both clients
  // can briefly see "このルームには参加していません" right after match because
  // their own room_players row isn't yet visible to their session.
  if (!players) {
    const admin = createSupabaseAdmin();
    const { data: membership } = await admin
      .from("room_players")
      .select("room_id")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership) {
      const { data: adminPlayers } = await admin
        .from("room_players")
        .select("user_id, seat, profiles!inner(username, avatar_url)")
        .eq("room_id", room.id)
        .order("seat", { ascending: true });
      if (adminPlayers) players = adminPlayers;
    }
  }

  const playerList = (players ?? []).map((p) => ({
    user_id: p.user_id,
    seat: p.seat,
    username: (p as any).profiles?.username ?? "player",
    avatar_url: (p as any).profiles?.avatar_url ?? null,
  }));

  const me = playerList.find((p) => p.user_id === user.id);
  if (!me) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p>このルームには参加していません。</p>
      </div>
    );
  }

  const sharedProps = {
    roomId: room.id,
    meSeat: me.seat,
    players: playerList,
    finished: room.status === "finished",
  };

  switch (params.game) {
    case "chess":
      return <OnlineChess {...sharedProps} />;
    case "shogi":
      return <OnlineShogi {...sharedProps} />;
    case "babanuki":
      return <OnlineBabanuki {...sharedProps} />;
    case "shinkei":
      return <OnlineShinkei {...sharedProps} />;
    case "daifugo":
      return <OnlineDaifugo {...sharedProps} />;
    default:
      return (
        <div className="max-w-md mx-auto mt-16">
          <p>このゲーム種別のオンライン対戦は現在開発中です。ソロでお楽しみください。</p>
        </div>
      );
  }
}
