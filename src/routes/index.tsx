import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Swords, Coins, ScrollText, Store } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { ThemeToggle } from "@/components/theme-toggle";
import { PwaInstallCard } from "@/components/PwaInstall";

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
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 pb-12 pt-24 text-center sm:px-6 sm:py-16">
      <div className="absolute right-4 top-5 sm:right-6 sm:top-6"><ThemeToggle /></div>
      <div className="mb-5 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-gold">Mesa de RPG • 3D&T Alpha</div>
      <p className="font-display text-sm uppercase tracking-[0.3em] text-muted-foreground">{text("home_eyebrow")}</p>
      <h1 className="mt-2 max-w-4xl text-4xl font-bold text-gold drop-shadow-sm sm:text-6xl lg:text-7xl">{text("home_title")}</h1>
      <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-xl">{text("home_description")}</p>
      <Button asChild size="lg" className="mt-8 min-h-12 rounded-xl px-7 font-display shadow-lg shadow-primary/15">
        <Link to="/auth">{text("home_enter")}</Link>
      </Button>
      <div className="mt-5 w-full max-w-xl"><PwaInstallCard /></div>
      <div className="mt-10 grid w-full gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
        {feats.map((f) => (
          <div key={f.t} className="group rounded-2xl border border-border/80 bg-card/90 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-gold"><f.icon className="h-5 w-5" /></div>
            <h3 className="mt-2 text-base font-semibold">{f.t}</h3>
            <p className="text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
