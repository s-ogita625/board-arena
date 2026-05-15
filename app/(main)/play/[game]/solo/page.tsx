import { notFound } from "next/navigation";
import { isGameId } from "@/lib/utils";
import { ChessSolo } from "@/components/games/ChessSolo";
import { ShogiSolo } from "@/components/games/ShogiSolo";
import { BabanukiSolo } from "@/components/games/BabanukiSolo";
import { DaifugoSolo } from "@/components/games/DaifugoSolo";
import { ShinkeiSolo } from "@/components/games/ShinkeiSolo";

export default function SoloGamePage({ params }: { params: { game: string } }) {
  if (!isGameId(params.game)) notFound();
  switch (params.game) {
    case "chess":    return <ChessSolo />;
    case "shogi":    return <ShogiSolo />;
    case "babanuki": return <BabanukiSolo />;
    case "daifugo":  return <DaifugoSolo />;
    case "shinkei":  return <ShinkeiSolo />;
  }
  return null;
}
