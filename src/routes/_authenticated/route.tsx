import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Beer, ScrollText, Store, Package, Crown, LogOut, Coins, Swords } from "lucide-react";

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
  const links = [
    { to: "/taverna", label: "Taverna", icon: Beer },
    { to: "/fichas", label: "Fichas", icon: ScrollText },
    { to: "/jogos", label: "Jogos", icon: Swords },
    { to: "/loja", label: "Loja", icon: Store },
    { to: "/bau", label: "Baú", icon: Package },
    ...(me?.isMaster ? [{ to: "/mestre", label: "Mestre", icon: Crown }] : []),
  ] as const;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="no-print sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2">
          <Link to="/taverna" className="font-display text-lg text-gold">3D&T</Link>
          <nav className="hidden gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="rounded px-3 py-1 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-gold" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-gold"><Coins className="h-4 w-4" />{me?.profile?.coins ?? "…"}</span>
            <span className="hidden text-muted-foreground sm:inline">{me?.profile?.display_name}</span>
            <button onClick={signOut} aria-label="Sair" className="text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5"><Outlet /></main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t bg-background md:hidden">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex flex-1 flex-col items-center py-2 text-[11px] text-muted-foreground" activeProps={{ className: "text-gold" }}>
            <l.icon className="h-5 w-5" />{l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
