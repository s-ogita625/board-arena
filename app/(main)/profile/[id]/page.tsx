import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAMES, gameLabel } from "@/lib/utils";
import { ProfileEditor } from "./editor";

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
    </div>
  );
}
