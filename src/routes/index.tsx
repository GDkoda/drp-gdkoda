import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Swords, Coins, ScrollText, Store } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mesa 3D&T Alpha — Taverna dos Aventureiros" },
      { name: "description", content: "Crie fichas 3D&T Alpha, compre equipamentos e jogue mini-jogos com sua mesa." },
      { property: "og:title", content: "Mesa 3D&T Alpha" },
      { property: "og:description", content: "Fichas, loja, baú e mini-jogos para sua mesa de RPG." },
    ],
  }),
  component: Index,
});

function Index() {
  const { text } = useCustomization();
  const feats = [
    { icon: ScrollText, t: "Fichas 3D&T Alpha", d: "Cálculo automático de PV, PM, FA e FD." },
    { icon: Store, t: "Loja e Baú", d: "Equipe itens em qualquer personagem." },
    { icon: Coins, t: "Economia da mesa", d: "Check-in diário, transferências seguras." },
    { icon: Swords, t: "Mini-jogos", d: "Combate, dados na taverna e enigmas." },
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
      <p className="font-display text-sm uppercase tracking-[0.3em] text-muted-foreground">{text("home_eyebrow")}</p>
      <h1 className="mt-3 text-4xl font-bold text-gold sm:text-6xl">{text("home_title")}</h1>
      <p className="mt-4 max-w-lg text-lg text-muted-foreground">
        {text("home_description")}
      </p>
      <Button asChild size="lg" className="mt-8 font-display">
        <Link to="/auth">{text("home_enter")}</Link>
      </Button>
      <div className="mt-14 grid w-full gap-3 sm:grid-cols-2">
        {feats.map((f) => (
          <div key={f.t} className="rounded-lg border bg-card p-4 text-left">
            <f.icon className="h-5 w-5 text-gold" />
            <h3 className="mt-2 text-base">{f.t}</h3>
            <p className="text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
