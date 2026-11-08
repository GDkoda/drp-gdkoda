import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Beer, ScrollText, Store, Package, Crown, LogOut, Coins, Swords, BookOpen } from "lucide-react";
import { useCustomization } from "@/lib/app-customization";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { text } = useCustomization();
  const links = [
    { to: "/taverna", label: text("nav_taverna"), icon: Beer },
    { to: "/fichas", label: text("nav_fichas"), icon: ScrollText },
    { to: "/jogos", label: text("nav_jogos"), icon: Swords },
    { to: "/grimorio", label: "Grimório", icon: BookOpen },
    { to: "/lore", label: "Lore", icon: BookOpen },
    { to: "/loja", label: text("nav_loja"), icon: Store },
    { to: "/bau", label: text("nav_bau"), icon: Package },
    ...(me?.isMaster ? [{ to: "/mestre", label: text("nav_mestre"), icon: Crown }] : []),
  ] as const;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen pb-32 md:pb-0">
      <header className="no-print sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:px-5 sm:py-3 lg:px-8">
          <Link to="/taverna" className="flex min-w-0 max-w-[42%] shrink items-center gap-1.5 rounded-lg font-display text-sm font-bold tracking-wide text-gold sm:max-w-none sm:shrink-0 sm:gap-2 sm:text-xl"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-sm sm:h-9 sm:w-9">✦</span><span className="truncate">{text("brand")}</span></Link>
          <nav aria-label="Navegação principal" className="hidden min-w-0 flex-1 flex-wrap items-center justify-center gap-1 lg:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground" activeProps={{ className: "bg-primary/10 font-semibold text-gold" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2 lg:gap-3">
            <ThemeToggle />
            <span className="flex max-w-[6.5rem] shrink-0 items-center gap-1 rounded-xl border border-primary/25 bg-primary/10 px-2 py-1.5 text-xs font-semibold tabular-nums text-gold sm:max-w-none sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm"><Coins className="h-4 w-4" />{me?.profile?.coins ?? "…"}</span>
            <span className="hidden max-w-36 truncate text-sm text-muted-foreground xl:inline">{me?.profile?.display_name}</span>
            <button type="button" onClick={signOut} aria-label="Sair" title="Sair" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
        <nav aria-label="Navegação secundária" className="mx-auto hidden max-w-7xl flex-wrap items-center justify-center gap-1 px-3 pb-2 sm:px-5 md:flex lg:hidden">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground" activeProps={{ className: "bg-primary/10 font-semibold text-gold" }}>
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8"><Outlet /></main>
      <nav aria-label="Navegação principal" className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-border/80 bg-background/95 px-1 pt-1 pb-[max(env(safe-area-inset-bottom),.25rem)] shadow-[0_-10px_34px_rgb(0_0_0/0.16)] backdrop-blur-2xl md:hidden">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex min-h-[3.15rem] min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1.5 text-[9px] leading-tight transition-colors active:scale-95"
            activeProps={{ className: "bg-muted font-semibold text-gold", "aria-current": "page" }}
            inactiveProps={{ className: "text-muted-foreground" }}
          >
            <l.icon className="pointer-events-none h-[1.15rem] w-[1.15rem] shrink-0" />
            <span className="pointer-events-none max-w-full truncate">{l.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
