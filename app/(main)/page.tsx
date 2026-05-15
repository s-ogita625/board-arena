import Link from "next/link";
import { GAMES } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// オンライン対応済みのゲーム。未対応のものは「近日公開」表示。
const ONLINE_READY: ReadonlySet<string> = new Set([
  "chess",
  "shogi",
  "babanuki",
  "shinkei",
  "daifugo",
]);

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="text-center space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold">遊びたいゲームを選ぼう</h1>
        <p className="text-slate-500 dark:text-slate-400">
          ソロでCPU(10段階)と練習、オンラインで世界と対戦
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GAMES.map((g) => {
          const onlineReady = ONLINE_READY.has(g.id);
          return (
            <Card key={g.id} className="hover:shadow-md transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <span className="text-2xl">{g.emoji}</span>
                  {g.name}
                </CardTitle>
                <CardDescription>最大 {g.maxPlayers} 人</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Link
                    href={`/play/${g.id}/solo`}
                    className="flex-1 inline-flex items-center justify-center rounded-md bg-brand text-brand-fg h-10 text-sm font-medium hover:opacity-90"
                  >
                    ソロ
                  </Link>
                  {onlineReady ? (
                    <Link
                      href={`/play/${g.id}/match`}
                      className="flex-1 inline-flex items-center justify-center rounded-md bg-slate-200 dark:bg-slate-800 h-10 text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-700"
                    >
                      オンライン
                    </Link>
                  ) : (
                    <span
                      title="このゲームのオンライン対戦は近日公開予定です"
                      className="flex-1 inline-flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-900 text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 h-10 text-xs font-medium cursor-not-allowed"
                    >
                      オンライン（近日公開）
                    </span>
                  )}
                </div>
                <Link
                  href={`/ranking/${g.id}`}
                  className="block text-xs text-slate-500 hover:text-brand hover:underline"
                >
                  → ランキングを見る
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
