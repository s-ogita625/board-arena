import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { GAMES, gameLabel, isGameId } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Row {
  user_id: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  profiles: { username: string; avatar_url: string | null } | null;
}

export default async function RankingPage({
  params,
}: {
  params: { game: string };
}) {
  if (!isGameId(params.game)) notFound();
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: top } = await supabase
    .from("game_stats")
    .select("user_id, rating, wins, losses, draws, profiles!inner(username, avatar_url)")
    .eq("game", params.game)
    .order("rating", { ascending: false })
    .limit(100);

  const rows: Row[] = (top ?? []).map((r: any) => ({
    user_id: r.user_id,
    rating: r.rating,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    profiles: r.profiles ?? null,
  }));

  let myRank: number | null = null;
  let myStat: Row | null = null;
  if (user) {
    const { data: mine } = await supabase
      .from("game_stats")
      .select("user_id, rating, wins, losses, draws, profiles!inner(username, avatar_url)")
      .eq("game", params.game)
      .eq("user_id", user.id)
      .maybeSingle();
    if (mine) {
      myStat = mine as unknown as Row;
      const { count } = await supabase
        .from("game_stats")
        .select("*", { count: "exact", head: true })
        .eq("game", params.game)
        .gt("rating", mine.rating);
      myRank = (count ?? 0) + 1;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold mr-2">ランキング</h1>
        {GAMES.map((g) => (
          <Link
            key={g.id}
            href={`/ranking/${g.id}`}
            className={
              "px-3 py-1.5 rounded-full text-sm border " +
              (g.id === params.game
                ? "bg-brand text-brand-fg border-brand"
                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800")
            }
          >
            {g.emoji} {g.name}
          </Link>
        ))}
      </div>

      {myStat && (
        <Card>
          <CardHeader>
            <CardTitle>あなたの順位 ({gameLabel(params.game)})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-2xl font-bold">
                {myRank ? `#${myRank}` : "—"}
              </span>
              <span>レート: <b>{myStat.rating}</b></span>
              <span>
                {myStat.wins}勝 {myStat.losses}敗 {myStat.draws}分
              </span>
              <span>
                勝率:{" "}
                {myStat.wins + myStat.losses === 0
                  ? "—"
                  : `${Math.round((myStat.wins / (myStat.wins + myStat.losses)) * 100)}%`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top 100</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">まだデータがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 w-12">#</th>
                    <th className="py-2">プレイヤー</th>
                    <th className="py-2 text-right">レート</th>
                    <th className="py-2 text-right">勝</th>
                    <th className="py-2 text-right">敗</th>
                    <th className="py-2 text-right">分</th>
                    <th className="py-2 text-right">勝率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const winRate =
                      r.wins + r.losses === 0
                        ? "—"
                        : `${Math.round((r.wins / (r.wins + r.losses)) * 100)}%`;
                    const isMe = user?.id === r.user_id;
                    return (
                      <tr
                        key={r.user_id}
                        className={
                          "border-b border-slate-100 dark:border-slate-800 " +
                          (isMe ? "bg-amber-50 dark:bg-amber-950/30" : "")
                        }
                      >
                        <td className="py-2 font-mono">{i + 1}</td>
                        <td className="py-2">
                          <Link
                            href={`/profile/${r.user_id}`}
                            className="flex items-center gap-2 hover:underline"
                          >
                            {r.profiles?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={r.profiles.avatar_url}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 inline-block" />
                            )}
                            <span>{r.profiles?.username ?? "player"}</span>
                          </Link>
                        </td>
                        <td className="py-2 text-right font-semibold">{r.rating}</td>
                        <td className="py-2 text-right">{r.wins}</td>
                        <td className="py-2 text-right">{r.losses}</td>
                        <td className="py-2 text-right">{r.draws}</td>
                        <td className="py-2 text-right">{winRate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
