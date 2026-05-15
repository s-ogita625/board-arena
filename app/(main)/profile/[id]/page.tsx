import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAMES, gameLabel, isGameId, type GameId } from "@/lib/utils";
import { ProfileEditor } from "./editor";

interface RecentMatch {
  id: string;
  game: GameId;
  winner_id: string | null;
  created_at: string;
  rating_changes: Record<string, number>;
  opponents: { user_id: string; username: string }[];
}

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, bio, avatar_url, created_at")
    .eq("id", params.id)
    .single();

  if (!profile) notFound();

  const { data: stats } = await supabase
    .from("game_stats")
    .select("game, rating, wins, losses, draws")
    .eq("user_id", params.id);

  // --- 最近の対局（オンラインのみ）---
  const { data: myRoomRows } = await supabase
    .from("room_players")
    .select("room_id")
    .eq("user_id", params.id);
  const myRoomIds = (myRoomRows ?? []).map((r) => r.room_id);

  let recent: RecentMatch[] = [];
  if (myRoomIds.length > 0) {
    const { data: results } = await supabase
      .from("match_results")
      .select("id, room_id, game, winner_id, rating_changes, created_at")
      .in("room_id", myRoomIds)
      .order("created_at", { ascending: false })
      .limit(10);

    const resultRoomIds = (results ?? [])
      .map((r) => r.room_id)
      .filter((v): v is string => !!v);
    const participantMap = new Map<string, { user_id: string; username: string }[]>();
    if (resultRoomIds.length > 0) {
      const { data: rp } = await supabase
        .from("room_players")
        .select("room_id, user_id, profiles!inner(username)")
        .in("room_id", resultRoomIds);
      for (const row of rp ?? []) {
        const arr = participantMap.get(row.room_id) ?? [];
        arr.push({
          user_id: row.user_id,
          username: (row as any).profiles?.username ?? "player",
        });
        participantMap.set(row.room_id, arr);
      }
    }

    recent = (results ?? [])
      .filter((r) => isGameId(r.game))
      .map((r) => {
        const all = participantMap.get(r.room_id ?? "") ?? [];
        const opponents = all.filter((p) => p.user_id !== params.id);
        return {
          id: r.id,
          game: r.game as GameId,
          winner_id: r.winner_id,
          created_at: r.created_at,
          rating_changes: (r.rating_changes ?? {}) as Record<string, number>,
          opponents,
        };
      });
  }

  const isMe = user?.id === profile.id;
  const statsMap = new Map((stats ?? []).map((s) => [s.game, s]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>プロフィール</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex-shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="w-28 h-28 rounded-full object-cover border"
              />
            ) : (
              <div className="w-28 h-28 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-3xl">
                {profile.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-2xl font-semibold">{profile.username}</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {profile.bio || "（一言は未設定）"}
            </p>
            <p className="text-xs text-slate-400">
              登録日: {new Date(profile.created_at).toLocaleDateString("ja-JP")}
            </p>
          </div>
        </CardContent>
      </Card>

      {isMe && (
        <ProfileEditor
          initial={{
            id: profile.id,
            username: profile.username,
            bio: profile.bio ?? "",
            avatar_url: profile.avatar_url,
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>戦績</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">ゲーム</th>
                  <th className="py-2 text-right">レート</th>
                  <th className="py-2 text-right">勝</th>
                  <th className="py-2 text-right">負</th>
                  <th className="py-2 text-right">分</th>
                  <th className="py-2 text-right">勝率</th>
                </tr>
              </thead>
              <tbody>
                {GAMES.map((g) => {
                  const s = statsMap.get(g.id);
                  const w = s?.wins ?? 0;
                  const l = s?.losses ?? 0;
                  const d = s?.draws ?? 0;
                  const total = w + l + d;
                  const rate = total ? ((w / total) * 100).toFixed(1) : "—";
                  return (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="py-2">{gameLabel(g.id)}</td>
                      <td className="py-2 text-right font-semibold">
                        {s?.rating ?? 1000}
                      </td>
                      <td className="py-2 text-right">{w}</td>
                      <td className="py-2 text-right">{l}</td>
                      <td className="py-2 text-right">{d}</td>
                      <td className="py-2 text-right">
                        {typeof rate === "string" && rate !== "—" ? `${rate}%` : rate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近の対局 (オンライン)</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">まだオンライン対局の記録がありません。</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.map((m) => {
                const delta = m.rating_changes[params.id];
                const result =
                  m.winner_id === null
                    ? "△ 引き分け"
                    : m.winner_id === params.id
                    ? "○ 勝利"
                    : "× 敗北";
                const resultClass =
                  m.winner_id === null
                    ? "text-slate-500"
                    : m.winner_id === params.id
                    ? "text-emerald-600"
                    : "text-rose-600";
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0"
                  >
                    <span className="text-xs text-slate-400 font-mono w-24">
                      {new Date(m.created_at).toLocaleDateString("ja-JP", {
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </span>
                    <span className="font-medium w-20">{gameLabel(m.game)}</span>
                    <span className={`font-semibold w-16 ${resultClass}`}>{result}</span>
                    <span className="text-slate-500">
                      vs{" "}
                      {m.opponents.length === 0
                        ? "—"
                        : m.opponents.map((o, i) => (
                            <span key={o.user_id}>
                              {i > 0 && ", "}
                              <Link
                                href={`/profile/${o.user_id}`}
                                className="underline hover:text-brand"
                              >
                                {o.username}
                              </Link>
                            </span>
                          ))}
                    </span>
                    {typeof delta === "number" && (
                      <span
                        className={`ml-auto font-mono text-xs ${
                          delta > 0
                            ? "text-emerald-600"
                            : delta < 0
                            ? "text-rose-600"
                            : "text-slate-500"
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
