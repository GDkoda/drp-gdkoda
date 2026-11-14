import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Plus, ScrollText, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useCustomization } from "@/lib/app-customization";

export const Route = createFileRoute("/_authenticated/fichas/")({
  head: () => ({ meta: [{ title: "Fichas — Mesa 3D&T" }, { name: "description", content: "Seus personagens 3D&T Alpha." }] }),
  component: Fichas,
});

function Fichas() {
  const { text } = useCustomization();
  const { data: me } = useMe();
  const nav = useNavigate();
  const characters = useQuery({
    queryKey: ["chars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("id, name, concept, owner_id, f, h, r, a, pdf, xp")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const playersQuery = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_player_directory");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!me?.isMaster,
  });

  async function create() {
    if (!me?.id) {
      toast.error("Não foi possível identificar sua conta. Entre novamente.");
      return;
    }
    const { data, error } = await supabase.from("characters").insert({ owner_id: me.id }).select("id").single();
    if (error) {
      toast.error(error.message);
      return;
    }
    nav({ to: "/fichas/$id", params: { id: data.id } });
  }

  const chars = characters.data ?? [];
  const players = playersQuery.data ?? [];

  return (
    <div className="character-list-page space-y-5">
      <section className="character-list-hero">
        <div className="character-list-copy">
          <div className="character-list-kicker">
            <span className="character-list-kicker-mark"><ScrollText className="h-3.5 w-3.5" /></span>
            <span>PERSONAGENS · PROGRESSO · AVENTURA</span>
          </div>
          <h1>{me?.isMaster ? text("fichas_master_title") : text("fichas_title")}</h1>
          <p>Escolha um herói para abrir sua ficha, ajustar atributos e preparar a próxima aventura.</p>
          <div className="character-list-count">
            <Sparkles className="h-3.5 w-3.5" />
            <strong>{characters.isLoading ? "…" : chars.length}</strong>
            <span>{chars.length === 1 ? "personagem cadastrado" : "personagens cadastrados"}</span>
          </div>
        </div>
        <Button onClick={create} className="character-create-button">
          <Plus className="h-4 w-4" />
          <span>{text("fichas_new")}</span>
        </Button>
      </section>

      {characters.isLoading ? (
        <div className="character-loading-grid" aria-label="Carregando fichas">
          {[0, 1, 2].map((item) => <div key={item} className="character-card-skeleton" />)}
        </div>
      ) : characters.isError ? (
        <section className="character-list-empty">
          <div className="character-empty-icon"><ScrollText className="h-6 w-6" /></div>
          <h2>Não foi possível carregar as fichas</h2>
          <p>Confira sua conexão e tente carregar novamente.</p>
          <Button variant="outline" onClick={() => void characters.refetch()}>Tentar novamente</Button>
        </section>
      ) : chars.length === 0 ? (
        <section className="character-list-empty">
          <div className="character-empty-icon"><ScrollText className="h-6 w-6" /></div>
          <p className="character-list-kicker">SUA JORNADA COMEÇA AQUI</p>
          <h2>Sua próxima lenda ainda não foi escrita.</h2>
          <p>{text("fichas_empty")}</p>
          <Button onClick={create} className="mt-2"><Plus className="h-4 w-4" />Criar primeira ficha</Button>
        </section>
      ) : (
        <section className="character-list-section" aria-label="Personagens">
          <div className="character-list-section-heading">
            <div><h2>Suas fichas</h2><p>Toque em um personagem para abrir os detalhes.</p></div>
            <span>{chars.length} {chars.length === 1 ? "ficha" : "fichas"}</span>
          </div>
          <div className="character-list-grid">
            {chars.map((character) => {
              const active = me?.profile?.active_character_id === character.id;
              const owner = me?.isMaster
                ? players.find((player) => player.id === character.owner_id)?.display_name ?? "Jogador"
                : null;
              return (
                <Link
                  key={character.id}
                  to="/fichas/$id"
                  params={{ id: character.id }}
                  className={"character-list-card" + (active ? " is-active" : "")}
                  aria-label={"Abrir ficha de " + (character.name || "personagem sem nome")}
                >
                  <div className="character-card-topline">
                    <span className="character-card-avatar"><UserRound className="h-5 w-5" /></span>
                    <span className="character-card-status">
                      {active ? <><span className="character-active-dot" />FICHA ATIVA</> : "PERSONAGEM"}
                    </span>
                    <span className="character-card-open"><ArrowUpRight className="h-4 w-4" /></span>
                  </div>
                  <div className="character-card-name-row">
                    <h3>{character.name?.trim() || "Personagem sem nome"}</h3>
                  </div>
                  <p className="character-card-concept">{character.concept?.trim() || "Conceito ainda não definido"}</p>
                  {owner && <p className="character-card-owner">De <strong>{owner}</strong></p>}
                  <div className="character-card-attributes" aria-label="Atributos">
                    {([
                      ["F", character.f],
                      ["H", character.h],
                      ["R", character.r],
                      ["A", character.a],
                      ["PdF", character.pdf],
                    ] as const).map(([label, value]) => (
                      <span key={label} className="character-card-attribute">
                        <small>{label}</small><strong>{value ?? 0}</strong>
                      </span>
                    ))}
                  </div>
                  <div className="character-card-footer">
                    <span><Sparkles className="h-3.5 w-3.5" />{character.xp ?? 0} XP</span>
                    <span>Abrir ficha <ArrowUpRight className="h-3.5 w-3.5" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
