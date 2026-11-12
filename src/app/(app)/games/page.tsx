import { Suspense } from "react";
import { GameArena } from "./GameArena";

export default function GamesPage() {
  return (
    <Suspense>
      <GameArena />
    </Suspense>
  );
}
