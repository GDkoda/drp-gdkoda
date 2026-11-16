import { createFileRoute } from "@tanstack/react-router";
import { BloodCardGame } from "@/components/cards/BloodCardGame";

export const Route = createFileRoute("/_authenticated/cartas")({
  head: () => ({
    meta: [
      { title: "Sangue das Fendas — Mesa 3D&T" },
      { name: "description", content: "Um roguelike deckbuilder sombrio onde seu baralho é sua vida." },
    ],
  }),
  component: BloodCardRoute,
});

function BloodCardRoute() {
  return <BloodCardGame />;
}
