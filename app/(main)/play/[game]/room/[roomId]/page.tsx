import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isGameId } from "@/lib/utils";
import { OnlineChess } from "@/components/online/OnlineChess";
import { OnlineShogi } from "@/components/online/OnlineShogi";

export default async function RoomPage({
  params,
}: {
  params: { game: string; roomId: string };
}) {
  if (!isGameId(params.game)) notFound();
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .from("rooms")
    .select("id, game, status, state")
    .eq("id", params.roomId)
    .single();
  if (!room) notFound();

  const { data: players } = await supabase
    .from("room_players")
    .select("user_id, seat, profiles!inner(username, avatar_url)")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });

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

  if (params.game === "chess") {
    return (
      <OnlineChess
        roomId={room.id}
        meSeat={me.seat}
        players={playerList}
        finished={room.status === "finished"}
      />
    );
  }
  if (params.game === "shogi") {
    return (
      <OnlineShogi
        roomId={room.id}
        meSeat={me.seat}
        players={playerList}
        finished={room.status === "finished"}
      />
    );
  }
  return (
    <div className="max-w-md mx-auto mt-16">
      <p>このゲーム種別のオンライン対戦は現在開発中です。ソロでお楽しみください。</p>
    </div>
  );
}
