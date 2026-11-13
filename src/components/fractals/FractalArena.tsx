import groundImg from "@/assets/fractals/cemetery-ground.jpg";
import mausoleumImg from "@/assets/fractals/mausoleum.png";
import gravestoneImg from "@/assets/fractals/gravestone.png";
import crossImg from "@/assets/fractals/cross.png";
import candlesImg from "@/assets/fractals/candles.png";
import catUrnImg from "@/assets/fractals/cat-urn.png";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Heart, Move, Pause, Play, RotateCcw, RotateCw, Check, Shield, Skull, Sparkles, Swords, Zap, Maximize, UserRound, Gauge, ArrowLeft, ShoppingBag, Crown, Gem as GemIcon, MapPin, Flame, Leaf, Snowflake, Orbit, Lock, Link2, ChevronDown, Coins, Timer, Target, ZoomIn, ZoomOut, Volume2, VolumeX, Ban, Clover, Dna, BookOpen, Monitor, Keyboard, Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDifficultySnapshot } from "@/lib/fractals/difficulty";
import { fractalAudio } from "@/lib/fractals/audio";
import { CORRUPTION_LEVELS, FRACTAL_MISSIONS, RUN_DURATION_SECONDS } from "@/lib/fractals/config";
import { FRACTAL_SHOP, FRACTAL_RARITY_TIERS } from "@/lib/fractals/economy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "./fractal-arena.css";

type WeaponId = "void_revolver" | "unstable_core" | "spectral_scythe" | "orbital_swords" | "gravity_shackle" | "rune_sentinels";
type OmenId = "famine" | "rupture" | "spectral_veil" | "abundance" | "revenge";
type UpgradeId = "power" | "haste" | "vitality" | "swift" | "special_area" | "special_experience" | "special_projectile_range" | "special_projectiles" | "special_ricochet" | "special_piercing" | "special_chain_lightning" | "gift_revolver_mark" | "gift_revolver_echo" | "gift_revolver_weakpoint" | "gift_core_expansion" | "gift_core_implosion" | "gift_core_residue" | "gift_scythe_siphon" | "gift_scythe_arc" | "gift_scythe_cripple" | "gift_orbital_orbit" | "gift_orbital_edge" | "gift_orbital_velocity" | "gift_gravity_pressure" | "gift_gravity_resonance" | "gift_gravity_guard" | "gift_sentinel_focus" | "gift_sentinel_overload" | "gift_sentinel_relay" | "weapon_mastery" | "weapon_evolution" | "anchor_soul";
type Upgrade = { id: UpgradeId; name: string; description: string; icon: typeof Zap; rarity?: "normal" | "uncommon" | "rare" | "epic" | "legendary" | "maestria" | "evolution" };
type UpgradeCounts = Record<string, { name: string; count: number; rarity: string }>;

type Enemy = { x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; damage: number; color: string; xp: number; type: "wraith" | "brute" | "charger" | "elite" | "boss"; attack: number; flash: number; windup: number; targetX: number; targetY: number; dashTime: number; summonedAtHalf: boolean; furyTriggered: boolean; isExecutioner?: boolean; slowTimer?: number; slowFactor?: number };
type ShotKind =
  | "bullet"
  | "revolver_empowered"
  | "plasma_core"
  | "plasma_puddle"
  | "scythe_slash"
  | "orbital_blade"
  | "gravity_well"
  | "sentinel_beam"
  | "sentinel_explosion"
  | "dash_strike";

type Shot = {
  x: number; y: number; vx: number; vy: number; damage: number; life: number;
  hitTargets: Enemy[]; bouncesRemaining: number; piercesRemaining: number;
  isChainLightning?: boolean; isSplash?: boolean; isAnchorBurst?: boolean; targetEnemy?: Enemy;
  kind?: ShotKind; radius?: number; maxLife?: number; angle?: number; arcSpan?: number;
  bladeIndex?: number; totalBlades?: number; pulseTimer?: number; hasDetonated?: boolean;
  isAura?: boolean; active?: boolean;
};
type Gem = { x: number; y: number; value: number; radius: number; previousX?: number; previousY?: number; runeCrystal?: boolean };
type SpecialDrop = { x: number; y: number; kind: "area" | "experience" | "projectile_range" | "projectiles" | "ricochet" | "piercing" | "chain_lightning" | "food" | "void"; radius: number };
type SentinelTotem = { id: number; x: number; y: number; hp: number; maxHp: number; attackTimer: number; radius: number };
type BreakableUrn = { id: number; x: number; y: number; hp: number; maxHp: number; radius: number; broken: boolean; contactCooldown?: number };
type CemeteryObstacle = { x: number; y: number; radius: number; kind: "gravestone" | "cross" | "mausoleum" | "torch" };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type DamageNumber = { x: number; y: number; value: number; life: number; maxLife: number; drift: number };
type PickupLabel = { x: number; y: number; text: string; life: number; maxLife: number };
type ChallengeEvent = { id: 1 | 2; x: number; y: number; radius: number; remaining: number; progress: number };
type SpriteKey = "boss" | "elite" | "wraith" | "charger" | "brute" | "playerIdle" | "playerMove" | "playerCast" | "xpGem" | "specialXP" | "specialArea" | "specialRange" | "specialProjectiles" | "projectile";
type SpriteMap = Partial<Record<SpriteKey, HTMLImageElement>>;
type PlayerVisualAction = "idle" | "move" | "cast";
const WEAPON_CONFIG: Record<WeaponId, { name: string; description: string; price: number; purchaseKey: keyof PurchaseState | null; masteryKey: keyof PurchaseState; projectKey: keyof PurchaseState; evolutionName: string }> = {
  void_revolver: { name: "Revólver do Vazio", description: "Rajadas lineares de precisão; a cada seis disparos, uma bala dourada reforçada.", price: 0, purchaseKey: null, masteryKey: "mastery_void_revolver", projectKey: "evolution_void_revolver", evolutionName: "Seis Ecos" },
  unstable_core: { name: "Núcleo Instável", description: "Orbe lento de plasma que deixa uma poça corrosiva ampliada; seus pulsos atraem inimigos para o centro.", price: 8000, purchaseKey: "weapon_nucleus", masteryKey: "mastery_nucleus", projectKey: "evolution_nucleus", evolutionName: "Singularidade" },
  spectral_scythe: { name: "Foice Espectral", description: "Um arco cortante de quase 200° que se torna um golpe circular completo ao evoluir.", price: 9000, purchaseKey: "weapon_scythe", masteryKey: "mastery_scythe", projectKey: "evolution_scythe", evolutionName: "Ceifador de Almas" },
  orbital_swords: { name: "Espadas Orbitais", description: "Lâminas físicas permanecem em órbita e ferem ameaças por contato.", price: 10000, purchaseKey: "weapon_orbitals", masteryKey: "mastery_orbitals", projectKey: "evolution_orbitals", evolutionName: "Dança das Lâminas" },
  gravity_shackle: { name: "Grilhão Gravitacional", description: "Mantém um selo rúnico permanente; correntes alcançam inimigos a até o dobro do raio visual.", price: 11000, purchaseKey: "weapon_gravity", masteryKey: "mastery_gravity", projectKey: "evolution_gravity", evolutionName: "Prisão do Abismo" },
  rune_sentinels: { name: "Sentinelas Rúnicas", description: "Sentinelas orbitais disparam feixes rúnicos rápidos contra os alvos mais resistentes.", price: 12000, purchaseKey: "weapon_sentinels", masteryKey: "mastery_sentinels", projectKey: "evolution_sentinels", evolutionName: "Arsenal Ancestral" },
};

type ShopItemInfo = {
  title: string;
  category: string;
  summary: string;
  details: string[];
};

const SHOP_ITEM_INFO: Record<string, ShopItemInfo> = {
  health: { title: "Vida Reforçada", category: "Melhoria permanente", summary: "+10 de vida máxima por nível (até +150).", details: [
    "Cada nível comprado acrescenta permanentemente 10 pontos à vida máxima do personagem.",
    "São 15 níveis no total, chegando a +150 de vida máxima.",
    "O bônus já é aplicado no início de cada expedição."
  ]},
  projectile_duration: { title: "Duração de Projéteis", category: "Melhoria permanente", summary: "Projéteis permanecem ativos por mais tempo.", details: [
    "Aumenta a duração-base dos projéteis para que permaneçam ativos por mais tempo.",
    "Multiplicadores: nível 1 = 1,25x; nível 2 = 1,5x; nível 3 = 2x a duração inicial.",
    "O nível máximo dobra a duração-base. Não altera diretamente o dano do impacto."
  ]},
  rarity: { title: "Ressonância Rara", category: "Melhoria permanente", summary: "Aumenta a chance de receber Dádivas Raras.", details: [
    "Altera a distribuição das dádivas comuns que entram no sorteio de raridade.",
    "Nível 1: 85% Normal e 15% Rara. Nível 2: 75% Normal e 25% Rara. Nível 3: 65% Normal e 35% Rara.",
    "Não cria dádivas Épicas. A promoção de Rara para Épica é função exclusiva da Transmutação Rúnica.",
    "Relíquias de Campo e Dádivas Exclusivas de Arma têm raridade Incomum fixa e não participam desse sorteio."
  ]},
  speed_2x: { title: "Aceleração 2x", category: "Melhoria permanente", summary: "Libera a velocidade 2× durante a expedição.", details: [
    "Libera a opção de velocidade 2x no menu de pausa durante uma expedição.",
    "É um desbloqueio permanente e não precisa ser comprado novamente a cada partida."
  ]},
  speed_3x: { title: "Aceleração 3x", category: "Melhoria permanente", summary: "Libera 3× após a Aceleração 2×.", details: [
    "Libera a opção de velocidade 3x no menu de pausa durante uma expedição.",
    "É necessário possuir a Aceleração 2x antes de comprar este desbloqueio.",
    "O desbloqueio é permanente."
  ]},
  dash: { title: "Ruptura Cinética", category: "Melhoria permanente", summary: "Aprimora o dash: invulnerabilidade, impacto e uma segunda investida.", details: [
    "Nível 1: concede invulnerabilidade durante toda a duração do dash. Sem este nível, o dash continua servindo apenas para mobilidade.",
    "Nível 2: atravessar inimigos durante o dash causa dano equivalente a 10% do dano-base do golpe da arma equipada. Cada inimigo pode ser atingido uma vez por investida.",
    "Nível 3: permite uma segunda investida em sequência, com uma janela curta para acioná-la. Você pode mudar a direção entre as investidas e também corrigir a direção enquanto estiver avançando. Depois da sequência, o dash entra em recarga.",
    "Desbloqueio permanente em três níveis. Custos: 3.000, 8.500 e 22.000 FR."
  ]},
  reroll: { title: "Rerrolagem de Dádivas", category: "Controle das escolhas", summary: "+1 rerrolagem por nível, a cada expedição.", details: [
    "Cada nível comprado concede uma rerrolagem adicional em cada expedição.",
    "Você pode trocar o conjunto atual de dádivas oferecidas ao subir de nível.",
    "Máximo: 10 níveis e 10 rerrolagens por expedição. Desbloqueia a partir da Corrupção 1."
  ]},
  oracle: { title: "Oráculo das Relíquias", category: "Controle das escolhas", summary: "Desbloqueia Relíquias de Campo e chance de 4ª carta.", details: [
    "No nível 1, libera as quatro Relíquias de Campo básicas nas escolhas de subida de nível: Vórtice Coletor, Afinidade de XP, Alcance Arcano e Coroa de Estilhaços.",
    "Também concede uma chance de surgir uma quarta carta independente. A chance por nível é: 1 = 6%, 2 = 12%, 3 = 18%, 4 = 24%, 5 = 30%, 6 = 36%, 7 = 42%, 8 = 48%, 9 = 50% e 10 = 50%.",
    "A quarta carta pode ser uma Relíquia de Campo elegível ou uma Dádiva Exclusiva da arma equipada. As dádivas de arma respeitam os banimentos e o limite de 3 níveis.",
    "O Oráculo aumenta a quantidade de opções, não a raridade: Relíquias de Campo e Dádivas Exclusivas continuam sendo Incomuns."
  ]},
  banish: { title: "Selo do Exílio", category: "Controle das escolhas", summary: "+1 exílio por nível para banir uma dádiva por partida.", details: [
    "Cada nível concede um exílio para a expedição.",
    "Ao banir uma opção apresentada, ela é removida da seleção e não volta a aparecer naquela partida.",
    "Máximo: 5 exílios por expedição."
  ]},
  fortune: { title: "Fortuna Fractal", category: "Recompensas", summary: "Aumenta a chance relativa de espólios especiais.", details: [
    "Cada nível aumenta em 10% a chance relativa de encontrar recompensas especiais, até +50% no nível 5.",
    "Afeta as chances de recompensas especiais de urnas e de espólios associados a Brutos e Elites, incluindo Relíquias de Campo elegíveis.",
    "O bônus é relativo e respeita os limites máximos de chance definidos pelo jogo; não significa um acréscimo direto de 10 pontos percentuais."
  ]},
  transmutation: { title: "Transmutação Rúnica", category: "Raridade", summary: "Pode promover Dádivas Raras à categoria Épica.", details: [
    "Quando uma dádiva elegível é sorteada como Rara, existe uma chance adicional de promovê-la para Épica.",
    "Nível 1: 3% por resultado Raro. Nível 2: 6%. Nível 3: 10%.",
    "Não aumenta a chance de encontrar resultados Raros; essa parte pertence à Ressonância Rara.",
    "Relíquias de Campo e Dádivas Exclusivas de Arma são Incomuns fixas e não recebem essa promoção."
  ]},
  anchor_soul: { title: "Âncora da Alma", category: "Sobrevivência", summary: "Permite reviver; aprimora a ressurreição por nível.", details: [
    "Você só pode manter uma Âncora disponível por vez, mas pode obter até duas ressurreições na mesma expedição.",
    "Nível 1: retorna com 40% da vida máxima e 3 segundos de invulnerabilidade.",
    "Nível 2: melhora o retorno para 60% da vida máxima e 6 segundos de invulnerabilidade.",
    "Nível 3: na segunda morte, além da ressurreição, libera uma explosão ao redor do personagem que atinge inimigos próximos."
  ]},
  omen_archive: { title: "Arquivo dos Presságios", category: "Modificadores de expedição", summary: "Abre 5 Presságios; escolha 1 antes da expedição.", details: [
    "Abre a categoria Presságios do Arsenal e permite selecionar um modificador antes da expedição.",
    "Existem cinco opções, cada uma com bônus e ônus próprios. Apenas um Presságio pode ser escolhido por expedição.",
    "Requer Corrupção 4. Depois de adquirido, não há custo adicional para selecionar um Presságio."
  ]},
  archive_sealed: { title: "Arquivo dos Presságios", category: "Modificadores de expedição", summary: "Desbloqueie o Arquivo para escolher um Presságio.", details: [
    "Esta categoria permanece selada até a compra do Arquivo dos Presságios na aba Permanentes.",
    "O desbloqueio exige Corrupção 4.",
    "Após abrir o arquivo, você poderá selecionar um dos cinco Presságios para cada expedição, sem custo adicional."
  ]},
  area: { title: "Vórtice Coletor", category: "Relíquia de Campo", summary: "Cada coleta aumenta o raio de coleta em 10%.", details: [
    "Ao encontrar e coletar esta Relíquia de Campo durante a expedição, o raio de coleta aumenta em 10%.",
    "O efeito acumula até 10 vezes, chegando a +100% de raio de coleta.",
    "A compra do nível 1 libera a relíquia. Os níveis 2, 3 e 4 elevam a chance geral de queda de Relíquias de Campo para 1%, 3% e 5%, conforme o maior nível comprado entre as relíquias de campo."
  ]},
  experience: { title: "Afinidade de XP", category: "Relíquia de Campo", summary: "Cada coleta concede +5% de experiência.", details: [
    "Cada coleta da relíquia concede +5% de experiência recebida.",
    "O efeito acumula até 10 vezes, chegando a +50% de experiência.",
    "O nível 1 libera a relíquia. Os níveis 2 a 4 também contribuem para a chance geral de queda de Relíquias de Campo: 1%, 3% e 5% no maior nível comprado."
  ]},
  projectile_range: { title: "Alcance Arcano", category: "Relíquia de Campo", summary: "Cada coleta amplia em 10% o alcance da arma.", details: [
    "Cada coleta aumenta em 10% o alcance útil da arma equipada.",
    "O efeito acumula até 5 vezes, chegando a +50%. Afeta projéteis, órbitas, áreas e feixes compatíveis.",
    "O nível 1 libera a relíquia. Os níveis 2 a 4 também contribuem para a chance geral de queda de Relíquias de Campo: 1%, 3% e 5% no maior nível comprado."
  ]},
  projectiles: { title: "Coroa de Estilhaços", category: "Relíquia de Campo", summary: "Adapta o bônus à arma; até 2 coletas.", details: [
    "O efeito depende da arma equipada: Revólver e Núcleo recebem projéteis adicionais; Espadas Orbitais recebem lâminas adicionais; Sentinelas recebem totens adicionais.",
    "Com a Foice Espectral, cada coleta concede +12% de dano. Com o Grilhão Gravitacional, cada coleta aumenta o raio da aura em 6%.",
    "O efeito acumula até 2 coletas.",
    "O nível 1 da compra libera a relíquia. Os níveis 2 a 4 aumentam a chance geral de queda de Relíquias de Campo para 1%, 3% e 5%, conforme o maior nível comprado."
  ]},
  ricochet: { title: "Ricochete Arcano", category: "Relíquia de Campo", summary: "Revólver e Núcleo ganham +1 ricochete por coleta.", details: [
    "Disponível apenas para o Revólver do Vazio e o Núcleo Instável.",
    "Cada coleta concede +1 ricochete adicional, até 3 acúmulos.",
    "A compra do nível 1 libera a relíquia. Os níveis 2 e 3 aumentam a chance geral de queda de Relíquias de Campo, compartilhada com as demais relíquias."
  ]},
  piercing: { title: "Perfuração Espectral", category: "Relíquia de Campo", summary: "Revólver e Núcleo atravessam +1 inimigo por coleta.", details: [
    "Disponível apenas para o Revólver do Vazio e o Núcleo Instável.",
    "Cada coleta concede +1 inimigo atravessado, até 3 acúmulos. Os projéteis mantêm o dano ao atravessar os alvos.",
    "A compra do nível 1 libera a relíquia. Os níveis 2 e 3 aumentam a chance geral de queda de Relíquias de Campo, compartilhada com as demais relíquias."
  ]},
  chain_lightning: { title: "Descarga em Cadeia", category: "Relíquia de Campo", summary: "Impactos saltam para inimigos próximos.", details: [
    "Disponível apenas para o Revólver do Vazio e o Núcleo Instável.",
    "Nível de coleta 1: salta para 1 alvo com 55% do dano; nível 2: 2 alvos com 65%; nível 3: 3 alvos com 75%.",
    "A compra do nível 1 libera a relíquia. Os níveis 2 e 3 aumentam a chance geral de queda de Relíquias de Campo, compartilhada com as demais relíquias."
  ]},
  weapon_void_revolver: { title: "Revólver do Vazio", category: "Arma", summary: "Rajadas precisas; a cada 6 tiros, uma bala dourada.", details: [
    "Arma inicial e gratuita. Dispara em linha na direção do alvo e prepara um disparo dourado reforçado a cada seis tiros.",
    "A maestria é concluída ao vencer uma expedição usando esta arma.",
    "Depois da maestria, o Projeto de Evolução custa 5.000 FR. Com a arma no nível 10, a evolução Seis Ecos pode aparecer nas escolhas."
  ]},
  weapon_unstable_core: { title: "Núcleo Instável", category: "Arma", summary: "Orbe de plasma deixa poça corrosiva que atrai inimigos.", details: [
    "Dispara um orbe de plasma lento que deixa uma poça corrosiva. Os pulsos da poça causam dano e atraem inimigos para o centro.",
    "Desbloqueio permanente: 8.000 FR.",
    "Vença uma expedição com a arma para concluir a maestria. Depois, compre o Projeto de Evolução por 5.000 FR; no nível 10 da arma, a evolução Singularidade pode aparecer."
  ]},
  weapon_spectral_scythe: { title: "Foice Espectral", category: "Arma", summary: "Corte amplo em arco; evolui para um golpe circular.", details: [
    "Executa um corte em arco de quase 200° ao redor do personagem.",
    "Desbloqueio permanente: 9.000 FR.",
    "Vença uma expedição com a arma para concluir a maestria. Depois, compre o Projeto de Evolução por 5.000 FR; no nível 10 da arma, a evolução Ceifador de Almas pode aparecer."
  ]},
  weapon_orbital_swords: { title: "Espadas Orbitais", category: "Arma", summary: "Lâminas orbitais ferem inimigos por contato.", details: [
    "Lâminas físicas permanecem em órbita ao redor do personagem e ferem inimigos ao tocá-los.",
    "Desbloqueio permanente: 10.000 FR.",
    "Vença uma expedição com a arma para concluir a maestria. Depois, compre o Projeto de Evolução por 5.000 FR; no nível 10 da arma, a evolução Dança das Lâminas pode aparecer."
  ]},
  weapon_gravity_shackle: { title: "Grilhão Gravitacional", category: "Arma", summary: "Selo permanente; correntes alcançam o dobro do raio visual.", details: [
    "O selo rúnico permanece sempre visível. O raio visual não limita o alcance: as correntes atingem alvos a até 2× essa distância.",
    "Cada corrente concentra o dano de dois pulsos em um único impacto. Intervalo: 0,9 s na forma base e 0,7 s na evolução.",
    "Desbloqueio permanente: 11.000 FR.",
    "Vença uma expedição com a arma para concluir a maestria. Depois, compre o Projeto de Evolução por 5.000 FR; no nível 10 da arma, a evolução Prisão do Abismo pode aparecer."
  ]},
  weapon_rune_sentinels: { title: "Sentinelas Rúnicas", category: "Arma", summary: "Totens orbitais disparam feixes contra alvos resistentes.", details: [
    "Invoca sentinelas orbitais que disparam feixes rúnicos rápidos contra inimigos mais resistentes.",
    "Desbloqueio permanente: 12.000 FR.",
    "Vença uma expedição com a arma para concluir a maestria. Depois, compre o Projeto de Evolução por 5.000 FR; no nível 10 da arma, a evolução Arsenal Ancestral pode aparecer."
  ]},
  omen_famine: { title: "Fome Insaciável", category: "Presságio", summary: "+20% de XP; inimigos surgem 20% mais rápido.", details: [
    "Bônus: +20% de experiência recebida.",
    "Ônus: +20% na frequência de surgimento de inimigos."
  ]},
  omen_rupture: { title: "Ruptura", category: "Presságio", summary: "+20% de dano; intervalo entre ataques +15%.", details: [
    "Bônus: +20% de dano das armas.",
    "Ônus: +15% no intervalo entre ataques, reduzindo a frequência de disparo."
  ]},
  omen_spectral_veil: { title: "Véu Espectral", category: "Presságio", summary: "+15% de movimento; -15% de vida máxima.", details: [
    "Bônus: +15% de velocidade de movimento.",
    "Ônus: -15% de vida máxima."
  ]},
  omen_abundance: { title: "Abundância", category: "Presságio", summary: "+25% de chance relativa de espólios; inimigos +15% de vida.", details: [
    "Bônus: +25% de chance relativa de recompensas especiais.",
    "Ônus: inimigos recebem +15% de vida."
  ]},
  omen_revenge: { title: "Vingança", category: "Presságio", summary: "Ao sofrer dano, libera uma onda ofensiva; -10% de vida máxima.", details: [
    "Efeito: ao sofrer dano, libera uma onda ofensiva contra inimigos próximos; a ativação tem intervalo interno de 4 segundos.",
    "Ônus: -10% de vida máxima."
  ]}
};

function ShopInfoButton({ info, onOpen }: { info: ShopItemInfo; onOpen: (info: ShopItemInfo) => void }) {
  return (
    <button type="button" className="fractals-shop-info-trigger" title="Informações"
      aria-label={`Informações sobre ${info.title}`} aria-haspopup="dialog"
      onClick={(event) => { event.stopPropagation(); onOpen(info); }}>
      <span className="fractals-shop-info-diamond" aria-hidden="true">
        <Diamond className="fractals-shop-info-diamond__shape" />
        <span className="fractals-shop-info-diamond__letter">i</span>
      </span>
    </button>
  );
}

const OMEN_CONFIG: Record<OmenId, { name: string; description: string }> = {
  famine: { name: "Fome Insaciável", description: "+20% de experiência e +20% de frequência de surgimento de inimigos." },
  rupture: { name: "Ruptura", description: "+20% de dano das armas, mas +15% no intervalo entre ataques." },
  spectral_veil: { name: "Véu Espectral", description: "+15% de velocidade de movimento, mas -15% de vida máxima." },
  abundance: { name: "Abundância", description: "+25% de chance relativa de recompensas especiais; inimigos têm +15% de vida." },
  revenge: { name: "Vingança", description: "Ao sofrer dano, libera uma onda ofensiva próxima. -10% de vida máxima." },
};

type PurchaseState = {
  area: number; experience: number; rarity: number; speed_2x: boolean; speed_3x: boolean;
  health: number; projectile_duration: number; projectile_range: number; projectiles: number;
  ricochet: number; piercing: number; chain_lightning: number;
  reroll: number; oracle: number; banish: number; fortune: number; transmutation: number;
  anchor_soul: number; dash: number; omen_archive: boolean;
  weapon_nucleus: boolean; weapon_scythe: boolean; weapon_orbitals: boolean; weapon_gravity: boolean; weapon_sentinels: boolean;
  mastery_void_revolver: boolean; mastery_nucleus: boolean; mastery_scythe: boolean; mastery_orbitals: boolean; mastery_gravity: boolean; mastery_sentinels: boolean;
  evolution_void_revolver: boolean; evolution_nucleus: boolean; evolution_scythe: boolean; evolution_orbitals: boolean; evolution_gravity: boolean; evolution_sentinels: boolean;
};
const DEFAULT_PURCHASES: PurchaseState = {
  area: 0, experience: 0, rarity: 0, speed_2x: false, speed_3x: false,
  health: 0, projectile_duration: 0, projectile_range: 0, projectiles: 0,
  ricochet: 0, piercing: 0, chain_lightning: 0,
  reroll: 0, oracle: 0, banish: 0, fortune: 0, transmutation: 0,
  anchor_soul: 0, dash: 0, omen_archive: false,
  weapon_nucleus: false, weapon_scythe: false, weapon_orbitals: false, weapon_gravity: false, weapon_sentinels: false,
  mastery_void_revolver: false, mastery_nucleus: false, mastery_scythe: false, mastery_orbitals: false, mastery_gravity: false, mastery_sentinels: false,
  evolution_void_revolver: false, evolution_nucleus: false, evolution_scythe: false, evolution_orbitals: false, evolution_gravity: false, evolution_sentinels: false,
};
const PROJECTILE_DURATION_MULTIPLIERS = [1, 1.25, 1.5, 2] as const;
const PROJECTILE_BASE_LIFE = 0.8;
const MAX_AREA_RELIC_STACKS = 10;
const MAX_EXPERIENCE_RELIC_STACKS = 10;
const MAX_PROJECTILE_RANGE_STACKS = 5;
const MAX_EXTRA_PROJECTILES = 2;
const ORACLE_FOURTH_CHOICE_CHANCE = [0, 6, 12, 18, 24, 30, 36, 42, 48, 50, 50] as const;
const WORLD_LIMIT = 1300;
const CHALLENGE_EVENT_TIMES = [240, 480] as const;
const RITUAL_DURATION = 25;
const RITUAL_WINDOW = 50;
const EXECUTIONER_WINDOW = 60;
function parsePurchaseState(raw: any): PurchaseState {
  const defaults = DEFAULT_PURCHASES;
  const numericKeys = ["area","experience","rarity","health","projectile_duration","projectile_range","projectiles","ricochet","piercing","chain_lightning","reroll","oracle","banish","fortune","transmutation","anchor_soul","dash"] as const;
  const booleanKeys = Object.keys(defaults).filter((key) => !numericKeys.includes(key as typeof numericKeys[number])) as Array<keyof PurchaseState>;
  const parsed = { ...defaults, ...raw } as PurchaseState;
  for (const key of numericKeys) {
    const value = raw?.[key];
    // Níveis são numéricos; booleanos antigos não podem ativar relíquias por acidente.
    if (key === "anchor_soul" && value === true) parsed[key] = 1;
    else {
      const numericValue = typeof value === "number" || typeof value === "string" ? Number(value) : 0;
      parsed[key] = Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : 0;
    }
  }
  for (const key of booleanKeys) (parsed as any)[key] = Boolean(raw?.[key] ?? false);
  return parsed;
}

type GameState = {
  width: number; height: number; last: number; elapsed: number; spawnTimer: number; shotTimer: number; bossSpawned: boolean;
  player: { x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; fireRate: number; invuln: number; hitFlash: number; xp: number; nextXp: number; level: number; pickupRadius: number; xpMultiplier: number; specialAreaStacks: number; specialExperienceStacks: number; projectileRangeStacks: number; projectileRangeMultiplier: number; projectileStacks: number; relicRicochet: number; relicPiercing: number; relicChainLightning: number; projectileLife: number; facing: number; castFacing: number; castTimer: number; moving: boolean; dashTimer: number; dashCooldown: number; dashX: number; dashY: number; spriteAction: PlayerVisualAction; spriteDirection: number; previousSpriteAction: PlayerVisualAction; previousSpriteDirection: number; spriteBlend: number };
  enemies: Enemy[]; shots: Shot[]; gems: Gem[]; specialDrops: SpecialDrop[]; sentinelTotems: SentinelTotem[]; sentinelRespawnTimer: number; nextSentinelTotemId: number; urns: BreakableUrn[]; obstacles: CemeteryObstacle[]; nextUrnMinute: number; nextUrnId: number; particles: Particle[]; damageNumbers: DamageNumber[]; pickupLabels: PickupLabel[]; challengeEvent: ChallengeEvent | null; nextChallengeEvent: number; kills: number; ended: boolean; upgradeCounts: UpgradeCounts; totalDamageDealt: number; crystalsCollected: number; highestLevel: number;
  weaponId: WeaponId; weaponLevel: number; evolved: boolean; rerollsRemaining: number; banishesRemaining: number; bannedUpgradeIds: string[];
  revolverShotCount?: number; orbitalPulseTimer?: number;
  gravityAuraActive?: boolean; gravityAuraShot?: Shot;
  gravityTethers?: { id: number; enemy: Enemy; duration: number }[]; gravityAuraTimer2?: number;
  scytheSiphonCooldown?: number; dashChainRemaining: number; dashChainWindow: number; dashHitTargets: Set<Enemy>;
  anchorReviveAvailable: boolean; anchorRevivesUsed: number; omenId: OmenId | null; omenSpawnMultiplier: number; omenEnemyHpMultiplier: number; omenRewardMultiplier: number; omenRevengeCooldown: number; lastObservedHp: number;
  shake?: number; rings?: { x: number; y: number; r: number; max: number; life: number; color: string }[];
};

const UPGRADES: Upgrade[] = [
  { id: "power", name: "Estilhaço Voraz", description: "Aumenta o dano dos disparos em 30%.", icon: Swords },
  { id: "haste", name: "Pulso Acelerado", description: "Dispara 18% mais rápido.", icon: Zap },
  { id: "vitality", name: "Casca de Cristal", description: "Recupera 25% da vida máxima e aumenta a vida em 15%.", icon: Shield },
  { id: "swift", name: "Passos do Errante", description: "Aumenta a velocidade de movimento em 10%.", icon: Move },
];

const SPECIAL_UPGRADES: Upgrade[] = [
  { id: "special_area", name: "Ímã de Fragmentos", description: "+10% de alcance de coleta por coleta (máx. +100%, 10 coletas); também amplia áreas de ataque compatíveis.", icon: Move },
  { id: "special_experience", name: "Eco do Conhecimento", description: "+5% de experiência por coleta (máx. +50%, 10 coletas).", icon: Sparkles },
  { id: "special_projectile_range", name: "Ressonância de Alcance", description: "+10% de alcance útil da arma por coleta (máx. +50%).", icon: Zap },
  { id: "special_projectiles", name: "Coroa de Estilhaços", description: "Adapta-se à arma: +1 bala/orbe/lâmina/totem ou +12% de dano da Foice por coleta; o Grilhão recebe +6% de raio (máx. 2).", icon: Swords },
  { id: "special_ricochet", name: "Ricochete Instável", description: "Revólver e Núcleo ganham +1 ricochete por nível (máx. 3).", icon: Orbit },
  { id: "special_piercing", name: "Perfuração Espectral", description: "Revólver e Núcleo atravessam +1 inimigo por nível (máx. 3).", icon: Target },
  { id: "special_chain_lightning", name: "Descarga em Cadeia", description: "Impactos do Revólver e do Núcleo saltam para +1 alvo por nível (máx. 3).", icon: Zap },
];

const WEAPON_GIFTS: Record<WeaponId, Upgrade[]> = {
  void_revolver: [
    { id: "gift_revolver_mark", name: "Marca do Predador", description: "Dano contra Elites e Chefes +12% por nível.", icon: Target, rarity: "uncommon" },
    { id: "gift_revolver_echo", name: "Sexto Eco", description: "O disparo dourado do Revólver recebe +1 ricochete por nível.", icon: Orbit, rarity: "uncommon" },
    { id: "gift_revolver_weakpoint", name: "Ponto de Ruptura", description: "Causa +12% de dano por nível contra inimigos acima de 70% da vida.", icon: Target, rarity: "uncommon" },
  ],
  unstable_core: [
    { id: "gift_core_expansion", name: "Campo Devorador", description: "A poça do Núcleo aumenta seu raio em 12% por nível.", icon: Orbit, rarity: "uncommon" },
    { id: "gift_core_implosion", name: "Implosão Concentrada", description: "A atração de cada pulso da poça fica mais forte em 3 unidades por nível.", icon: Move, rarity: "uncommon" },
    { id: "gift_core_residue", name: "Rastro Persistente", description: "A poça corrosiva permanece ativa por +0,3s por nível.", icon: Timer, rarity: "uncommon" },
  ],
  spectral_scythe: [
    { id: "gift_scythe_siphon", name: "Sede de Almas", description: "Abates com a Foice recuperam 1,5% da vida máxima por nível. Recarga: 1,8s.", icon: Heart, rarity: "uncommon" },
    { id: "gift_scythe_arc", name: "Arco do Ceifador", description: "O alcance do corte aumenta em 12% por nível.", icon: Swords, rarity: "uncommon" },
    { id: "gift_scythe_cripple", name: "Corte Entorpecente", description: "Os cortes reduzem a velocidade dos atingidos em 20%, 25% ou 30% por 0,7s conforme o nível.", icon: Snowflake, rarity: "uncommon" },
  ],
  orbital_swords: [
    { id: "gift_orbital_orbit", name: "Órbita Distante", description: "As lâminas orbitam 12% mais longe por nível.", icon: Orbit, rarity: "uncommon" },
    { id: "gift_orbital_edge", name: "Fio Astral", description: "Dano de contato das lâminas +12% por nível.", icon: Swords, rarity: "uncommon" },
    { id: "gift_orbital_velocity", name: "Dança Acelerada", description: "A velocidade de rotação das lâminas aumenta em 12% por nível.", icon: RotateCw, rarity: "uncommon" },
  ],
  gravity_shackle: [
    { id: "gift_gravity_pressure", name: "Peso Abissal", description: "A lentidão da aura fica 4 pontos percentuais mais forte por nível, até 42% de redução de velocidade.", icon: Move, rarity: "uncommon" },
    { id: "gift_gravity_resonance", name: "Ressonância do Abismo", description: "Dano dos impactos das correntes +15% por nível.", icon: Sparkles, rarity: "uncommon" },
    { id: "gift_gravity_guard", name: "Manto Inabalável", description: "Enquanto a aura está ativa, dano recebido -5% por nível (máx. -15%).", icon: Shield, rarity: "uncommon" },
  ],
  rune_sentinels: [
    { id: "gift_sentinel_focus", name: "Mirada do Vigia", description: "Dano dos feixes das Sentinelas +12% por nível.", icon: Target, rarity: "uncommon" },
    { id: "gift_sentinel_overload", name: "Sobrecarga Final", description: "Explosão de uma Sentinela: dano +15% e raio +12% por nível.", icon: Zap, rarity: "uncommon" },
    { id: "gift_sentinel_relay", name: "Rede de Vigília", description: "As Sentinelas disparam 10% mais rápido por nível.", icon: Timer, rarity: "uncommon" },
  ],
};

function supportsProjectileRelics(weapon: WeaponId): boolean {
  return weapon === "void_revolver" || weapon === "unstable_core";
}

function getEligibleWeaponGifts(game: GameState): Upgrade[] {
  return WEAPON_GIFTS[game.weaponId].filter((gift) =>
    !game.bannedUpgradeIds.includes(gift.id) && (game.upgradeCounts[gift.id]?.count ?? 0) < 3
  );
}

const MASTER_GIFT_OPTIONS: Upgrade[] = [
  ...UPGRADES,
  ...SPECIAL_UPGRADES,
  ...Object.values(WEAPON_GIFTS).flat(),
  { id: "anchor_soul", name: "Âncora da Alma", description: "Concede uma ressurreição adicional.", icon: Heart },
  { id: "weapon_mastery", name: "Ressonância da Arma", description: "Aumenta em um nível a arma equipada.", icon: Swords, rarity: "maestria" },
  { id: "weapon_evolution", name: "Evolução da Arma", description: "Desperta a forma evoluída da arma equipada.", icon: Crown, rarity: "evolution" },
];

function weaponProjectKey(weapon: WeaponId) {
  return ({ void_revolver: "evolution_void_revolver", unstable_core: "evolution_nucleus", spectral_scythe: "evolution_scythe", orbital_swords: "evolution_orbitals", gravity_shackle: "evolution_gravity", rune_sentinels: "evolution_sentinels" } as const)[weapon];
}
function getEligibleFieldRelics(game: GameState, purchases: PurchaseState): Upgrade[] {
  const oracleUnlocksFieldRelics = purchases.oracle >= 1;
  const projectileRelicsSupported = supportsProjectileRelics(game.weaponId);
  return SPECIAL_UPGRADES.filter((item) => {
    if (game.bannedUpgradeIds.includes(item.id)) return false;
    if (item.id === "special_area") return (oracleUnlocksFieldRelics || purchases.area >= 1) && game.player.specialAreaStacks < MAX_AREA_RELIC_STACKS;
    if (item.id === "special_experience") return (oracleUnlocksFieldRelics || purchases.experience >= 1) && game.player.specialExperienceStacks < MAX_EXPERIENCE_RELIC_STACKS;
    if (item.id === "special_projectile_range") return (oracleUnlocksFieldRelics || purchases.projectile_range >= 1) && game.player.projectileRangeStacks < MAX_PROJECTILE_RANGE_STACKS;
    if (item.id === "special_projectiles") return (oracleUnlocksFieldRelics || purchases.projectiles >= 1) && game.player.projectileStacks < MAX_EXTRA_PROJECTILES;
    if (item.id === "special_ricochet") return projectileRelicsSupported && purchases.ricochet >= 1 && game.player.relicRicochet < 3;
    if (item.id === "special_piercing") return projectileRelicsSupported && purchases.piercing >= 1 && game.player.relicPiercing < 3;
    if (item.id === "special_chain_lightning") return projectileRelicsSupported && purchases.chain_lightning >= 1 && game.player.relicChainLightning < 3;
    return false;
  });
}
function buildLevelChoices(game: GameState, purchases: PurchaseState): Upgrade[] {
  const corePool = UPGRADES.filter((item) => !game.bannedUpgradeIds.includes(item.id)).sort(() => Math.random() - 0.5);
  const core = corePool.slice(0, 2);
  const choices: Upgrade[] = [...core];
  if (game.weaponLevel < 10) {
    choices.push({ id: "weapon_mastery", name: "Ressonância da Arma", description: "Aumenta em um nível a arma escolhida, aprimorando seu comportamento. Máximo: nível 10.", icon: Swords, rarity: "maestria" });
  } else if (corePool[2]) {
    choices.push(corePool[2]);
  }

  const fieldRelics = getEligibleFieldRelics(game, purchases);
  if (fieldRelics.length && Math.random() < 0.18) {
    const field = fieldRelics[Math.floor(Math.random() * fieldRelics.length)];
    const replaceAt = Math.floor(Math.random() * Math.min(2, choices.length));
    if (choices.length > 0) choices[replaceAt] = field; else choices.push(field);
  }

  if (purchases.anchor_soul >= 1 && !game.bannedUpgradeIds.includes("anchor_soul") && !game.anchorReviveAvailable && game.anchorRevivesUsed < 2 && Math.random() < 0.10) {
    const replaceAt = Math.floor(Math.random() * Math.min(2, choices.length));
    const anchorDescription = purchases.anchor_soul >= 3
      ? "Concede uma ressurreição: retorna com 60% da vida e 6 segundos de invulnerabilidade. Na segunda morte, explode e causa dano igual ao golpe da arma equipada a todos os monstros próximos."
      : purchases.anchor_soul >= 2
        ? "Concede uma ressurreição: retorna com 60% da vida e 6 segundos de invulnerabilidade. Você pode obter até duas Âncoras por expedição, uma de cada vez."
        : "Concede uma ressurreição: retorna com 40% da vida e 3 segundos de invulnerabilidade. Você pode obter até duas Âncoras por expedição, uma de cada vez.";
    const anchorGift: Upgrade = { id: "anchor_soul", name: "Âncora da Alma", description: anchorDescription, icon: Heart, rarity: "uncommon" };
    if (choices.length > 0) choices[replaceAt] = anchorGift; else choices.push(anchorGift);
  }

  if (game.weaponLevel >= 10 && !game.evolved && purchases[weaponProjectKey(game.weaponId)] && Math.random() < 0.33) {
    const evolutionNames: Record<WeaponId, string> = {
      void_revolver: "Seis Ecos", unstable_core: "Singularidade", spectral_scythe: "Ceifador de Almas",
      orbital_swords: "Dança das Lâminas", gravity_shackle: "Prisão do Abismo", rune_sentinels: "Arsenal Ancestral",
    };
    const evolutionIndex = Math.floor(Math.random() * Math.min(2, choices.length));
    const evolutionGift: Upgrade = {
      id: "weapon_evolution", name: evolutionNames[game.weaponId],
      description: "Evolução lendária: transforma permanentemente o comportamento da arma nesta expedição.",
      icon: Crown, rarity: "evolution",
    };
    if (choices.length > 0) choices[evolutionIndex] = evolutionGift; else choices.push(evolutionGift);
  }

  const availableWeaponGifts = getEligibleWeaponGifts(game);
  const basicChoiceSlots = choices
    .map((choice, index) => ({ choice, index }))
    .filter(({ choice }) => ["power", "haste", "vitality", "swift"].includes(choice.id))
    .map(({ index }) => index);
  if (availableWeaponGifts.length && basicChoiceSlots.length && Math.random() < 0.24) {
    const slot = basicChoiceSlots[Math.floor(Math.random() * basicChoiceSlots.length)];
    const weaponGift = availableWeaponGifts[Math.floor(Math.random() * availableWeaponGifts.length)];
    choices[slot] = weaponGift;
  }

  const transmutationChance = [0, 3, 6, 10][Math.max(0, Math.min(3, purchases.transmutation))];
  const withRarity = choices.map((upgrade) => {
    const isUncommonRelic = upgrade.id.startsWith("special_") || upgrade.id.startsWith("gift_") || upgrade.id === "anchor_soul";
    return {
      ...upgrade,
      // Relíquias são Incomuns fixas: não entram no sorteio nem recebem bônus de raridade.
      rarity: upgrade.rarity ?? (isUncommonRelic ? "uncommon" : rollUpgradeRarity(purchases.rarity, transmutationChance)),
    };
  });

  // Oráculo: a quarta carta pode ser uma Relíquia de Campo ou uma Dádiva Exclusiva elegível da arma equipada.
  const oracleBonusChance = ORACLE_FOURTH_CHOICE_CHANCE[clamp(purchases.oracle, 0, 10)];
  if (purchases.oracle > 0 && Math.random() * 100 < oracleBonusChance) {
    const fourthOptions = [...getEligibleFieldRelics(game, purchases), ...getEligibleWeaponGifts(game)]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
      .filter((item) => !withRarity.some((choice) => choice.id === item.id));
    if (fourthOptions.length) {
      const selected = fourthOptions[Math.floor(Math.random() * fourthOptions.length)];
      withRarity.push({ ...selected, rarity: selected.rarity ?? "uncommon" });
    }
  }
  return withRarity;
}

function rollUpgradeRarity(tier: number, transmutationChance = 0): "normal" | "rare" | "epic" {
  const odds = FRACTAL_RARITY_TIERS[Math.max(0, Math.min(3, tier))];
  const roll = Math.random() * 100;
  if (roll < odds.epic) return "epic";
  if (roll < odds.epic + odds.rare) return Math.random() * 100 < transmutationChance ? "epic" : "rare";
  return "normal";
}

const UPGRADE_RARITY_MULTIPLIERS = { normal: 1, uncommon: 1, rare: 1.25, epic: 1.5 } as const;
function getUpgradeRarityMultiplier(rarity: Upgrade["rarity"]): number {
  if (rarity === "legendary") return 1.5;
  if (rarity === "maestria" || rarity === "evolution") return 1;
  return UPGRADE_RARITY_MULTIPLIERS[rarity ?? "normal"];
}
function formatUpgradePercent(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
function getUpgradeDescription(upgrade: Upgrade): string {
  const multiplier = getUpgradeRarityMultiplier(upgrade.rarity);
  switch (upgrade.id) {
    case "power": return `Dano dos disparos +${formatUpgradePercent(30 * multiplier)}%.`;
    case "haste": return `Velocidade de ataque +${formatUpgradePercent(18 * multiplier)}% (intervalo entre disparos menor).`;
    case "vitality": return `Vida máxima +${formatUpgradePercent(15 * multiplier)}% e cura ${formatUpgradePercent(25 * multiplier)}% da vida máxima anterior.`;
    case "swift": return `Velocidade de movimento +${formatUpgradePercent(10 * multiplier)}%.`;
    case "weapon_mastery": return upgrade.description;
    case "weapon_evolution": return upgrade.description;
    case "anchor_soul": return upgrade.description;
    default: return upgrade.description;
  }
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Stable coordinate hash for repeatable arena props; returns a value in [0, 1).
function hash(x: number, y: number): number {
  let value = Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

// Remove objetos expirados sem criar um novo array em cada frame.
// É usado nas listas quentes da simulação (projéteis, partículas e textos).
function compactAlive<T extends { life: number }>(items: T[]): void {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < items.length; readIndex++) {
    const item = items[readIndex];
    if (!(item.life > 0)) continue;
    if (writeIndex !== readIndex) items[writeIndex] = item;
    writeIndex++;
  }
  if (writeIndex !== items.length) items.length = writeIndex;
}

const directionFromVector = (x: number, y: number) => {
  if (Math.hypot(x, y) < 0.001) return 0;
  const step = Math.round((Math.atan2(y, x) - Math.PI / 2) / (Math.PI / 4));
  return ((step % 8) + 8) % 8;
};
const PLAYER_DIRECTION_VECTORS = [
  { x: 0, y: 1 }, { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 }, { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 1, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 },
];

const ENEMY_GRID_CELL_SIZE = 96;
function getGridKey(cellX: number, cellY: number): number {
  return ((cellX + 32768) << 16) | (cellY + 32768);
}
type EnemySpatialGrid = Map<number, Enemy[]>;

function buildEnemySpatialGrid(enemies: Enemy[]): EnemySpatialGrid {
  const grid: EnemySpatialGrid = new Map();
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const cellX = Math.floor(enemy.x / ENEMY_GRID_CELL_SIZE);
    const cellY = Math.floor(enemy.y / ENEMY_GRID_CELL_SIZE);
    const key = getGridKey(cellX, cellY);
    const bucket = grid.get(key);
    if (bucket) bucket.push(enemy);
    else grid.set(key, [enemy]);
  }
  return grid;
}

function getNearbyEnemies(x: number, y: number, grid: EnemySpatialGrid): Enemy[] {
  const nearby: Enemy[] = [];
  const cellX = Math.floor(x / ENEMY_GRID_CELL_SIZE);
  const cellY = Math.floor(y / ENEMY_GRID_CELL_SIZE);
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const bucket = grid.get(getGridKey(cellX + offsetX, cellY + offsetY));
      if (bucket) for (let i = 0; i < bucket.length; i++) nearby.push(bucket[i]);
    }
  }
  return nearby;
}

function getEnemiesInRadius(x: number, y: number, radius: number, grid: EnemySpatialGrid): Enemy[] {
  const nearby: Enemy[] = [];
  const minCellX = Math.floor((x - radius) / ENEMY_GRID_CELL_SIZE);
  const maxCellX = Math.floor((x + radius) / ENEMY_GRID_CELL_SIZE);
  const minCellY = Math.floor((y - radius) / ENEMY_GRID_CELL_SIZE);
  const maxCellY = Math.floor((y + radius) / ENEMY_GRID_CELL_SIZE);
  for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      const bucket = grid.get(getGridKey(cellX, cellY));
      if (bucket) for (let i = 0; i < bucket.length; i++) nearby.push(bucket[i]);
    }
  }
  return nearby;
}

function getEnemySeparation(enemy: Enemy, grid: EnemySpatialGrid) {
  let sx = 0, sy = 0;
  const cellX = Math.floor(enemy.x / ENEMY_GRID_CELL_SIZE);
  const cellY = Math.floor(enemy.y / ENEMY_GRID_CELL_SIZE);
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const bucket = grid.get(getGridKey(cellX + offsetX, cellY + offsetY));
      if (!bucket) continue;
      for (const other of bucket) {
        if (other === enemy || other.hp <= 0) continue;
        const dx = enemy.x - other.x, dy = enemy.y - other.y;
        const minDist = enemy.radius + other.radius + 2;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < minDist * minDist) {
          const d = Math.sqrt(d2);
          const push = (minDist - d) / minDist;
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        }
      }
    }
  }
  return { x: sx, y: sy };
}


const floorPatternCache = new WeakMap<CanvasRenderingContext2D, Map<number, CanvasPattern>>();

const cemeteryImgs: Record<string, HTMLImageElement> = {};
const cemeteryImagePromises = new Map<string, Promise<void>>();
const CEMETERY_IMAGE_SOURCES = [groundImg, mausoleumImg, gravestoneImg, crossImg, candlesImg, catUrnImg] as const;
function cemImg(src: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = cemeteryImgs[src];
  if (!img) { img = new Image(); img.src = src; cemeteryImgs[src] = img; }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
function preloadCemeteryImage(src: string): Promise<void> {
  const existing = cemeteryImgs[src];
  if (existing?.complete) return Promise.resolve();
  const pending = cemeteryImagePromises.get(src);
  if (pending) return pending;
  const image = existing ?? new Image();
  cemeteryImgs[src] = image;
  const promise = new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      void image.decode().catch(() => undefined).then(resolve);
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    image.decoding = "sync";
    if (!existing) image.src = src;
    if (image.complete) finish();
  });
  cemeteryImagePromises.set(src, promise);
  return promise;
}
function preloadCemeteryImages(): Promise<void> {
  return Promise.all(CEMETERY_IMAGE_SOURCES.map(preloadCemeteryImage)).then(() => undefined);
}
const groundPatternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
const RUNE_PHRASE = "ᚷᚱᛁᛚᚺᚨᛟ ᚷᚱᚨᚹᛁᛏᚨᚲᛁᛟᚾᚨᛚ · ";
const gravityBestEnemies: (Enemy | null)[] = new Array(8).fill(null);
const gravityBestDist: number[] = new Array(8).fill(0);
const runeRingCache = new Map<string, HTMLCanvasElement>();
const wellSpriteCache = new Map<string, HTMLCanvasElement>();

function getWellSprite(radius: number, evolved: boolean): HTMLCanvasElement {
  const r = Math.round(radius / 8) * 8;
  const key = r + (evolved ? "e" : "n");
  const cached = wellSpriteCache.get(key);
  if (cached) return cached;

  const size = Math.ceil(r * 2 * 1.05 + 16);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.translate(size / 2, size / 2);

  // 1. Círculos concêntricos do selo
  const ringColor = evolved ? "rgba(225, 29, 72, 0.85)" : "rgba(168, 85, 247, 0.85)";
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Anel de Runas Nórdicas (estático)
  drawRuneRing(ctx, r * 0.88, evolved ? "#fb7185" : "#d8b4fe");

  // 3. Símbolo Central Místico (estático)
  if (evolved) {
    // Hexagrama Unicursal Carmesim
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 2.8;
    const hr = r * 0.65;
    const hx = hr * Math.cos(Math.PI / 6);
    const hy = hr * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -hr);
    ctx.lineTo(hx, hy);
    ctx.lineTo(-hx, -hy);
    ctx.lineTo(0, hr);
    ctx.lineTo(hx, -hy);
    ctx.lineTo(-hx, hy);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "#fda4af";
    for (let a = 0; a < 6; a++) {
      const angle = (a * Math.PI) / 3 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * hr * 0.82, Math.sin(angle) * hr * 0.82, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Pentagrama Místico Violeta
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let p = 0; p < 5; p++) {
      const angle = (p * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = Math.cos(angle) * r * 0.70;
      const py = Math.sin(angle) * r * 0.70;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "#e9d5ff";
    for (let p = 0; p < 5; p++) {
      const angle = (p * 2 * Math.PI) / 5 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * r * 0.70, Math.sin(angle) * r * 0.70, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  wellSpriteCache.set(key, canvas);
  return canvas;
}

function drawWellSpriteStatic(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  scale: number,
  alpha = 1,
) {
  const half = (sprite.width / 2) * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Desenho direto estático sem translate ou rotação por quadro:
  ctx.drawImage(sprite, x - half, y - half, half * 2, half * 2);
  ctx.restore();
}
function drawRuneRing(ctx: CanvasRenderingContext2D, radius: number, color = "#f0abfc") {
  const roundedRadius = Math.round(radius / 4) * 4;
  const key = roundedRadius + ":" + color;
  let canvas = runeRingCache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    const size = Math.ceil(roundedRadius * 2 + 40);
    canvas.width = size;
    canvas.height = size;
    const runeCtx = canvas.getContext("2d")!;
    runeCtx.translate(size / 2, size / 2);
    runeCtx.font = "bold 13px serif";
    runeCtx.fillStyle = color;
    runeCtx.strokeStyle = color;
    runeCtx.textAlign = "center";
    runeCtx.textBaseline = "middle";
    const glyphs = Array.from(RUNE_PHRASE);
    const step = 13 / roundedRadius;
    const total = Math.floor((Math.PI * 2) / step);
    for (let i = 0; i < total; i++) {
      const angle = i * ((Math.PI * 2) / total);
      runeCtx.save();
      runeCtx.rotate(angle);
      runeCtx.translate(0, -roundedRadius);
      runeCtx.fillText(glyphs[i % glyphs.length], 0, 0);
      runeCtx.restore();
    }
    runeCtx.globalAlpha = 0.72;
    runeCtx.lineWidth = 1.2;
    runeCtx.beginPath();
    runeCtx.arc(0, 0, roundedRadius - 10, 0, Math.PI * 2);
    runeCtx.stroke();
    runeCtx.beginPath();
    runeCtx.arc(0, 0, roundedRadius + 10, 0, Math.PI * 2);
    runeCtx.stroke();
    runeRingCache.set(key, canvas);
  }
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
}
function drawSprite(ctx: CanvasRenderingContext2D, src: string, size: number, footY: number): boolean {
  const img = cemImg(src); if (!img) return false;
  ctx.drawImage(img, -size / 2, footY - size, size, size); return true;
}
function getFloorPattern(ctx: CanvasRenderingContext2D, missionId: number, floor: readonly number[], glow: string): CanvasPattern | null {
  let missionPatterns = floorPatternCache.get(ctx);
  if (!missionPatterns) {
    missionPatterns = new Map<number, CanvasPattern>();
    floorPatternCache.set(ctx, missionPatterns);
  }
  const cached = missionPatterns.get(missionId);
  if (cached) return cached;
  const texture = document.createElement("canvas");
  texture.width = 96;
  texture.height = 96;
  const tileCtx = texture.getContext("2d");
  if (!tileCtx) return null;
  tileCtx.fillStyle = "rgb(" + floor[0] + "," + floor[1] + "," + floor[2] + ")";
  tileCtx.fillRect(0, 0, 96, 96);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = col * 48, y = row * 48;
      const shade = (row + col) % 2 === 0 ? 7 : -3;
      tileCtx.fillStyle = "rgb(" + clamp(floor[0] + shade, 0, 255) + "," + clamp(floor[1] + shade, 0, 255) + "," + clamp(floor[2] + shade, 0, 255) + ")";
      tileCtx.fillRect(x + 1, y + 1, 46, 46);
      tileCtx.strokeStyle = "rgba(7,5,13,.82)";
      tileCtx.lineWidth = 2;
      tileCtx.strokeRect(x + 1, y + 1, 46, 46);
      tileCtx.strokeStyle = "rgba(225,205,245,.075)";
      tileCtx.lineWidth = 1;
      tileCtx.beginPath();
      tileCtx.moveTo(x + 7, y + 8); tileCtx.lineTo(x + 40, y + 8);
      tileCtx.moveTo(x + 8, y + 7); tileCtx.lineTo(x + 8, y + 40);
      tileCtx.stroke();
      tileCtx.fillStyle = glow;
      tileCtx.globalAlpha = 0.13;
      tileCtx.beginPath();
      tileCtx.moveTo(x + 24, y + 15); tileCtx.lineTo(x + 30, y + 24);
      tileCtx.lineTo(x + 24, y + 33); tileCtx.lineTo(x + 18, y + 24);
      tileCtx.closePath(); tileCtx.fill();
      tileCtx.globalAlpha = 1;
    }
  }
  const pattern = ctx.createPattern(texture, "repeat");
  if (pattern) missionPatterns.set(missionId, pattern);
  return pattern;
}

const NO_ENEMY_SEPARATION = { x: 0, y: 0 };

function isFreeCemeteryPosition(x: number, y: number, radius: number, obstacles: CemeteryObstacle[], urns: BreakableUrn[] = []): boolean {
  if (Math.abs(x) > WORLD_LIMIT - radius || Math.abs(y) > WORLD_LIMIT - radius) return false;
  if (obstacles.some((item) => distance(x, y, item.x, item.y) < radius + item.radius + 24)) return false;
  return !urns.some((item) => !item.broken && distance(x, y, item.x, item.y) < radius + item.radius + 18);
}
function createCemeteryObstacles(): CemeteryObstacle[] {
  const result: CemeteryObstacle[] = [];
  const specs: Array<[CemeteryObstacle["kind"], number, number]> = [["gravestone",35,18],["cross",20,14],["mausoleum",8,46],["torch",12,16]];
  for (const [kind,count,radius] of specs) {
    let placed=0, attempts=0;
    while (placed<count && attempts<count*90) {
      attempts++; const x=(Math.random()*2-1)*1190, y=(Math.random()*2-1)*1190;
      if (distance(x,y,0,0)<155 || !isFreeCemeteryPosition(x,y,radius,result)) continue;
      result.push({x,y,radius,kind}); placed++;
    }
  }
  return result;
}
function spawnCemeteryUrns(game: GameState, count: number) {
  let placed=0, attempts=0;
  while (placed<count && attempts<count*80) {
    attempts++; const x=(Math.random()*2-1)*1220, y=(Math.random()*2-1)*1220;
    if (!isFreeCemeteryPosition(x,y,15,game.obstacles,game.urns)) continue;
    game.urns.push({id:game.nextUrnId++,x,y,hp:3,maxHp:3,radius:15,broken:false}); placed++;
  }
}
// Reutilizado por todos os testes síncronos de colisão da arena para não alocar
// um objeto temporário por inimigo em cada frame. Os chamadores consomem x/y imediatamente.
const cemeteryCollisionResult = { x: 0, y: 0 };
function resolveCemeteryCollision(x: number, y: number, radius: number, obstacles: CemeteryObstacle[]) {
  let nx = clamp(x, -WORLD_LIMIT + radius, WORLD_LIMIT - radius);
  let ny = clamp(y, -WORLD_LIMIT + radius, WORLD_LIMIT - radius);
  for (let i = 0; i < obstacles.length; i++) {
    const obstacle = obstacles[i];
    const min = radius + obstacle.radius;
    const dx = nx - obstacle.x;
    const dy = ny - obstacle.y;
    if (dx > min || dx < -min || dy > min || dy < -min) continue;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < min) {
      const push = min - d;
      nx += (dx / d) * push;
      ny += (dy / d) * push;
    } else if (d === 0) {
      nx += min;
    }
  }
  cemeteryCollisionResult.x = clamp(nx, -WORLD_LIMIT + radius, WORLD_LIMIT - radius);
  cemeteryCollisionResult.y = clamp(ny, -WORLD_LIMIT + radius, WORLD_LIMIT - radius);
  return cemeteryCollisionResult;
}


function makeGame(width: number, height: number, purchases: PurchaseState, weaponId: WeaponId, omenId: OmenId | null): GameState {
  const omenHealth = omenId === "spectral_veil" ? 0.85 : omenId === "revenge" ? 0.90 : 1;
  const maxHp = (100 + purchases.health * 10) * omenHealth;
  const projectileLife = PROJECTILE_BASE_LIFE * PROJECTILE_DURATION_MULTIPLIERS[clamp(purchases.projectile_duration, 0, 3)];
  const omenDamage = omenId === "rupture" ? 1.2 : 1;
  return {
    width, height, last: 0, elapsed: 0, spawnTimer: 0.4, shotTimer: 0.25, bossSpawned: false,
    player: { x: 0, y: 0, hp: maxHp, maxHp, speed: 205 * (omenId === "spectral_veil" ? 1.15 : 1), damage: 22 * omenDamage, fireRate: 0.72 * (omenId === "rupture" ? 1.15 : 1), invuln: 0, hitFlash: 0, xp: 0, nextXp: 12, level: 1, pickupRadius: 85, xpMultiplier: omenId === "famine" ? 1.2 : 1, specialAreaStacks: 0, specialExperienceStacks: 0, projectileRangeStacks: 0, projectileRangeMultiplier: 1, projectileStacks: 0, relicRicochet: 0, relicPiercing: 0, relicChainLightning: 0, projectileLife, facing: 0, castFacing: 0, castTimer: 0, moving: false, dashTimer: 0, dashCooldown: 0, dashX: 1, dashY: 0, spriteAction: "idle", spriteDirection: 0, previousSpriteAction: "idle", previousSpriteDirection: 0, spriteBlend: 1 },
    enemies: [], shots: [], gems: [], specialDrops: [], sentinelTotems: [], sentinelRespawnTimer: 0, nextSentinelTotemId: 1, urns: [], obstacles: createCemeteryObstacles(), nextUrnMinute: 1, nextUrnId: 1, particles: [], damageNumbers: [], pickupLabels: [], challengeEvent: null, nextChallengeEvent: 0, kills: 0, ended: false, upgradeCounts: {}, totalDamageDealt: 0, crystalsCollected: 0, highestLevel: 1,
    weaponId, weaponLevel: 1, evolved: false, rerollsRemaining: purchases.reroll, banishesRemaining: purchases.banish, bannedUpgradeIds: [],
    revolverShotCount: 0, orbitalPulseTimer: 0, gravityAuraActive: true, gravityAuraShot: undefined, gravityTethers: [], scytheSiphonCooldown: 0,
    anchorReviveAvailable: false, anchorRevivesUsed: 0, dashChainRemaining: 0, dashChainWindow: 0, dashHitTargets: new Set<Enemy>(), omenId, omenSpawnMultiplier: omenId === "famine" ? 1.2 : 1,
    omenEnemyHpMultiplier: omenId === "abundance" ? 1.15 : 1, omenRewardMultiplier: omenId === "abundance" ? 1.25 : 1,
    omenRevengeCooldown: 0, lastObservedHp: maxHp,
  };
}

function spawnPlasmaPuddle(game: GameState, x: number, y: number, coreDamage: number) {
  // A Singularidade passa a dominar uma região maior sem aumentar a frequência dos pulsos.
  const radius = (game.evolved ? 180 : 118)
    * (1 + game.player.specialAreaStacks * 0.1)
    * (1 + (game.upgradeCounts.gift_core_expansion?.count ?? 0) * 0.12);
  const residueLevel = game.upgradeCounts.gift_core_residue?.count ?? 0;
  const life = (game.evolved ? 2.5 : 1.5) + residueLevel * 0.3;
  game.shots.push({
    x, y, vx: 0, vy: 0,
    damage: coreDamage * (game.evolved ? 0.45 : 0.30),
    life, maxLife: life, hitTargets: [], bouncesRemaining: 0, piercesRemaining: 999,
    kind: "plasma_puddle", radius, pulseTimer: 0.38,
  });
  (game.rings ??= []).push({
    x, y, r: 10, max: radius, life: 0.42,
    color: game.evolved ? "#a855f7" : "#ef4444",
  });
}

function getEquippedWeaponStrikeDamage(game: GameState): number {
  const weaponPower = (1 + (game.weaponLevel - 1) * 0.055) * (game.evolved ? 1.15 : 1);
  const weaponMultiplier = game.weaponId === "unstable_core" ? 1.275
    : game.weaponId === "spectral_scythe" ? (game.evolved ? 1.68 : 1.32)
    : game.weaponId === "orbital_swords" ? 0.75
    : game.weaponId === "gravity_shackle" ? (game.evolved ? 0.75 : 0.5625)
    : game.weaponId === "rune_sentinels" ? (game.evolved ? 0.75 : 0.55)
    : game.weaponId === "void_revolver" && game.evolved ? 0.85
    : 1;
  return Math.max(1, Math.round(game.player.damage * weaponPower * weaponMultiplier));
}

function getPlayerDamageTaken(game: GameState, damage: number): number {
  if (game.weaponId !== "gravity_shackle" || !(game.gravityAuraActive ?? false)) return damage;
  const guardLevel = game.upgradeCounts.gift_gravity_guard?.count ?? 0;
  return damage * (1 - Math.min(0.15, guardLevel * 0.05));
}

function spawnEnemy(game: GameState, missionId: number, elapsed: number, corruption: number, boss = false) {
  const side = Math.floor(Math.random() * 4);
  const margin = 30;
  const centerX = game.player.x, centerY = game.player.y;
  const x = clamp(side === 0 ? centerX - game.width / 2 - margin : side === 1 ? centerX + game.width / 2 + margin : centerX + (Math.random() - 0.5) * game.width, -WORLD_LIMIT + 50, WORLD_LIMIT - 50);
  const y = clamp(side === 2 ? centerY - game.height / 2 - margin : side === 3 ? centerY + game.height / 2 + margin : centerY + (Math.random() - 0.5) * game.height, -WORLD_LIMIT + 50, WORLD_LIMIT - 50);
  const pressure = getDifficultySnapshot(missionId, elapsed, corruption);
  const roll = Math.random();
  const eliteChance = Math.min(0.22, pressure.eliteSpawnScale * 0.075);
  const type: Enemy["type"] = boss ? "boss" : elapsed > 210 && roll < eliteChance ? "elite" : elapsed > 150 && roll > 0.76 ? "brute" : elapsed > 70 && roll > 0.56 ? "charger" : "wraith";
  const scale = 1 + elapsed / 650 + (missionId - 1) * 0.18;
  const bossBaseHp = 1700;
  const stats = type === "boss"
    ? { hp: bossBaseHp * 3, speed: 40, radius: 38, damage: 24, color: "#b9a0ff", xp: 0 }
    : type === "elite"
      ? { hp: 245 * scale, speed: 31, radius: 21, damage: 17, color: "#c7a7d9", xp: 9 }
      : type === "brute"
        ? { hp: 100 * scale, speed: 35, radius: 17, damage: 15, color: "#7d8495", xp: 4 }
        : type === "charger"
          ? { hp: 36 * scale, speed: 105, radius: 11, damage: 10, color: "#e5a45b", xp: 2 }
          : { hp: 28 * scale, speed: 57, radius: 10, damage: 8, color: "#9b91b4", xp: 2 };
  const scaledStats = { ...stats, hp: stats.hp * game.omenEnemyHpMultiplier };
  game.enemies.push({ x, y, ...scaledStats, maxHp: scaledStats.hp, type, attack: type === "boss" ? 2.2 : 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false, furyTriggered: false });
  // Spawn pressure is bounded. It affects encounter density, not enemy HP directly.
  if (!boss && pressure.enemySpawnScale > 1.25 && game.enemies.length < 48 && Math.random() < 0.18) {
    game.enemies.push({ x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 70, ...scaledStats, maxHp: scaledStats.hp, type, attack: 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false, furyTriggered: false });
  }
}

const sharedParticleBuckets: Record<string, Particle[]> = {};

function drawGame(ctx: CanvasRenderingContext2D, game: GameState, corruption: number, missionId: number, sprites: SpriteMap = {}, showPlayerHp = true, showDamageNumbers = true, zoom = 1) {
  const { width, height, player } = game;
  const safeZoom = clamp(zoom, 0.6, 1.6);
  const viewWidth = width / safeZoom;
  const viewHeight = height / safeZoom;
  const cameraX = player.x - viewWidth / 2;
  const cameraY = player.y - viewHeight / 2;
  const crowded = game.enemies.length > 30;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  if (game.shake) {
    const shakePhase = game.elapsed * 42;
    ctx.translate(Math.sin(shakePhase) * game.shake * 0.52, Math.cos(shakePhase * 0.83) * game.shake * 0.38);
  }
  ctx.scale(safeZoom, safeZoom);
  ctx.translate(-player.x, -player.y);

  // Paletas prontas para os cinco biomas; somente o primeiro está liberado.
  const biomes = [
    { floor: [35, 32, 48], glow: "#a75bff", crystal: "#a75bff", stone: "#554365" },
    { floor: [48, 27, 28], glow: "#ed654c", crystal: "#ff754e", stone: "#74443b" },
    { floor: [27, 43, 31], glow: "#69b978", crystal: "#79d18a", stone: "#466b4a" },
    { floor: [25, 37, 53], glow: "#69a9ed", crystal: "#78c8f4", stone: "#456783" },
    { floor: [39, 27, 53], glow: "#c08aff", crystal: "#d29aff", stone: "#654b80" },
  ] as const;
  const biome = biomes[clamp(missionId - 1, 0, biomes.length - 1)];
  // Piso em mosaico cacheado: uma chamada de preenchimento por quadro.
  ctx.fillStyle = "#0d0b14";
  ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight);
  const floorPattern = getFloorPattern(ctx, missionId, biome.floor, biome.glow);
  const gImg = missionId === 1 ? cemImg(groundImg) : null;
  let groundPattern = gImg ? groundPatternCache.get(ctx) : undefined;
  if (gImg && !groundPattern) {
    const createdPattern = ctx.createPattern(gImg, "repeat");
    if (createdPattern) {
      groundPatternCache.set(ctx, createdPattern);
      groundPattern = createdPattern;
    }
  }
  if (gImg && groundPattern) { ctx.fillStyle = groundPattern; ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight); }
  else if (floorPattern) { ctx.fillStyle = floorPattern; ctx.fillRect(cameraX, cameraY, viewWidth, viewHeight); }
  ctx.save();ctx.strokeStyle="rgba(145,119,160,.72)";ctx.lineWidth=34;ctx.strokeRect(-WORLD_LIMIT,-WORLD_LIMIT,WORLD_LIMIT*2,WORLD_LIMIT*2);ctx.strokeStyle="rgba(215,190,231,.25)";ctx.lineWidth=5;ctx.strokeRect(-WORLD_LIMIT+17,-WORLD_LIMIT+17,WORLD_LIMIT*2-34,WORLD_LIMIT*2-34);
  const fog=110;for(let edge=0;edge<4;edge++){const g=edge<2?ctx.createLinearGradient(edge===0?-WORLD_LIMIT:WORLD_LIMIT,0,edge===0?-WORLD_LIMIT+fog:WORLD_LIMIT-fog,0):ctx.createLinearGradient(0,edge===2?-WORLD_LIMIT:WORLD_LIMIT,0,edge===2?-WORLD_LIMIT+fog:WORLD_LIMIT-fog);g.addColorStop(0,"rgba(32,22,42,.78)");g.addColorStop(1,"rgba(32,22,42,0)");ctx.fillStyle=g;if(edge<2)ctx.fillRect(edge===0?-WORLD_LIMIT:WORLD_LIMIT-fog,-WORLD_LIMIT,fog,WORLD_LIMIT*2);else ctx.fillRect(-WORLD_LIMIT,edge===2?-WORLD_LIMIT:WORLD_LIMIT-fog,WORLD_LIMIT*2,fog);}ctx.restore();

  const drawPillar = (x: number, y: number, scale = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath(); ctx.ellipse(2, 13, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#171320"; ctx.strokeStyle = biome.stone; ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-13,10); ctx.lineTo(-10,-25); ctx.lineTo(-4,-32); ctx.lineTo(11,-29); ctx.lineTo(14,-23); ctx.lineTo(12,11); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#383047";
    ctx.beginPath(); ctx.moveTo(-16,-27); ctx.lineTo(-7,-35); ctx.lineTo(14,-32); ctx.lineTo(17,-25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = biome.glow + "3d";
    ctx.beginPath(); ctx.moveTo(-2,-20); ctx.lineTo(4,-25); ctx.lineTo(5,5); ctx.lineTo(-1,9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(238,218,255,.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8,-15); ctx.lineTo(-3,-7); ctx.lineTo(-7,0); ctx.moveTo(8,-18); ctx.lineTo(4,-10); ctx.stroke();
    ctx.restore();
  };
  const drawCrystal = (x: number, y: number, size: number, color: string) => {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = color; ctx.strokeStyle = "rgba(245,225,255,.72)"; ctx.lineWidth = 1;
    const shard = (offsetX: number, offsetY: number, scale: number) => {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY - size * scale);
      ctx.lineTo(offsetX + size * .42 * scale, offsetY - size * .16 * scale);
      ctx.lineTo(offsetX + size * .27 * scale, offsetY + size * .75 * scale);
      ctx.lineTo(offsetX - size * .28 * scale, offsetY + size * .75 * scale);
      ctx.lineTo(offsetX - size * .42 * scale, offsetY - size * .16 * scale);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.beginPath(); ctx.moveTo(offsetX, offsetY - size * scale); ctx.lineTo(offsetX, offsetY + size * .65 * scale);
      ctx.lineTo(offsetX - size * .28 * scale, offsetY + size * .75 * scale); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color;
    };
    shard(0, 0, 1); shard(-size * .5, size * .22, .58); shard(size * .48, size * .27, .48);
    ctx.restore();
  };

  for(const prop of game.obstacles){if(prop.x<cameraX-90||prop.x>cameraX+viewWidth+90||prop.y<cameraY-90||prop.y>cameraY+viewHeight+90)continue;ctx.save();ctx.translate(prop.x,prop.y);
    {const sh=prop.kind==="mausoleum"?[60,18]:[22,8];ctx.fillStyle="rgba(0,0,0,.45)";ctx.beginPath();ctx.ellipse(0,prop.radius*.55,sh[0],sh[1],0,0,Math.PI*2);ctx.fill();}
    if(prop.kind==="torch"){const pulse=1+Math.sin(game.elapsed*4.2+prop.x*.02)*.12;const glow=ctx.createRadialGradient(0,-22,2,0,-22,60*pulse);glow.addColorStop(0,"rgba(255,190,110,.35)");glow.addColorStop(1,"rgba(255,150,60,0)");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,-22,60*pulse,0,Math.PI*2);ctx.fill();}
    const spS=clamp(Math.min(game.width,game.height)/720,0.72,1.15);const spr0=prop.kind==="mausoleum"?[mausoleumImg,140,40]:prop.kind==="cross"?[crossImg,62,22]:prop.kind==="torch"?[candlesImg,58,20]:[gravestoneImg,60,22];const spr=[spr0[0],(spr0[1] as number)*spS,(spr0[2] as number)*spS];
    if(drawSprite(ctx,spr[0] as string,spr[1] as number,spr[2] as number)){ctx.restore();continue;}
    if(prop.kind==="torch"){const pulse=1+Math.sin(game.elapsed*3.8+prop.x*.02)*.12;const glow=ctx.createRadialGradient(0,-14,2,0,-14,42*pulse);glow.addColorStop(0,"rgba(193,117,255,.42)");glow.addColorStop(.45,"rgba(128,67,190,.16)");glow.addColorStop(1,"rgba(128,67,190,0)");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,-14,42*pulse,0,Math.PI*2);ctx.fill();ctx.fillStyle="#292333";ctx.strokeStyle="#746181";ctx.fillRect(-5,-4,10,21);ctx.strokeRect(-5,-4,10,21);ctx.fillStyle="#d8a8ff";ctx.beginPath();ctx.moveTo(0,-31);ctx.quadraticCurveTo(13,-18,2,-8);ctx.quadraticCurveTo(-10,-15,0,-31);ctx.fill();ctx.fillStyle="#ffd99a";ctx.beginPath();ctx.arc(0,-17,3,0,Math.PI*2);ctx.fill();}
    else if(prop.kind==="mausoleum"){ctx.fillStyle="rgba(0,0,0,.45)";ctx.beginPath();ctx.ellipse(0,18,54,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#25212d";ctx.strokeStyle="#75677e";ctx.lineWidth=3;ctx.fillRect(-42,-22,84,42);ctx.strokeRect(-42,-22,84,42);ctx.beginPath();ctx.moveTo(-48,-22);ctx.lineTo(-35,-48);ctx.lineTo(35,-48);ctx.lineTo(48,-22);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#100e17";ctx.fillRect(-12,-5,24,25);ctx.strokeStyle="#9a83a5";ctx.strokeRect(-12,-5,24,25);}
    else if(prop.kind==="cross"){ctx.fillStyle="#272330";ctx.strokeStyle="#786a83";ctx.lineWidth=3;ctx.fillRect(-4,-23,8,43);ctx.fillRect(-14,-14,28,7);ctx.strokeRect(-4,-23,8,43);ctx.strokeRect(-14,-14,28,7);}
    else{ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();ctx.ellipse(2,15,21,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#282330";ctx.strokeStyle="#81758a";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-16,13);ctx.lineTo(-13,-13);ctx.lineTo(-8,-23);ctx.lineTo(8,-23);ctx.lineTo(15,-12);ctx.lineTo(16,13);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#9c83a9";ctx.fillRect(-10,-17,20,3);}ctx.restore();}
  // Objetos decorativos saem do passe crítico durante ondas cheias.
  if (!crowded) {
    const propSpacing = 320;
    const propColStart = Math.floor(cameraX / propSpacing) - 1;
    const propColEnd = Math.ceil((cameraX + viewWidth) / propSpacing) + 1;
    const propRowStart = Math.floor(cameraY / propSpacing) - 1;
    const propRowEnd = Math.ceil((cameraY + viewHeight) / propSpacing) + 1;
    for (let row = propRowStart; row <= propRowEnd; row++) {
      for (let col = propColStart; col <= propColEnd; col++) {
        const roll = hash(col + 103, row - 67);
        const x = col * propSpacing + 34 + hash(col + 11, row + 4) * 235;
        const y = row * propSpacing + 30 + hash(col - 9, row + 19) * 250;
        if (roll > 0.91) drawPillar(x, y, 0.62 + hash(col, row + 8) * 0.55);
        else if (roll > 0.78) drawCrystal(x, y, 9 + hash(col + 5, row) * 12, biome.crystal);
        else if (roll > 0.67) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(hash(col + 2, row + 2) * Math.PI);
          ctx.fillStyle = "rgba(8,7,15,.72)"; ctx.strokeStyle = biome.stone + "99"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(-18,8); ctx.lineTo(-11,-8); ctx.lineTo(4,-13); ctx.lineTo(18,2); ctx.lineTo(11,12); ctx.closePath();
          ctx.fill(); ctx.stroke(); ctx.fillStyle = biome.glow + "30"; ctx.fillRect(-4,-6,7,4); ctx.restore();
        }
      }
    }
  }

  if (game.challengeEvent?.id === 1) {
    const event = game.challengeEvent;
    const pulse = 1 + Math.sin(game.elapsed * 3.5) * 0.035;
    ctx.save();
    ctx.translate(event.x, event.y);
    ctx.scale(pulse, pulse);
    const halo = ctx.createRadialGradient(0, 0, 24, 0, 0, event.radius);
    halo.addColorStop(0, "rgba(174,121,255,.12)");
    halo.addColorStop(.72, "rgba(119,77,180,.07)");
    halo.addColorStop(1, "rgba(119,77,180,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, event.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(206,166,255,.78)";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -game.elapsed * 22;
    ctx.beginPath();
    ctx.arc(0, 0, event.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(241,213,255,.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, event.radius - 9, 0, Math.PI * 2);
    ctx.stroke();
    const sentinel = sprites.elite;
    if (sentinel?.complete && sentinel.naturalWidth > 0) {
      ctx.shadowColor = "#bd8cff";
      ctx.shadowBlur = 0;
      ctx.drawImage(sentinel, -35, -44, 70, 82);
    }
    ctx.shadowBlur = 0;
    ctx.font = "900 10px Inter, ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f0ddff";
    ctx.shadowColor = "#6f3eb1";
    ctx.shadowBlur = 0;
    ctx.fillText("ANOMALIA " + String(event.id).padStart(2, "0"), 0, -event.radius - 18);
    ctx.restore();
  }

  for(const urn of game.urns){if(urn.broken||urn.x<cameraX-35||urn.x>cameraX+viewWidth+35||urn.y<cameraY-35||urn.y>cameraY+viewHeight+35)continue;ctx.save();ctx.translate(urn.x,urn.y);
    {const catI=cemImg(catUrnImg);if(catI){const pulse=.7+Math.sin(game.elapsed*2.4+urn.id)*.3;const aura=ctx.createRadialGradient(0,-4,4,0,-4,30);aura.addColorStop(0,`rgba(255,215,120,${.28*pulse})`);aura.addColorStop(1,"rgba(255,200,90,0)");ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,-4,30,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();ctx.ellipse(0,13,14,5,0,0,Math.PI*2);ctx.fill();ctx.drawImage(catI,-19,-24,38,38);if(urn.hp<urn.maxHp){ctx.fillStyle="#3a2a10";ctx.fillRect(-10,-30,20,3);ctx.fillStyle="#f2c460";ctx.fillRect(-10,-30,20*(urn.hp/urn.maxHp),3);}ctx.restore();continue;}}
    ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();ctx.ellipse(0,13,17,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#514454";ctx.strokeStyle="#b49ab7";ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-11,-9);ctx.lineTo(-8,-17);ctx.lineTo(8,-17);ctx.lineTo(11,-9);ctx.lineTo(9,10);ctx.quadraticCurveTo(0,17,-9,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#241d2b";ctx.fillRect(-9,-10,18,4);ctx.strokeStyle="#d8c0d7";ctx.beginPath();ctx.moveTo(-5,-5);ctx.lineTo(5,7);ctx.moveTo(5,-5);ctx.lineTo(-5,7);ctx.stroke();ctx.fillStyle="#efb6ff";ctx.fillRect(-10,-25,20,3);ctx.fillStyle="#8c4ca8";ctx.fillRect(-10,-25,20*(urn.hp/urn.maxHp),3);ctx.restore();}
  game.gems.forEach((gem) => {
    if (gem.x < cameraX - 30 || gem.x > cameraX + viewWidth + 30 || gem.y < cameraY - 30 || gem.y > cameraY + viewHeight + 30) return;
    if (gem.previousX !== undefined && gem.previousY !== undefined) {
      ctx.save();
      ctx.strokeStyle = "rgba(56,189,248,.72)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gem.previousX, gem.previousY);
      ctx.lineTo(gem.x, gem.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.translate(gem.x, gem.y);
    const pulse = 1 + Math.sin(game.elapsed * 6 + gem.x * 0.03) * 0.08;
    if(gem.runeCrystal){const glow=ctx.createRadialGradient(0,0,1,0,0,20);glow.addColorStop(0,"rgba(255,210,255,.8)");glow.addColorStop(.35,"rgba(217,70,239,.42)");glow.addColorStop(1,"rgba(217,70,239,0)");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.fill();ctx.fillStyle="#d946ef";ctx.rotate(Math.PI/4);ctx.fillRect(-6,-6,12,12);ctx.fillStyle="#fff0ff";ctx.fillRect(-2,-2,4,4);ctx.restore();return;}
    ctx.scale(pulse, pulse);
    const icon = sprites.xpGem;
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 0;
      ctx.drawImage(icon, -gem.radius * 0.95, -gem.radius * 0.95, gem.radius * 1.9, gem.radius * 1.9);
    } else {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#9ee6c1"; ctx.shadowColor = "#7df0b0"; ctx.shadowBlur = 0;
      ctx.fillRect(-gem.radius / 2, -gem.radius / 2, gem.radius, gem.radius);
    }
    ctx.restore();
  });
  game.specialDrops.forEach((drop) => {
    if (drop.x < cameraX - 45 || drop.x > cameraX + viewWidth + 45 || drop.y < cameraY - 45 || drop.y > cameraY + viewHeight + 45) return;
    ctx.save(); ctx.translate(drop.x, drop.y);
    const pulse = 1 + Math.sin(game.elapsed * 7 + drop.y * 0.02) * 0.09;
    const size = drop.radius * 2.8 * pulse;
    if(drop.kind==="food"||drop.kind==="void"){ctx.font="25px serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(drop.kind==="food"?"🍔":"🌀",0,0);ctx.restore();return;}
    const icon = drop.kind === "area" ? sprites.specialArea : drop.kind === "experience" ? sprites.specialXP : drop.kind === "projectile_range" ? sprites.specialRange : sprites.specialProjectiles;
    ctx.globalAlpha = 0.9 + Math.sin(game.elapsed * 5 + drop.x * 0.02) * 0.1;
    ctx.shadowColor = drop.kind === "area" ? "#e9c46a" : "#b78cff";
    ctx.shadowBlur = 0;
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = drop.kind === "area" ? "#67d9e8" : "#b58cff";
      ctx.beginPath(); ctx.arc(0, 0, drop.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  game.shots.forEach((shot) => {
    if (shot.x < cameraX - 280 || shot.x > cameraX + viewWidth + 280 || shot.y < cameraY - 280 || shot.y > cameraY + viewHeight + 280) return;
    const lifeRatio = clamp(shot.life / Math.max(0.01, shot.maxLife ?? game.player.projectileLife), 0.08, 1);

    if (shot.kind === "dash_strike") return;
    if (shot.kind === "gravity_well") {
      // A aura permanente/intermitente é desenhada fora do passe aditivo abaixo.
      // Isso mantém source-over sem alternar o modo de composição dentro da lista de tiros.
      if (shot.isAura) return;
      const radius = shot.radius ?? (game.evolved ? 140 : 106);
      const spriteRadius = game.evolved ? 140 : 106;
      const visualScale = radius / spriteRadius;
      const sprite = getWellSprite(spriteRadius, game.evolved);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      drawWellSpriteStatic(ctx, sprite, shot.x, shot.y, visualScale, Math.min(1, lifeRatio * 1.25));
      ctx.restore();
      return;
    }

    if (shot.kind === "sentinel_explosion") {
      ctx.save();
      ctx.translate(shot.x, shot.y);
      ctx.globalAlpha = lifeRatio;
      const radius = shot.radius ?? 140;
      const gradient = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
      gradient.addColorStop(0, game.evolved ? "rgba(254,226,226,.92)" : "rgba(224,242,254,.92)");
      gradient.addColorStop(0.28, game.evolved ? "rgba(220,38,38,.6)" : "rgba(34,211,238,.58)");
      gradient.addColorStop(0.72, "rgba(251,191,36,.18)");
      gradient.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#a5f3fc"; ctx.lineWidth = 4; ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(0, 0, radius * (0.62 + (1 - lifeRatio) * 0.25), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }

    if (shot.kind === "plasma_puddle") {
      ctx.save();
      ctx.translate(shot.x, shot.y);
      ctx.globalAlpha = Math.min(1, lifeRatio * 1.35);
      const radius = (shot.radius ?? 90) * (0.92 + Math.sin(game.elapsed * 8) * 0.08);
      if (game.evolved) {
        const rot = game.elapsed * 3;
        const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
        grad.addColorStop(0, "rgba(5,2,10,0.98)");
        grad.addColorStop(0.35, "rgba(112,26,117,0.72)");
        grad.addColorStop(0.70, "rgba(192,38,211,0.28)");
        grad.addColorStop(1, "rgba(147,51,234,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(244,114,182,0.65)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.75, rot, rot + Math.PI * 1.3); ctx.stroke();
        ctx.strokeStyle = "rgba(192,132,252,0.5)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.45, -rot * 1.4, -rot * 1.4 + Math.PI * 1.1); ctx.stroke();
        ctx.fillStyle = "#030006";
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#e879f9"; ctx.lineWidth = 1.8; ctx.stroke();
      } else {
        const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, radius);
        grad.addColorStop(0, "rgba(254,240,138,0.95)");
        grad.addColorStop(0.28, "rgba(249,115,22,0.85)");
        grad.addColorStop(0.65, "rgba(220,38,38,0.42)");
        grad.addColorStop(1, "rgba(185,28,28,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(253,224,71,0.7)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.68, game.elapsed * 0.5, game.elapsed * 0.5 + Math.PI * 1.4); ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (shot.kind === "scythe_slash") {
      ctx.save();
      ctx.translate(shot.x, shot.y);
      ctx.globalAlpha = lifeRatio;
      const radius = shot.radius ?? 180;
      const span = shot.arcSpan ?? Math.PI * 1.1;
      const centerAngle = shot.angle ?? 0;
      const startAngle = centerAngle - span / 2;
      const endAngle = centerAngle + span / 2;
      const progress = 1 - lifeRatio;
      ctx.lineCap = "round";
      const sweepEnd = startAngle + span * Math.min(1, 0.35 + progress * 1.6);
      const sweep = sweepEnd - startAngle;
      const thick = radius * (game.evolved ? 0.42 : 0.36);
      // Lâmina em crescente: borda externa no raio, interna afunila nas pontas.
      const crescent = (outer: number, depth: number) => {
        const steps = 18;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) { const a = startAngle + sweep * (i / steps); ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); }
        for (let i = steps; i >= 0; i--) { const t = i / steps; const a = startAngle + sweep * t; const r = outer - depth * Math.sin(Math.PI * Math.min(1, t * 1.1)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath();
      };
      ctx.globalAlpha = lifeRatio * 0.3; ctx.fillStyle = "#14b8a6"; crescent(radius + 6, thick * 1.15); ctx.fill();
      ctx.globalAlpha = lifeRatio * 0.5; ctx.fillStyle = "#5eead4"; crescent(radius, thick * 0.8); ctx.fill();
      if (game.evolved) { ctx.globalAlpha = lifeRatio * 0.8; ctx.fillStyle = "#05080f"; crescent(radius - thick * 0.25, thick * 0.3); ctx.fill(); }
      ctx.globalAlpha = lifeRatio * 0.95; ctx.strokeStyle = "#ccfbf1"; ctx.lineWidth = game.evolved ? 4 : 3;
      ctx.beginPath(); ctx.arc(0, 0, radius + 4, startAngle, sweepEnd); ctx.stroke();
      ctx.restore();
      return;
    }

    if (shot.kind === "orbital_blade") {
      ctx.save();
      ctx.translate(shot.x, shot.y);
      ctx.rotate((shot.angle ?? 0) + Math.PI / 2);
      const isOuter = game.evolved && (shot.bladeIndex ?? 0) >= 8;
      const bladeScale = isOuter ? 0.9 : 1.1;
      ctx.scale(bladeScale, bladeScale);
      ctx.fillStyle = game.evolved ? "rgba(236,72,153,0.35)" : "rgba(250,204,21,0.25)";
      ctx.beginPath();
      ctx.moveTo(0, -28); ctx.lineTo(9, -2); ctx.lineTo(5, 16);
      ctx.lineTo(0, 24); ctx.lineTo(-5, 16); ctx.lineTo(-9, -2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = game.evolved ? "#fdf2f8" : "#fefce8";
      ctx.beginPath();
      ctx.moveTo(0, -25); ctx.lineTo(6, -2); ctx.lineTo(3.5, 14);
      ctx.lineTo(0, 20); ctx.lineTo(-3.5, 14); ctx.lineTo(-6, -2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = game.evolved ? "#ec4899" : "#c084fc";
      ctx.fillRect(-1.5, -12, 3, 10);
      ctx.fillStyle = game.evolved ? "#f43f5e" : "#fbbf24";
      ctx.beginPath(); ctx.arc(0, 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = game.evolved ? "#831843" : "#6b21a8";
      ctx.fillRect(-9, 4, 18, 4.5);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(-2.5, 8.5, 5, 8);
      ctx.beginPath(); ctx.arc(0, 18.5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 4); ctx.stroke();
      ctx.restore();
      return;
    }

    const speed = Math.hypot(shot.vx, shot.vy) || 1;
    const trailLength = shot.kind === "sentinel_beam" ? 42 : shot.kind === "plasma_core" ? 28 : 24;
    const tailX = shot.x - shot.vx / speed * trailLength;
    const tailY = shot.y - shot.vy / speed * trailLength;
    ctx.save();
    ctx.lineCap = "round";
    const trail = ctx.createLinearGradient(tailX, tailY, shot.x, shot.y);
    if (shot.isAnchorBurst) {
      trail.addColorStop(0, "rgba(251,191,36,0)");
      trail.addColorStop(1, "rgba(255,241,179,.98)");
      ctx.strokeStyle = trail; ctx.lineWidth = 4;
    } else if (shot.isChainLightning) {
      trail.addColorStop(0, "rgba(34,211,238,0)");
      trail.addColorStop(1, "rgba(207,250,254,.98)");
      ctx.strokeStyle = trail; ctx.lineWidth = 3.5;
    } else if (shot.kind === "revolver_empowered") {
      trail.addColorStop(0, "rgba(168,85,247,0)");
      trail.addColorStop(1, "rgba(253,224,71,.98)");
      ctx.strokeStyle = trail; ctx.lineWidth = 4.5;
    } else if (shot.kind === "plasma_core") {
      trail.addColorStop(0, "rgba(239,68,68,0)");
      trail.addColorStop(1, game.evolved ? "rgba(216,180,254,.95)" : "rgba(252,165,165,.95)");
      ctx.strokeStyle = trail; ctx.lineWidth = 6;
    } else if (shot.kind === "sentinel_beam") {
      trail.addColorStop(0, game.evolved ? "rgba(127,29,29,0)" : "rgba(45,212,191,0)");
      trail.addColorStop(1, game.evolved ? "rgba(248,113,113,.98)" : "rgba(204,251,241,.98)");
      ctx.strokeStyle = trail; ctx.lineWidth = 3.2;
    } else {
      trail.addColorStop(0, "rgba(183,122,255,0)");
      trail.addColorStop(1, "rgba(226,196,255,.80)");
      ctx.strokeStyle = trail; ctx.lineWidth = 3.5;
    }
    ctx.globalAlpha = lifeRatio;
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(shot.x, shot.y); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(Math.atan2(shot.vy, shot.vx));
    ctx.globalAlpha = lifeRatio;
    if (shot.isAnchorBurst) {
      ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 0; ctx.fillStyle = "#fff1b3";
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, -2); ctx.lineTo(4, -7); ctx.lineTo(-7, 1); ctx.lineTo(-1, 2); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
    } else if (shot.isChainLightning) {
      ctx.shadowColor = "#67e8f9"; ctx.shadowBlur = 0; ctx.fillStyle = "#a5f3fc";
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(2, -2); ctx.lineTo(4, -7); ctx.lineTo(-7, 1); ctx.lineTo(-1, 2); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
    } else if (shot.kind === "revolver_empowered") {
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-10, -6); ctx.lineTo(-5, 0); ctx.lineTo(-10, 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-2, -2.5); ctx.lineTo(-2, 2.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, 0); ctx.stroke();
    } else if (shot.kind === "plasma_core") {
      const coreRadius = shot.radius ?? 14;
      const pulse = 1 + Math.sin(game.elapsed * 18) * 0.12;
      const r = coreRadius * pulse;
      if (game.evolved) {
        const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8);
        halo.addColorStop(0, "rgba(232,121,249,0.9)");
        halo.addColorStop(0.5, "rgba(147,51,234,0.4)");
        halo.addColorStop(1, "rgba(88,28,135,0)");
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#05000a";
        ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#f0abfc"; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.rotate(game.elapsed * 8);
        ctx.strokeStyle = "rgba(250,232,255,0.8)"; ctx.lineWidth = 1.4;
        ctx.strokeRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
      } else {
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.35, "#fde047");
        grad.addColorStop(0.75, "#ea580c");
        grad.addColorStop(1, "#b91c1c");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fef08a"; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (shot.kind === "sentinel_beam") {
      const ev = game.evolved;
      ctx.fillStyle = ev ? "rgba(239,68,68,0.38)" : "rgba(34,211,238,0.35)";
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-16, -5); ctx.lineTo(-16, 5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = ev ? "#dc2626" : "#06b6d4";
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(-14, -2.8); ctx.lineTo(-14, 2.8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(13, 0); ctx.lineTo(-10, -1.2); ctx.lineTo(-10, 1.2);
      ctx.closePath(); ctx.fill();
    } else if (shot.kind === "bullet") {
      const ev = game.evolved;
      ctx.fillStyle = ev ? "#f0abfc" : "#e9d5ff";
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-7, -4); ctx.lineTo(-3, 0); ctx.lineTo(-7, 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = ev ? "#fdf4ff" : "#fffbeb";
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(1, -1.8); ctx.lineTo(-3, 0); ctx.lineTo(1, 1.8);
      ctx.closePath(); ctx.fill();
    } else {
      const projectile = sprites.projectile;
      if (projectile?.complete && projectile.naturalWidth > 0) {
        ctx.shadowColor = "#b77aff"; ctx.shadowBlur = 0;
        ctx.drawImage(projectile, -15, -9, 30, 18);
      } else {
        ctx.shadowColor = "#b77aff"; ctx.shadowBlur = 0; ctx.fillStyle = "#c39aff";
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(0, -4); ctx.lineTo(-10, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff1ce"; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(0, -1.5); ctx.lineTo(-5, 0); ctx.lineTo(0, 1.5); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  });
  ctx.restore();

  // Selo Ritualístico e Vínculos de Almas do Grilhão.
  const gravityAura = game.gravityAuraShot;
  if (gravityAura?.active) {
    const spriteRadius = game.evolved ? 140 : 106;
    const visualScale = (gravityAura.radius ?? spriteRadius) / spriteRadius;
    const sprite = getWellSprite(spriteRadius, game.evolved);
    const lifeRatio = clamp(gravityAura.life / Math.max(0.01, gravityAura.maxLife ?? 9999), 0.08, 1);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    drawWellSpriteStatic(
      ctx,
      sprite,
      game.player.x,
      game.player.y,
      visualScale,
      Math.min(1, lifeRatio * 1.25) * 0.85,
    );

    const tetherList = game.gravityTethers;
    if (tetherList && tetherList.length > 0) {
      const chainColor = game.evolved ? "#f43f5e" : "#c084fc";
      const linkGlow = game.evolved ? "#fda4af" : "#f3e8ff";
      ctx.lineWidth = game.evolved ? 2.5 : 2;
      ctx.strokeStyle = chainColor;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -game.elapsed * 45;

      for (let i = 0; i < tetherList.length; i++) {
        const target = tetherList[i].enemy;
        if (target.hp <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(game.player.x, game.player.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        const midX = (game.player.x + target.x) / 2;
        const midY = (game.player.y + target.y) / 2;
        ctx.fillStyle = linkGlow;
        ctx.beginPath();
        ctx.arc(midX, midY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  ctx.save();
  game.rings?.forEach((ring) => {
    ctx.globalAlpha = clamp(ring.life * 2.4, 0, 1);
    ctx.strokeStyle = ring.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.restore();
  game.sentinelTotems.forEach((totem) => {
    if (totem.x < cameraX - 65 || totem.x > cameraX + viewWidth + 65 || totem.y < cameraY - 85 || totem.y > cameraY + viewHeight + 45) return;
    ctx.save();
    ctx.translate(totem.x, totem.y);
    const pulse = 1 + Math.sin(game.elapsed * 4 + totem.id) * 0.08;
    const aura = ctx.createRadialGradient(0, -10, 3, 0, -10, 48 * pulse);
    const ev = game.evolved;
    aura.addColorStop(0, ev ? "rgba(220,38,38,.38)" : "rgba(34,211,238,.34)");
    aura.addColorStop(0.55, ev ? "rgba(127,29,29,.16)" : "rgba(14,165,233,.14)");
    aura.addColorStop(1, "rgba(14,165,233,0)");
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, -10, 48 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.48)";
    ctx.beginPath(); ctx.ellipse(0, 10, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ev ? "#2a0707" : "#0b2633"; ctx.strokeStyle = ev ? "#ef4444" : "#67e8f9"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 12); ctx.lineTo(-10, -24); ctx.lineTo(-5, -34);
    ctx.lineTo(5, -34); ctx.lineTo(10, -24); ctx.lineTo(13, 12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = ev ? "rgba(248,113,113,.9)" : "rgba(250,204,21,.85)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(8, -16); ctx.moveTo(-9, 5); ctx.lineTo(9, 5); ctx.stroke();
    const glyphY = -43 + Math.sin(game.elapsed * 3.2 + totem.id) * 3;
    ctx.save();
    ctx.translate(0, glyphY);
    ctx.rotate(game.elapsed * 0.8);
    ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 0;
    ctx.fillStyle = ev ? "#f87171" : "#a5f3fc";
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#fef08a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(2,6,23,.88)"; ctx.fillRect(-17, -57, 34, 4);
    ctx.fillStyle = "#22d3ee"; ctx.fillRect(-17, -57, 34 * clamp(totem.hp / totem.maxHp, 0, 1), 4);
    ctx.strokeStyle = "rgba(226,232,240,.65)"; ctx.lineWidth = 0.7; ctx.strokeRect(-17, -57, 34, 4);
    ctx.restore();
  });
  game.enemies.forEach((enemy) => {
    if (enemy.x < cameraX - 88 || enemy.x > cameraX + viewWidth + 88 || enemy.y < cameraY - 100 || enemy.y > cameraY + viewHeight + 100) return;
    ctx.save();
    const motionPhase = game.elapsed * (enemy.dashTime > 0 ? 19 : enemy.type === "boss" ? 5 : 10) + enemy.x * 0.017 + enemy.y * 0.013;
    const distortion = Math.sin(motionPhase);
    const secondaryWave = Math.cos(motionPhase * 0.67);
    const hover = enemy.type === "wraith" || enemy.type === "elite" ? secondaryWave * 1.7 : Math.abs(distortion) * 0.55;
    ctx.translate(enemy.x, enemy.y + hover);
    ctx.transform(1 + distortion * 0.035, secondaryWave * 0.028, Math.sin(motionPhase * 0.43) * 0.022, 1 - distortion * 0.03, 0, 0);
    if(enemy.isExecutioner){const aura=ctx.createRadialGradient(0,0,8,0,0,76);aura.addColorStop(0,"rgba(58,17,83,.62)");aura.addColorStop(.55,"rgba(104,38,143,.25)");aura.addColorStop(1,"rgba(104,38,143,0)");ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,0,76,0,Math.PI*2);ctx.fill();ctx.strokeStyle="rgba(197,142,255,.8)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,38+Math.sin(game.elapsed*7)*4,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="#d8c4ff";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(14,-8);ctx.lineTo(42,-40);ctx.stroke();ctx.fillStyle="#e9d5ff";ctx.beginPath();ctx.moveTo(42,-40);ctx.lineTo(49,-55);ctx.lineTo(37,-45);ctx.closePath();ctx.fill();}
    const bossInFury = enemy.type === "boss" && enemy.hp <= enemy.maxHp * 0.30;
    if (bossInFury) {
      const firePulse = 1 + Math.sin(game.elapsed * 17) * 0.08;
      const fireAura = ctx.createRadialGradient(0, 0, 12, 0, 0, 78 * firePulse);
      fireAura.addColorStop(0, "rgba(255,75,65,.28)"); fireAura.addColorStop(.55, "rgba(151,18,42,.24)"); fireAura.addColorStop(1, "rgba(151,18,42,0)");
      ctx.fillStyle = fireAura; ctx.beginPath(); ctx.arc(0, 0, 78 * firePulse, 0, Math.PI * 2); ctx.fill();
      for (let flame = 0; flame < 6; flame++) { const angle = game.elapsed * 2.8 + flame * Math.PI / 3; const radius = 49 + Math.sin(game.elapsed * 13 + flame) * 8; ctx.fillStyle = "rgba(255,75,55,.72)"; ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 3 + (flame % 2), 0, Math.PI * 2); ctx.fill(); }
    }
    if (enemy.type === "charger" && enemy.dashTime > 0) {
      ctx.rotate(Math.atan2(enemy.targetY, enemy.targetX) * 0.12);
      ctx.scale(1.12, 0.9);
    } else if (enemy.type === "brute" && enemy.windup > 0) {
      ctx.scale(1.06, 0.9);
    } else if (enemy.type === "boss" && enemy.windup > 0) {
      ctx.scale(1.04, 0.96);
    }
    if (enemy.type === "boss" && enemy.windup > 0) { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(game.elapsed * 18) * 0.08; ctx.strokeStyle = "#d8b5ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(enemy.targetX - enemy.x, enemy.targetY - enemy.y, 88, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgba(177,112,220,.12)"; ctx.beginPath(); ctx.arc(enemy.targetX - enemy.x, enemy.targetY - enemy.y, 88, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (enemy.type === "brute" && enemy.windup > 0) { ctx.save(); ctx.globalAlpha = .25 + Math.sin(game.elapsed * 20) * .2; ctx.strokeStyle = "#ffb36b"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgba(255,150,75,.13)"; ctx.fill(); ctx.restore(); }
    if (enemy.type === "charger" && enemy.windup > 0) { ctx.save(); ctx.rotate(Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x)); ctx.globalAlpha = .55 + Math.sin(game.elapsed * 24) * .2; ctx.strokeStyle = "#ffc477"; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(125, 0); ctx.stroke(); ctx.restore(); }
    if (enemy.type === "elite") { ctx.save(); ctx.globalAlpha = .18 + Math.sin(game.elapsed * 4) * .06; ctx.strokeStyle = "#d69cff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 105, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    const hurt = enemy.flash > 0;
    const enemySprite = enemy.type === "boss" ? sprites.boss : enemy.type === "elite" ? sprites.elite : enemy.type === "wraith" ? sprites.wraith : enemy.type === "charger" ? sprites.charger : sprites.brute;
    if (enemySprite?.complete && enemySprite.naturalWidth > 0) {
      ctx.save();
      const dimensions: Record<Enemy["type"], [number, number, number]> = {
        boss: [78, 98, 0.68], elite: [46, 52, 0.68], wraith: [34, 52, 0.62],
        charger: [46, 48, 0.66], brute: [56, 64, 0.68],
      };
      const [spriteWidth, spriteHeight, anchor] = dimensions[enemy.type];
      if (bossInFury) {
        ctx.filter = "brightness(1.15) sepia(1) saturate(4) hue-rotate(315deg)";
      }
      ctx.shadowColor = bossInFury ? "#d41438" : enemy.type === "brute" ? "#9b7bce" : enemy.type === "charger" ? "#b58cff" : "#8b68ff";
      ctx.shadowBlur = 0;
      // Um único passe por sprite evita a troca individual para composição aditiva.
      ctx.globalAlpha = hurt ? 0.68 : 1;
      ctx.drawImage(enemySprite, -spriteWidth / 2, -spriteHeight * anchor, spriteWidth, spriteHeight);
      if (bossInFury) {
        ctx.filter = "none";
      }
      ctx.restore();
    } else if (enemy.type === "wraith") {
      ctx.shadowColor = enemy.color; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#827394";
      ctx.beginPath(); ctx.moveTo(-enemy.radius, 3); ctx.quadraticCurveTo(-enemy.radius * 1.2, -enemy.radius, 0, -enemy.radius * 1.1); ctx.quadraticCurveTo(enemy.radius * 1.2, -enemy.radius, enemy.radius, 3); ctx.lineTo(enemy.radius * .55, enemy.radius * .45); ctx.lineTo(0, enemy.radius * .12); ctx.lineTo(-enemy.radius * .55, enemy.radius * .45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d9b8ff"; ctx.fillRect(-4, -3, 3, 4); ctx.fillRect(2, -3, 3, 4);
    } else if (enemy.type === "charger") {
      ctx.rotate(Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x));
      ctx.shadowColor = "#f0a75d"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#b46f42";
      ctx.beginPath(); ctx.moveTo(enemy.radius * 1.35, 0); ctx.lineTo(-enemy.radius * .8, -enemy.radius * .85); ctx.lineTo(-enemy.radius * .4, 0); ctx.lineTo(-enemy.radius * .8, enemy.radius * .85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe0a1"; ctx.fillRect(enemy.radius * .25, -2, 4, 4);
    } else if (enemy.type === "brute") {
      ctx.shadowColor = "#a8a6b7"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#57586b";
      ctx.beginPath(); ctx.moveTo(-enemy.radius, -enemy.radius * .55); ctx.lineTo(-enemy.radius * .55, -enemy.radius); ctx.lineTo(enemy.radius * .65, -enemy.radius * .9); ctx.lineTo(enemy.radius, -enemy.radius * .2); ctx.lineTo(enemy.radius * .8, enemy.radius); ctx.lineTo(-enemy.radius * .8, enemy.radius); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#b4a8c9"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#e0a5ff"; ctx.fillRect(-4, -4, 8, 6);
    } else if (enemy.type === "elite") {
      ctx.rotate(game.elapsed * .35); ctx.shadowColor = "#d69cff"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#6f4c8c";
      ctx.beginPath(); for (let i=0;i<8;i++){const a=i*Math.PI/4;const rr=i%2===0?enemy.radius*1.2:enemy.radius*.72;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);} ctx.closePath();ctx.fill();
      ctx.strokeStyle="#e5c5ff";ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#fff0ff";ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
    } else {
      ctx.shadowColor = "#b78bff"; ctx.shadowBlur = 0; ctx.fillStyle = hurt ? "#fff" : "#33233f";
      ctx.beginPath(); ctx.moveTo(-enemy.radius*.9, enemy.radius*.65); ctx.lineTo(-enemy.radius*.8,-enemy.radius*.7); ctx.lineTo(-enemy.radius*.35,-enemy.radius*1.15); ctx.lineTo(enemy.radius*.35,-enemy.radius*1.15); ctx.lineTo(enemy.radius*.8,-enemy.radius*.7); ctx.lineTo(enemy.radius*.9,enemy.radius*.65); ctx.lineTo(0,enemy.radius*1.05); ctx.closePath();ctx.fill();
      ctx.strokeStyle="#d7b5ff";ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle="#08060d";ctx.beginPath();ctx.ellipse(0,-enemy.radius*.15,enemy.radius*.42,enemy.radius*.55,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#caa1ff";ctx.shadowColor="#c17cff";ctx.shadowBlur = 0;ctx.fillRect(-enemy.radius*.25,-enemy.radius*.2,enemy.radius*.16,4);ctx.fillRect(enemy.radius*.1,-enemy.radius*.2,enemy.radius*.16,4);
      ctx.strokeStyle="rgba(211,166,255,.65)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-enemy.radius*.7,enemy.radius*.6);ctx.lineTo(-enemy.radius*1.3,enemy.radius*1.3);ctx.moveTo(enemy.radius*.7,enemy.radius*.6);ctx.lineTo(enemy.radius*1.3,enemy.radius*1.3);ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (enemy.type === "boss" || enemy.isExecutioner || enemy.hp < enemy.maxHp) {
      const barW = enemy.type === "boss" || enemy.isExecutioner ? 86 : 30;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW, 4);
      ctx.fillStyle = enemy.isExecutioner ? "#b56cff" : bossInFury ? "#ef334f" : "#e87979"; ctx.fillRect(-barW / 2, -enemy.radius - 10, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4); if(enemy.isExecutioner){ctx.font="900 9px Inter,system-ui";ctx.textAlign="center";ctx.fillStyle="#ead7ff";ctx.fillText("ALGOZ ESPECTRAL",0,-enemy.radius-15);}
    }
    ctx.restore();
  });
  // Buckets persistentes: reutiliza os grupos sem criar Map/arrays a cada frame.
  if (game.particles.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const color in sharedParticleBuckets) {
      sharedParticleBuckets[color].length = 0;
    }
    for (let i = 0; i < game.particles.length; i++) {
      const particle = game.particles[i];
      if (particle.x < cameraX - 16 || particle.x > cameraX + viewWidth + 16 || particle.y < cameraY - 16 || particle.y > cameraY + viewHeight + 16) continue;
      let group = sharedParticleBuckets[particle.color];
      if (!group) {
        group = [];
        sharedParticleBuckets[particle.color] = group;
      }
      group.push(particle);
    }
    for (const color in sharedParticleBuckets) {
      const group = sharedParticleBuckets[color];
      if (!group || group.length === 0) continue;
      ctx.beginPath();
      for (let i = 0; i < group.length; i++) {
        const p = group[i];
        const size = 1.2 + clamp(p.life * 2, 0, 1) * 2.1;
        const angle = Math.atan2(p.vy, p.vx);
        const dx = Math.cos(angle) * size, dy = Math.sin(angle) * size;
        const px = -dy * 0.38, py = dx * 0.38;
        ctx.moveTo(p.x - dx, p.y - dy);
        ctx.lineTo(p.x + px, p.y + py);
        ctx.lineTo(p.x + dx, p.y + dy);
        ctx.lineTo(p.x - px, p.y - py);
        ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.78;
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  if (showDamageNumbers) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 15px Inter, ui-sans-serif, system-ui, sans-serif";
    ctx.lineJoin = "round";
    for (const number of game.damageNumbers) {
      const progress = 1 - number.life / number.maxLife;
      const alpha = clamp(number.life / number.maxLife, 0, 1);
      const label = `−${Math.max(1, Math.round(number.value))}`;
      const y = number.y - progress * 13;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(20,7,17,.92)";
      ctx.shadowColor = "rgba(255,53,89,.9)";
      ctx.shadowBlur = 0;
      ctx.strokeText(label, number.x, y);
      ctx.fillStyle = "#fff4ed";
      ctx.fillText(label, number.x, y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Protagonista chibi: mistura os quadros antigos e novos para transições suaves.
  ctx.save(); ctx.translate(player.x, player.y);
  const bob = Math.sin(game.elapsed * (player.moving ? 13 : 3.4)) * (player.moving ? 1.6 : 0.8);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath(); ctx.ellipse(0, 13, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, bob);
  const auraPulse = 0.94 + Math.sin(game.elapsed * 4.4) * 0.07;
  const hitIntensity = clamp(player.hitFlash / 0.3, 0, 1);
  const auraColor = hitIntensity > 0.02 ? "rgba(248,36,63,.22)" : "rgba(166,111,237,.18)";
  ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = auraColor;
  ctx.beginPath();
  ctx.ellipse(0, 2, (25 + hitIntensity * 6) * auraPulse, (31 + hitIntensity * 6) * auraPulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hitIntensity > 0.02 ? "rgba(255,76,99,.46)" : "rgba(204,163,255,.28)";
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.ellipse(0, 2, 28 * auraPulse, 34 * auraPulse, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (player.moving) {
    const runWave = Math.sin(game.elapsed * 16 + player.facing * 0.8);
    ctx.transform(1 + runWave * 0.018, runWave * 0.012, -runWave * 0.015, 1 - runWave * 0.014, 0, 0);
  }
  const getPlayerSheet = (action: PlayerVisualAction) =>
    action === "cast" ? sprites.playerCast : action === "move" ? sprites.playerMove : sprites.playerIdle;
  const isPlayerSheetReady = (sheet?: HTMLImageElement) =>
    !!sheet?.complete && sheet.naturalWidth >= 384 && sheet.naturalHeight >= 64;
  const currentSheet = getPlayerSheet(player.spriteAction);
  const previousSheet = getPlayerSheet(player.previousSpriteAction);
  const currentReady = isPlayerSheetReady(currentSheet);
  const previousReady = isPlayerSheetReady(previousSheet);
  if (currentReady) {
    const baseAlpha = player.invuln > 0 && Math.floor(game.elapsed * 14) % 2 === 0 ? 0.62 : 1;
    const blend = previousReady ? clamp(player.spriteBlend, 0, 1) : 1;
    ctx.globalAlpha = baseAlpha * (previousReady ? 1 - blend : 1);
    if (previousReady && blend < 1) {
      ctx.drawImage(previousSheet!, player.previousSpriteDirection * 48, 0, 48, 64, -25, -34, 50, 68);
    }
    ctx.globalAlpha = baseAlpha * (previousReady ? blend : 1);
    ctx.drawImage(currentSheet!, player.spriteDirection * 48, 0, 48, 64, -25, -34, 50, 68);
    if (hitIntensity > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = hitIntensity * 0.75;
      ctx.drawImage(currentSheet!, player.spriteDirection * 48, 0, 48, 64, -25, -34, 50, 68);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (player.spriteAction === "cast" && player.castTimer > 0) {
      const aim = PLAYER_DIRECTION_VECTORS[player.spriteDirection] ?? PLAYER_DIRECTION_VECTORS[0];
      ctx.save(); ctx.translate(aim.x * 19, aim.y * 16 - 2);
      ctx.globalAlpha = clamp(player.castTimer / 0.24, 0.35, 1);
      ctx.shadowColor = "#c28aff"; ctx.shadowBlur = 0; ctx.fillStyle = "#f0dcff";
      ctx.beginPath(); ctx.arc(0, 0, 3.2 + Math.sin(game.elapsed * 46) * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(216,175,255,.9)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  } else {
    // Fallback vetorial enquanto as imagens carregam ou em caso de falha de rede.
    ctx.shadowColor = hitIntensity > 0.02 ? "#ff2448" : player.invuln > 0 ? "#ff7182" : "#a75cff"; ctx.shadowBlur = 0;
    ctx.fillStyle = "#292039"; ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-9, -13); ctx.lineTo(0, -19); ctx.lineTo(9, -13); ctx.lineTo(13, 8); ctx.lineTo(7, 14); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#8d65b5"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#4a315e"; ctx.beginPath(); ctx.moveTo(-10,-7);ctx.lineTo(-5,-17);ctx.lineTo(2,-20);ctx.lineTo(10,-12);ctx.lineTo(7,1);ctx.lineTo(0,9);ctx.lineTo(-8,2);ctx.closePath();ctx.fill();
    ctx.fillStyle = player.invuln > 0 && Math.floor(game.elapsed * 14) % 2 === 0 ? "#fff" : "#e5c9a0";
    ctx.beginPath(); ctx.ellipse(0,-7,6.5,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#17121f";ctx.beginPath();ctx.moveTo(-8,-9);ctx.lineTo(0,-20);ctx.lineTo(9,-10);ctx.lineTo(4,-8);ctx.lineTo(-5,-7);ctx.closePath();ctx.fill();
    ctx.fillStyle="#d9c4ff";ctx.fillRect(-4,-7,2.5,2);ctx.fillRect(2,-7,2.5,2);
    ctx.strokeStyle="#d7b5ff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,-1);ctx.lineTo(17,-12);ctx.stroke();
    ctx.fillStyle="#d5a7ff";ctx.shadowColor="#bd7cff";ctx.shadowBlur = 0;ctx.beginPath();ctx.arc(18,-13,3.5,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha=1;
  if (showPlayerHp) {
    const barW = 42, barY = -44, ratio = clamp(player.hp / Math.max(1, player.maxHp), 0, 1);
    ctx.fillStyle = "rgba(8,6,15,.82)"; ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, 6);
    ctx.fillStyle = "rgba(104,33,55,.95)"; ctx.fillRect(-barW / 2, barY, barW, 4);
    ctx.fillStyle = "#f06480"; ctx.fillRect(-barW / 2, barY, barW * ratio, 4);
    ctx.strokeStyle = "rgba(255,225,232,.68)"; ctx.lineWidth = 0.7; ctx.strokeRect(-barW / 2, barY, barW, 4);
  }
  ctx.restore();
  game.pickupLabels.forEach((label) => {
    const alpha = clamp(label.life / label.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "900 13px Inter, ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(12,7,20,.94)";
    ctx.shadowColor = "rgba(228,190,255,.85)";
    ctx.shadowBlur = 0;
    ctx.strokeText(label.text, label.x, label.y);
    ctx.fillStyle = "#ffe6ae";
    ctx.fillText(label.text, label.x, label.y);
    ctx.restore();
  });
  ctx.restore();

  if (corruption > 0) {
    ctx.fillStyle = `rgba(139, 76, 190, ${0.025 + corruption * 0.012})`;
    ctx.fillRect(0, 0, width, height);
  }
}

export function FractalArena({ isMaster = false }: { isMaster?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const queryClient = useQueryClient();
  const gameRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const dashRequestRef = useRef(false);
  const eventRewardRemainingRef = useRef(0);
  const [desktopSupported, setDesktopSupported] = useState(false);
  const [missionId, setMissionId] = useState(1);
  const [missionPickerOpen, setMissionPickerOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const syncSupport = () => setDesktopSupported(media.matches);
    syncSupport();
    media.addEventListener("change", syncSupport);
    return () => media.removeEventListener("change", syncSupport);
  }, []);
  const [exchangeAmount, setExchangeAmount] = useState("10");
  const [coinBalance, setCoinBalance] = useState(0);
  const [corruption, setCorruption] = useState(0);
  const [running, setRunning] = useState(false);
  const [preparingArena, setPreparingArena] = useState(false);
  const preparingArenaRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [levelChoices, setLevelChoices] = useState<Upgrade[]>([]);
  const [selectedUpgrade, setSelectedUpgrade] = useState<Upgrade | null>(null);
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);
  const [eventRewardStep, setEventRewardStep] = useState(0);
  const [hud, setHud] = useState({ hp: 100, maxHp: 100, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, moveSpeed: 205, fps: 0, visibleEnemies: 0, phase: "Exploração", pressure: 0, event: null as null | { id: number; remaining: number; progress: number; inside: boolean }, runes: [] as { id: string; name: string; count: number; rarity: string }[] });
  const [stats, setStats] = useState({ totalDamageDealt: 0, crystalsCollected: 0, highestLevel: 1 });
  const [result, setResult] = useState<"victory" | "defeat" | null>(null);
  const [bossMessage, setBossMessage] = useState(false);
  const [pausePanel, setPausePanel] = useState<"main" | "attributes" | "runes" | "master">("main");
  const [masterGiftListOpen, setMasterGiftListOpen] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 3>(1);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [fractalBalance, setFractalBalance] = useState(0);
  const [unlockedCorruption, setUnlockedCorruption] = useState(0);
  const [completedCorruptions, setCompletedCorruptions] = useState<number[]>([]);
  const [purchases, setPurchases] = useState<PurchaseState>(DEFAULT_PURCHASES);
  const [showPlayerHp, setShowPlayerHp] = useState(true);
  const [showDamageNumbers, setShowDamageNumbers] = useState(true);
  const [shopSection, setShopSection] = useState<"permanent" | "relics" | "weapons" | "omens">("permanent");
  const [shopInfo, setShopInfo] = useState<ShopItemInfo | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>("void_revolver");
  const [masterWeaponSelection, setMasterWeaponSelection] = useState<WeaponId | null>(null);
  const [selectedOmen, setSelectedOmen] = useState<OmenId | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => fractalAudio.isMuted());
  const [earnedFractals, setEarnedFractals] = useState<number | null>(null);
  const [rewardStatus, setRewardStatus] = useState<"pending" | "confirmed" | "error">("pending");
  const [shopBusy, setShopBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const toggleAudio = () => {
    const nextMute = fractalAudio.toggleMute();
    setIsMuted(nextMute);
    toast.info(nextMute ? "Áudio desativado" : "Efeitos sonoros ativados");
  };
  const spritesRef = useRef<SpriteMap>({});
  useEffect(() => {
    let cancelled = false;
    const assets: Record<SpriteKey, string> = {
      playerIdle: "/fractals/sprites/player-idle-8dir.png",
      playerMove: "/fractals/sprites/player-move-8dir.png",
      playerCast: "/fractals/sprites/player-cast-8dir.png",
      boss: "/fractals/sprites/enemies/boss.svg",
      elite: "/fractals/sprites/enemies/elite.svg",
      wraith: "/fractals/sprites/enemies/wraith.svg",
      charger: "/fractals/sprites/enemies/charger.svg",
      brute: "/fractals/sprites/enemies/brute.svg",
      xpGem: "/fractals/sprites/drops/xp-gem.svg",
      specialXP: "/fractals/sprites/drops/special-xp.svg",
      specialArea: "/fractals/sprites/drops/special-area.svg",
      specialRange: "/fractals/sprites/drops/special-range.svg",
      specialProjectiles: "/fractals/sprites/drops/special-projectiles.svg",
      projectile: "/fractals/sprites/projectile.svg",
    };
    (Object.entries(assets) as [SpriteKey, string][]).forEach(([key, src]) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { if (!cancelled) spritesRef.current[key] = image; };
      image.src = src;
    });
    return () => { cancelled = true; };
  }, []);

  // Baixa e decodifica o cenário antes da primeira partida, evitando a troca tardia do piso e dos sprites.
  useEffect(() => { void preloadCemeteryImages(); }, []);

  const refreshFractalState = useCallback(async () => {
    const { data, error } = await (supabase.rpc as any)("get_fractal_state");
    if (error) { setShopError("Aplique as migrações SQL 0005 e 0006 para ativar a loja e a progressão."); return; }
    setFractalBalance(Number(data?.fractals ?? 0));
    setCoinBalance(Number(data?.coins ?? 0));
    setUnlockedCorruption(Number(data?.corruptionUnlocked ?? 0));
    setCompletedCorruptions(Array.isArray(data?.completedCorruptions) ? data.completedCorruptions : []);
    setPurchases(parsePurchaseState(data?.purchasedUpgrades));
  }, []);

  useEffect(() => { void refreshFractalState(); }, [refreshFractalState]);

  const purchaseUpgrade = async (upgrade: string) => {
    setShopBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)("purchase_fractal_upgrade", { _upgrade: upgrade });
      if (error) throw error;
      setFractalBalance(Number(data?.fractals ?? 0));
      setCoinBalance(Number(data?.coins ?? coinBalance));
      setPurchases(parsePurchaseState(data?.purchasedUpgrades));
      toast.success("Melhoria comprada permanentemente.");
    } catch (error: any) { toast.error(error?.message ?? "Não foi possível comprar."); }
    finally { setShopBusy(false); }
  };

  const exchangeFractals = async () => {
    const amount = Number(exchangeAmount);
    if (!Number.isInteger(amount) || amount < 10 || amount % 10 !== 0) {
      toast.error("Escolha uma quantidade em múltiplos de 10 fractais.");
      return;
    }
    if (amount > fractalBalance) {
      toast.error("Você não possui fractais suficientes.");
      return;
    }
    setShopBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)("exchange_fractals_for_coins", { _fractals: amount });
      if (error) throw error;
      setFractalBalance(Number(data?.fractals ?? 0));
      setCoinBalance(Number(data?.coins ?? 0));
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(amount.toLocaleString("pt-BR") + " fractais convertidos em " + (amount / 10).toLocaleString("pt-BR") + " moedas.");
    } catch (error: any) {
      if (error?.code === "PGRST202") toast.error("Aplique a migração SQL 0007 para habilitar a troca por moedas.");
      else toast.error(error?.message ?? "Não foi possível converter os fractais.");
    } finally {
      setShopBusy(false);
    }
  };

  const start = useCallback(async () => {
    if (!desktopSupported || preparingArenaRef.current) return;
    preparingArenaRef.current = true;
    setPreparingArena(true);
    fractalAudio.unlock();
    setEarnedFractals(null);
    setRewardStatus("pending");
    try {
      // A partida só começa quando as imagens do cenário estão prontas (ou falharam e usarão o fallback vetorial).
      await preloadCemeteryImages();
      // Pré-aquece os dois sprites fixos do Grilhão durante a tela de preparação.
      // O tamanho da aura será escalado na renderização, sem criar canvases por upgrade.
      if (selectedWeapon === "gravity_shackle") {
        getWellSprite(106, false);
        getWellSprite(140, true);
      }
      const { data: newRunId, error: runError } = await (supabase.rpc as any)("start_fractal_run", { _corruption: corruption, _weapon: selectedWeapon, _omen: corruption >= 4 && purchases.omen_archive ? selectedOmen : null });
      if (runError) { toast.error(runError.message); return; }
      setRunId(newRunId);
      dashRequestRef.current = false;
      keysRef.current.clear();
      const rect = canvasRef.current?.getBoundingClientRect();
      const width = Math.max(320, rect?.width ?? 760);
      const height = Math.max(380, rect?.height ?? 520);
      const game = makeGame(width, height, purchases, selectedWeapon, selectedOmen);
      spawnCemeteryUrns(game, 12);
      gameRef.current = game;
      setMasterWeaponSelection(null);
      eventRewardRemainingRef.current = 0;
      setEventRewardStep(0);
      setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: 0, nextXp: 12, level: 1, kills: 0, elapsed: 0, moveSpeed: Math.round(game.player.speed), fps: 0, visibleEnemies: 0, phase: "Exploração", pressure: 0, event: null, runes: [] });
      setStats({ totalDamageDealt: 0, crystalsCollected: 0, highestLevel: 1 });
      setLevelChoices([]); setSelectedUpgrade(null); setFlippedCardId(null); setPaused(false); setResult(null); setBossMessage(false); setRunning(true);
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível preparar o cenário.");
    } finally {
      preparingArenaRef.current = false;
      setPreparingArena(false);
    }
  }, [corruption, purchases, selectedWeapon, selectedOmen, desktopSupported]);

  const finishRun = useCallback((victory: boolean) => {
    if (!runId) {
      setRewardStatus("error");
      toast.error("Não foi possível localizar a expedição para validar as recompensas.");
      return;
    }

    setRewardStatus("pending");
    setEarnedFractals(null);

    void (supabase.rpc as any)("finish_fractal_run", { _run_id: runId, _victory: victory })
      .then(({ data, error }: any) => {
        if (error) {
          setRewardStatus("error");
          toast.error(error.message);
          return;
        }

        if (data?.earnedFractals === undefined) {
          setRewardStatus("error");
          toast.error("Aplique a migração 0008 para ativar a economia de recompensas dos Fractais.");
          return;
        }

        const earned = Number(data.earnedFractals ?? 0);
        const safeEarned = Number.isFinite(earned) ? Math.max(0, earned) : 0;
        setEarnedFractals(safeEarned);
        setRewardStatus("confirmed");
        setFractalBalance(Number(data?.fractals ?? 0));
        setCoinBalance(Number(data?.coins ?? 0));
        setPurchases(parsePurchaseState(data?.purchasedUpgrades));

        if (victory) {
          setUnlockedCorruption(Number(data?.corruptionUnlocked ?? 0));
          setCompletedCorruptions(Array.isArray(data?.completedCorruptions) ? data.completedCorruptions : []);
          toast.success(safeEarned > 0 ? `Expedição vitoriosa! Você conquistou ${safeEarned} fractais.` : "Corrupção concluída. O próximo nível foi liberado.");
        } else if (safeEarned > 0) {
          toast.info(`Você sobreviveu bravamente e resgatou ${safeEarned} fractais.`);
        } else {
          toast.info("Expedição encerrada. Não houve fractais extras nesta tentativa.");
        }
      })
      .catch((error: unknown) => {
        setRewardStatus("error");
        toast.error(error instanceof Error ? error.message : "Não foi possível validar as recompensas.");
      });
  }, [runId]);

  const chooseUpgrade = useCallback((upgrade: Upgrade) => {
    setSelectedUpgrade(null);
    setFlippedCardId(null);
    const game = gameRef.current;
    if (!game) return;
    const rarityPower = getUpgradeRarityMultiplier(upgrade.rarity);
    const existingRune = game.upgradeCounts[upgrade.id];
    game.upgradeCounts[upgrade.id] = { name: upgrade.name, count: (existingRune?.count ?? 0) + 1, rarity: upgrade.rarity ?? existingRune?.rarity ?? "normal" };
    if (upgrade.id === "special_area" && game.player.specialAreaStacks < MAX_AREA_RELIC_STACKS) { game.player.specialAreaStacks += 1; game.player.pickupRadius = 85 * (1 + game.player.specialAreaStacks * 0.10); }
    if (upgrade.id === "special_experience" && game.player.specialExperienceStacks < MAX_EXPERIENCE_RELIC_STACKS) { game.player.specialExperienceStacks += 1; game.player.xpMultiplier = 1 + game.player.specialExperienceStacks * 0.05; }
    if (upgrade.id === "special_projectile_range" && game.player.projectileRangeStacks < MAX_PROJECTILE_RANGE_STACKS) { game.player.projectileRangeStacks += 1; game.player.projectileRangeMultiplier = 1 + game.player.projectileRangeStacks * 0.10; }
    if (upgrade.id === "special_projectiles" && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) { game.player.projectileStacks += 1; }
    if (upgrade.id === "special_ricochet" && game.player.relicRicochet < 3) game.player.relicRicochet += 1;
    if (upgrade.id === "special_piercing" && game.player.relicPiercing < 3) game.player.relicPiercing += 1;
    if (upgrade.id === "special_chain_lightning" && game.player.relicChainLightning < 3) game.player.relicChainLightning += 1;
    if (upgrade.id === "weapon_mastery" && game.weaponLevel < 10) {
      game.weaponLevel += 1;
      game.player.damage *= 1 + 0.045 * rarityPower;
      game.player.fireRate /= 1 + 0.0125 * rarityPower;
      game.pickupLabels.push({ x: game.player.x, y: game.player.y - 28, text: `Arma nível ${game.weaponLevel}/10`, life: 1.4, maxLife: 1.4 });
    }
    if (upgrade.id === "weapon_evolution" && !game.evolved && (isMaster || (game.weaponLevel >= 10 && purchases[weaponProjectKey(game.weaponId)]))) {
      if (isMaster) game.weaponLevel = 10;
      game.evolved = true;
      game.player.damage *= 1.35;
      game.player.fireRate /= 1.10;
      game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 12, max: 230, life: 1.2, color: "#fbbf24" }];
      toast.success(`${WEAPON_CONFIG[game.weaponId].evolutionName} despertou!`);
    }
    if (upgrade.id === "anchor_soul" && (isMaster || purchases.anchor_soul >= 1) && game.anchorRevivesUsed < 2 && !game.anchorReviveAvailable) {
      game.anchorReviveAvailable = true;
      game.pickupLabels.push({ x: game.player.x, y: game.player.y - 28, text: "Âncora da Alma vinculada", life: 1.5, maxLife: 1.5 });
    }
    if (upgrade.id === "power") game.player.damage *= 1 + 0.30 * rarityPower;
    // Attack speed uses a direct rate multiplier, so the displayed bonus matches the real effect.
    if (upgrade.id === "haste") game.player.fireRate /= 1 + 0.18 * rarityPower;
    if (upgrade.id === "vitality") {
      const previousMaxHp = game.player.maxHp;
      game.player.maxHp = previousMaxHp * (1 + 0.15 * rarityPower);
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + previousMaxHp * 0.25 * rarityPower);
    }
    if (upgrade.id === "swift") game.player.speed *= 1 + 0.10 * rarityPower;
    if (eventRewardRemainingRef.current > 0) {
      eventRewardRemainingRef.current -= 1;
      if (eventRewardRemainingRef.current > 0) {
        setEventRewardStep(2);
        setSelectedUpgrade(null);
        setFlippedCardId(null);
        setLevelChoices(buildLevelChoices(game, purchases));
        return;
      }
      setEventRewardStep(0);
    }
    setLevelChoices([]);
  }, [isMaster, purchases]);

  const applyUpgrade = (upgrade: Upgrade) => chooseUpgrade(upgrade);

  const rerollGiftChoices = () => {
    const game = gameRef.current;
    if (!game || game.rerollsRemaining <= 0 || levelChoices.length === 0) return;

    const choiceSignature = (choices: Upgrade[]) =>
      choices.map((choice) => `${choice.id}:${choice.rarity ?? "normal"}`).sort().join("|");
    const previousSignature = choiceSignature(levelChoices);

    game.rerollsRemaining -= 1;
    setSelectedUpgrade(null);
    setFlippedCardId(null);

    let nextChoices = buildLevelChoices(game, purchases);
    // A rerrolagem deve realmente trocar a seleção. Evita consumir um uso
    // quando o sorteio devolve exatamente as mesmas cartas e raridades.
    for (let attempt = 0; attempt < 8 && choiceSignature(nextChoices) === previousSignature; attempt += 1) {
      nextChoices = buildLevelChoices(game, purchases);
    }

    if (choiceSignature(nextChoices) === previousSignature) {
      game.rerollsRemaining += 1;
      toast.error("Não há outra combinação disponível. Sua rerrolagem foi devolvida.");
      return;
    }

    setLevelChoices(nextChoices);
    toast.info(`Dádivas rerroladas. Restam ${game.rerollsRemaining} uso(s) nesta partida.`);
  };

  const banishGiftChoice = (upgrade: Upgrade) => {
    const game = gameRef.current;
    if (!game || game.banishesRemaining <= 0 || upgrade.id === "weapon_mastery" || upgrade.id === "weapon_evolution") return;
    if (game.bannedUpgradeIds.includes(upgrade.id)) return;

    const isBasicGift = UPGRADES.some((item) => item.id === upgrade.id);
    const remainingBasicGifts = UPGRADES.filter((item) => !game.bannedUpgradeIds.includes(item.id));
    if (isBasicGift && remainingBasicGifts.length <= 1) {
      toast.error("Mantenha pelo menos uma dádiva básica disponível para a partida.");
      return;
    }

    const targetChoiceCount = levelChoices.length;
    const remainingChoices = levelChoices.filter((choice) => choice.id !== upgrade.id);
    game.bannedUpgradeIds.push(upgrade.id);
    game.banishesRemaining -= 1;

    // O Exílio remove a dádiva da partida e repõe o espaço com outra opção
    // elegível, sem duplicar cartas que o jogador decidiu manter.
    const replacements: Upgrade[] = [];
    for (let attempt = 0; attempt < 8 && remainingChoices.length + replacements.length < targetChoiceCount; attempt += 1) {
      for (const candidate of buildLevelChoices(game, purchases)) {
        const alreadyVisible = [...remainingChoices, ...replacements].some((choice) => choice.id === candidate.id);
        if (candidate.id === upgrade.id || alreadyVisible) continue;
        replacements.push(candidate);
        if (remainingChoices.length + replacements.length >= targetChoiceCount) break;
      }
    }

    const nextChoices = [...remainingChoices, ...replacements].slice(0, targetChoiceCount);
    setSelectedUpgrade(null);
    setFlippedCardId(null);
    setLevelChoices(nextChoices);

    if (nextChoices.length < targetChoiceCount) {
      toast.info(`${upgrade.name} foi exilada. Não havia outra dádiva elegível para preencher todos os espaços.`);
    } else {
      toast.info(`${upgrade.name} foi exilada e substituída. Ela não voltará nesta partida.`);
    }
  };

  useEffect(() => {
    if (!running || !desktopSupported) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastHud = 0;
    let fpsFrames = 0;
    let fpsWindowStart = 0;
    let measuredFps = 0;
    let bossNotified = false;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const compactDevice = window.matchMedia("(max-width: 680px)").matches;
      const dpr = Math.min(window.devicePixelRatio || 1, compactDevice ? 1 : 1.25);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = compactDevice ? "low" : "medium";
      const game = gameRef.current;
      if (game) { game.width = rect.width; game.height = rect.height; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='button']")) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat && !paused && levelChoices.length === 0 && gameRef.current && !gameRef.current.ended) dashRequestRef.current = true;
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
      keysRef.current.add(event.key.toLowerCase());
      if (event.key.toLowerCase() === "p" || event.key === "Escape") setPaused((v) => !v);
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    const onBlur = () => { keysRef.current.clear(); dashRequestRef.current = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const handleEnemyDefeat = (game: GameState, enemy: Enemy, sourceShot?: Shot) => {
      if (enemy.hp > 0) return;
      if (sourceShot?.kind === "scythe_slash" && game.weaponId === "spectral_scythe" && (game.upgradeCounts.gift_scythe_siphon?.count ?? 0) > 0 && (game.scytheSiphonCooldown ?? 0) <= 0) {
        const siphonLevel = game.upgradeCounts.gift_scythe_siphon?.count ?? 0;
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + game.player.maxHp * 0.015 * siphonLevel);
        game.scytheSiphonCooldown = 1.8;
      }
      game.kills += 1;
      fractalAudio.kill(enemy.type === "boss" || enemy.type === "elite");
      if (enemy.type !== "boss") {
        game.gems.push({ x: enemy.x, y: enemy.y, value: enemy.xp, radius: 5 });
        const fortuneBonus = [0, 0.10, 0.20, 0.30, 0.40, 0.50][Math.max(0, Math.min(5, purchases.fortune))];
        const highestFieldRelicLevel = Math.max(purchases.area, purchases.experience, purchases.projectile_range, purchases.projectiles, purchases.ricochet, purchases.piercing, purchases.chain_lightning);
        const baseRelicDropChance = [0, 0, 0.01, 0.03, 0.05][Math.max(0, Math.min(4, highestFieldRelicLevel))];
        const specialDropChance = baseRelicDropChance > 0
          ? Math.min(0.12, baseRelicDropChance * (1 + fortuneBonus) * game.omenRewardMultiplier)
          : 0;
        if (!enemy.isExecutioner && (enemy.type === "elite" || enemy.type === "brute") && specialDropChance > 0 && Math.random() < specialDropChance) {
          const eligible: SpecialDrop["kind"][] = [];
          if (purchases.area >= 1 && game.player.specialAreaStacks < MAX_AREA_RELIC_STACKS) eligible.push("area");
          if (purchases.experience >= 1 && game.player.specialExperienceStacks < MAX_EXPERIENCE_RELIC_STACKS) eligible.push("experience");
          if (purchases.projectile_range >= 1 && game.player.projectileRangeStacks < MAX_PROJECTILE_RANGE_STACKS) eligible.push("projectile_range");
          if (purchases.projectiles >= 1 && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) eligible.push("projectiles");
          const projectileRelicsSupported = supportsProjectileRelics(game.weaponId);
          if (projectileRelicsSupported && purchases.ricochet >= 1 && game.player.relicRicochet < 3) eligible.push("ricochet");
          if (projectileRelicsSupported && purchases.piercing >= 1 && game.player.relicPiercing < 3) eligible.push("piercing");
          if (projectileRelicsSupported && purchases.chain_lightning >= 1 && game.player.relicChainLightning < 3) eligible.push("chain_lightning");
          eligible.push("food", "void");
          if (eligible.length) game.specialDrops.push({ x: enemy.x, y: enemy.y, kind: eligible[Math.floor(Math.random() * eligible.length)], radius: 13 });
        }
        if(enemy.isExecutioner){
          game.specialDrops.push({x:enemy.x-18,y:enemy.y,kind:"food",radius:15},{x:enemy.x+18,y:enemy.y,kind:"void",radius:15});
          game.challengeEvent=null;eventRewardRemainingRef.current=2;setEventRewardStep(1);setSelectedUpgrade(null);setFlippedCardId(null);
          setLevelChoices(buildLevelChoices(game,purchases));
          toast.success("Algoz Espectral derrotado! O cemitério reverbera com dádivas!");
        }
      } else { game.ended = true; setStats({ totalDamageDealt: Math.round(game.totalDamageDealt), crystalsCollected: game.crystalsCollected, highestLevel: game.highestLevel }); setResult("victory"); fractalAudio.victory(); finishRun(true); }
      {
        const big = enemy.type === "boss" || enemy.type === "elite";
        const count = big ? 20 : 6;
        for (let i = 0; i < count && game.particles.length < 80; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 50 + Math.random() * (big ? 200 : 120);
          game.particles.push({
            x: enemy.x, y: enemy.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.28 + Math.random() * 0.25,
            color: i % 3 === 0 ? "#fff1ff" : i % 3 === 1 ? "#b98cff" : enemy.color,
          });
        }
        (game.rings ??= []).push({
          x: enemy.x, y: enemy.y, r: 6,
          max: big ? 140 : 42,
          life: big ? 0.5 : 0.26,
          color: big ? "#e9c46a" : "#c9a2ff",
        });
        if (big) game.shake = Math.max(game.shake ?? 0, enemy.type === "boss" ? 16 : 8);
      }
                
    };

    const tick = (now: number) => {
      const game = gameRef.current;
      if (!game) return;
      if (!game.last) game.last = now;
      const rawDt = Math.min(0.033, (now - game.last) / 1000);
      const dt = rawDt * speedMultiplier;
      game.last = now;
      if (!game.ended && !paused && levelChoices.length === 0) {
        game.elapsed += dt;
        game.scytheSiphonCooldown = Math.max(0, (game.scytheSiphonCooldown ?? 0) - dt);
        game.player.invuln = Math.max(0, game.player.invuln - dt);
        game.player.hitFlash = Math.max(0, game.player.hitFlash - dt);
        game.damageNumbers.forEach((number) => { number.life -= dt; number.y -= 24 * dt; number.x += number.drift * dt; });
        compactAlive(game.damageNumbers);
        game.pickupLabels.forEach((label) => { label.life -= dt; label.y -= 18 * dt; });
        compactAlive(game.pickupLabels);
        game.player.castTimer = Math.max(0, game.player.castTimer - dt);
        game.player.dashCooldown = Math.max(0, game.player.dashCooldown - dt);
        const keys = keysRef.current;
        let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
        let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
        if (game.dashChainRemaining > 0) {
          game.dashChainWindow = Math.max(0, game.dashChainWindow - dt);
          if (game.dashChainWindow <= 0) {
            game.dashChainRemaining = 0;
            game.player.dashCooldown = Math.max(game.player.dashCooldown, 1.25);
          }
        }
        if (dashRequestRef.current && game.player.dashTimer <= 0) {
          dashRequestRef.current = false;
          const canUseFollowUp = purchases.dash >= 3 && game.dashChainRemaining > 0 && game.dashChainWindow > 0;
          if (game.player.dashCooldown <= 0 || canUseFollowUp) {
            let dashX = dx, dashY = dy;
            if (Math.hypot(dashX, dashY) < 0.05) {
              const facing = PLAYER_DIRECTION_VECTORS[game.player.facing] ?? PLAYER_DIRECTION_VECTORS[0];
              dashX = facing.x; dashY = facing.y;
            }
            const dashLength = Math.max(1, Math.hypot(dashX, dashY));
            game.player.dashX = dashX / dashLength;
            game.player.dashY = dashY / dashLength;
            game.player.dashTimer = 0.18;
            game.dashHitTargets.clear();
            if (canUseFollowUp) {
              game.dashChainRemaining = 0;
              game.dashChainWindow = 0;
              game.player.dashCooldown = 1.25;
            } else if (purchases.dash >= 3) {
              game.dashChainRemaining = 1;
              game.dashChainWindow = 0.55;
              game.player.dashCooldown = 0;
            } else {
              game.dashChainRemaining = 0;
              game.dashChainWindow = 0;
              game.player.dashCooldown = 1.25;
            }
          }
        }
        const inputDashX = dx, inputDashY = dy;
        const isDashing = game.player.dashTimer > 0;
        if (isDashing) {
          if (purchases.dash >= 3 && Math.hypot(inputDashX, inputDashY) > 0.05) {
            const inputLength = Math.hypot(inputDashX, inputDashY);
            game.player.dashX = inputDashX / inputLength;
            game.player.dashY = inputDashY / inputLength;
          }
          dx = game.player.dashX; dy = game.player.dashY;
          if (purchases.dash >= 1) game.player.invuln = Math.max(game.player.invuln, dt);
          game.player.dashTimer = Math.max(0, game.player.dashTimer - dt);
        }
        game.player.moving = isDashing || Math.hypot(dx, dy) > 0.05;
        if (game.player.moving) game.player.facing = directionFromVector(dx, dy);
        const mag = Math.hypot(dx, dy) || 1;
        const movementSpeed = isDashing ? 650 : game.player.speed;
        const previousPlayerX = game.player.x, previousPlayerY = game.player.y;
        const movedPlayer = resolveCemeteryCollision(game.player.x + (dx / mag) * movementSpeed * dt, game.player.y + (dy / mag) * movementSpeed * dt, 14, game.obstacles);
        game.player.x = movedPlayer.x;
        game.player.y = movedPlayer.y;
        if (isDashing && purchases.dash >= 2) {
          const segmentX = game.player.x - previousPlayerX;
          const segmentY = game.player.y - previousPlayerY;
          const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;
          const dashDamage = getEquippedWeaponStrikeDamage(game) * 0.10;
          for (const enemy of game.enemies) {
            if (enemy.hp <= 0 || game.dashHitTargets.has(enemy)) continue;
            const toEnemyX = enemy.x - previousPlayerX;
            const toEnemyY = enemy.y - previousPlayerY;
            const projection = segmentLengthSq > 0
              ? clamp((toEnemyX * segmentX + toEnemyY * segmentY) / segmentLengthSq, 0, 1)
              : 0;
            const closestX = previousPlayerX + segmentX * projection;
            const closestY = previousPlayerY + segmentY * projection;
            const hitRadius = enemy.radius + 12;
            const hitX = enemy.x - closestX, hitY = enemy.y - closestY;
            if (hitX * hitX + hitY * hitY > hitRadius * hitRadius) continue;
            game.dashHitTargets.add(enemy);
            game.shots.push({
              x: enemy.x, y: enemy.y, vx: 0, vy: 0, damage: dashDamage,
              life: 0.2, maxLife: 0.2, hitTargets: [], bouncesRemaining: 0,
              piercesRemaining: 0, kind: "dash_strike", targetEnemy: enemy,
            });
          }
        }

        if (!game.challengeEvent && game.nextChallengeEvent < CHALLENGE_EVENT_TIMES.length && game.elapsed >= CHALLENGE_EVENT_TIMES[game.nextChallengeEvent]) {
          const eventId = (game.nextChallengeEvent + 1) as 1 | 2;
          game.nextChallengeEvent += 1;
          if (eventId === 1) {
            const angle = Math.random() * Math.PI * 2;
            const offset = 175;
            game.challengeEvent = { id: 1, x: clamp(game.player.x + Math.cos(angle) * offset, -WORLD_LIMIT + 130, WORLD_LIMIT - 130), y: clamp(game.player.y + Math.sin(angle) * offset, -WORLD_LIMIT + 130, WORLD_LIMIT - 130), radius: 110, remaining: RITUAL_WINDOW, progress: 0 };
            toast.info("Ritual da Fenda Rúnica! Acumule 25 segundos dentro do círculo em até 50 segundos.");
          } else {
            const angle = Math.random() * Math.PI * 2;
            const ex = clamp(game.player.x + Math.cos(angle) * 360, -WORLD_LIMIT + 80, WORLD_LIMIT - 80);
            const ey = clamp(game.player.y + Math.sin(angle) * 360, -WORLD_LIMIT + 80, WORLD_LIMIT - 80);
            game.enemies.push({ x: ex, y: ey, hp: 1850, maxHp: 1850, speed: 62, radius: 30, damage: 22, color: "#8b45b5", xp: 0, type: "elite", attack: 1.2, flash: 0, windup: 0, targetX: ex, targetY: ey, dashTime: 0, summonedAtHalf: false, furyTriggered: false, isExecutioner: true });
            game.challengeEvent = { id: 2, x: ex, y: ey, radius: 0, remaining: EXECUTIONER_WINDOW, progress: 0 };
            toast.warning("Caçada do Algoz Espectral! Derrote-o em 60 segundos.");
          }
        }

        const activeEvent = game.challengeEvent;
        if (activeEvent) {
          activeEvent.remaining = Math.max(0, activeEvent.remaining - dt);
          if (activeEvent.id === 1) {
            const insideEvent = distance(game.player.x, game.player.y, activeEvent.x, activeEvent.y) <= activeEvent.radius;
            if (insideEvent) activeEvent.progress = Math.min(RITUAL_DURATION, activeEvent.progress + dt);
            if (activeEvent.progress >= RITUAL_DURATION) {
              const centerX = activeEvent.x, centerY = activeEvent.y;
              for (const enemy of game.enemies) {
                const d = distance(centerX, centerY, enemy.x, enemy.y);
                if (d < 275 && enemy.type !== "boss" && enemy.hp > 0) { enemy.hp = 0; game.kills += 1; }
                else if (d < 430) { const push = (430 - d) * 0.8; const angle = Math.atan2(enemy.y - centerY, enemy.x - centerX); enemy.x = clamp(enemy.x + Math.cos(angle) * push, -WORLD_LIMIT + enemy.radius, WORLD_LIMIT - enemy.radius); enemy.y = clamp(enemy.y + Math.sin(angle) * push, -WORLD_LIMIT + enemy.radius, WORLD_LIMIT - enemy.radius); }
              }
              game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
              game.rings = [...(game.rings ?? []), { x: centerX, y: centerY, r: 12, max: 460, life: 1.1, color: "#c084fc" }];
              game.shake = Math.max(game.shake ?? 0, 13);
              for(let i=0;i<42;i++){const a=Math.random()*Math.PI*2,sp=70+Math.random()*260;game.particles.push({x:centerX,y:centerY,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.5+Math.random()*.5,color:i%2?"#d8b4fe":"#f0abfc"});}
              game.challengeEvent = null; eventRewardRemainingRef.current = 2; setEventRewardStep(1); setSelectedUpgrade(null); setFlippedCardId(null);
              setLevelChoices(buildLevelChoices(game,purchases));
              toast.success("Ritual da Fenda Rúnica concluído! A onda de choque rompeu a horda. Duas dádivas aguardam.");
            } else if (activeEvent.remaining <= 0) {
              game.challengeEvent = null; toast.error("O Ritual da Fenda Rúnica se dissipou antes de ser concluído.");
            }
          } else if (activeEvent.remaining <= 0) {
            game.enemies = game.enemies.filter((enemy) => !enemy.isExecutioner);
            game.challengeEvent = null; toast.error("O Algoz Espectral escapou para o Vazio.");
          }
        }

        const snapshot = getDifficultySnapshot(missionId, game.elapsed, corruption);
        const eventDensityBonus = game.challengeEvent ? 2 : 0;
        const spawnInterval = clamp(1.18 / (snapshot.enemySpawnScale * game.omenSpawnMultiplier + eventDensityBonus), 0.22, 1.35);
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0 && game.enemies.length < 50 && game.elapsed < RUN_DURATION_SECONDS) {
          spawnEnemy(game, missionId, game.elapsed, corruption);
          game.spawnTimer = spawnInterval * (0.78 + Math.random() * 0.45);
        }
        // O Guardião só desperta ao fim dos 12 minutos completos.
        game.shotTimer -= dt;
        // Grilhão não procura alvos nem dispara projéteis: sua aura é atualizada abaixo.
        if (game.weaponId !== "gravity_shackle" && game.shotTimer <= 0) {
          const maxRange = 280 * game.player.projectileRangeMultiplier;
          const maxRangeSq = maxRange * maxRange;
          let target: Enemy | null = null;
          let bestScore = Infinity;
          for (const enemy of game.enemies) {
            if (enemy.hp <= 0) continue;
            const dx = enemy.x - game.player.x;
            const dy = enemy.y - game.player.y;
            const distSq = dx * dx + dy * dy;
            if (game.weaponId === "void_revolver" && distSq > maxRangeSq) continue;
            const priority = enemy.type === "boss" ? 120 : enemy.type === "elite" ? 45 : enemy.type === "charger" ? 20 : 0;
            const score = Math.sqrt(distSq) - priority;
            if (score < bestScore) { bestScore = score; target = enemy; }
          }
          if (target) {
          const baseAngle = Math.atan2(target.y - game.player.y, target.x - game.player.x);
          const weaponPower = (1 + (game.weaponLevel - 1) * 0.055) * (game.evolved ? 1.15 : 1);
          const weaponDamage = game.player.damage * weaponPower;

          if (game.weaponId === "void_revolver") {
            game.revolverShotCount = (game.revolverShotCount ?? 0) + 1;
            const isEmpowered = game.revolverShotCount % 6 === 0;
            const projectileCount = game.evolved ? 6 + game.player.projectileStacks : 1 + game.player.projectileStacks;
            const spread = projectileCount === 1 ? [0] : game.evolved
              ? Array.from({ length: projectileCount }, (_, index) => (index - (projectileCount - 1) / 2) * 0.13)
              : projectileCount === 2 ? [-0.08, 0.08] : [-0.15, 0, 0.15];
            const speed = (isEmpowered ? 580 : 470) * game.player.projectileRangeMultiplier;
            const damageMultiplier = isEmpowered ? 2.4 : game.evolved ? 0.85 : 1;
            for (const angleOffset of spread) {
              const angle = baseAngle + angleOffset;
              const life = game.player.projectileLife * (isEmpowered ? 1.25 : 1);
              game.shots.push({
                x: game.player.x, y: game.player.y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                damage: weaponDamage * damageMultiplier, life, maxLife: life,
                hitTargets: [], bouncesRemaining: game.player.relicRicochet + (game.evolved ? 1 : 0) + (isEmpowered ? (game.upgradeCounts.gift_revolver_echo?.count ?? 0) : 0),
                piercesRemaining: game.player.relicPiercing + (isEmpowered ? 3 : 0),
                kind: isEmpowered ? "revolver_empowered" : "bullet",
              });
            }
            game.player.castFacing = directionFromVector(target.x - game.player.x, target.y - game.player.y);
            game.player.castTimer = 0.24;
            game.shotTimer = game.player.fireRate * 0.95;
          } else if (game.weaponId === "unstable_core") {
            const speed = 100 * game.player.projectileRangeMultiplier;
            const life = game.player.projectileLife * 0.65;
            const coreCount = 1 + Math.min(MAX_EXTRA_PROJECTILES, game.player.projectileStacks);
            for (let index = 0; index < coreCount; index++) {
              const angleOffset = (index - (coreCount - 1) / 2) * 0.18;
              const angle = baseAngle + angleOffset;
              game.shots.push({
                x: game.player.x, y: game.player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                damage: weaponDamage * 1.275, life, maxLife: life,
                hitTargets: [], bouncesRemaining: game.player.relicRicochet, piercesRemaining: game.player.relicPiercing,
                kind: "plasma_core", radius: game.evolved ? 18 : 13,
              });
            }
            game.player.castFacing = directionFromVector(target.x - game.player.x, target.y - game.player.y);
            game.player.castTimer = 0.24;
            game.shotTimer = game.player.fireRate * 3.3;
          } else if (game.weaponId === "spectral_scythe") {
            const arcSpan = game.evolved ? Math.PI * 1.33 : Math.PI * 0.92;
            const slashRadius = (game.evolved ? 205 : 150)
              * (1 + game.player.specialAreaStacks * 0.1)
              * game.player.projectileRangeMultiplier
              * (1 + (game.upgradeCounts.gift_scythe_arc?.count ?? 0) * 0.12);
            const facingVector = PLAYER_DIRECTION_VECTORS[game.player.facing] ?? PLAYER_DIRECTION_VECTORS[0];
            const slashAngle = Math.atan2(facingVector.y, facingVector.x);
            game.shots.push({
              x: game.player.x, y: game.player.y, vx: 0, vy: 0,
              damage: weaponDamage * (game.evolved ? 1.68 : 1.32) * (1 + game.player.projectileStacks * 0.12),
              life: 0.28, maxLife: 0.28, hitTargets: [],
              bouncesRemaining: 0, piercesRemaining: 999,
              kind: "scythe_slash", angle: slashAngle, arcSpan, radius: slashRadius,
            });
            for (let p = 0; p < 8; p++) {
              const pAngle = slashAngle + (Math.random() - 0.5) * arcSpan;
              const pDist = slashRadius * (0.85 + Math.random() * 0.3);
              game.particles.push({
                x: game.player.x + Math.cos(pAngle) * pDist, y: game.player.y + Math.sin(pAngle) * pDist,
                vx: Math.cos(pAngle) * (40 + Math.random() * 80), vy: Math.sin(pAngle) * (40 + Math.random() * 80),
                life: 0.35 + Math.random() * 0.25, color: game.evolved ? (Math.random() > 0.5 ? "#2dd4bf" : "#0b0f17") : (Math.random() > 0.4 ? "#5eead4" : "#99f6e4"),
              });
            }
            game.player.castFacing = game.player.facing;
            game.player.castTimer = 0.24;
            game.shotTimer = game.player.fireRate * 1.05;
          } else if (game.weaponId === "orbital_swords") {
            const baseBlades = game.weaponLevel >= 10 ? 8 : 3 + Math.floor((game.weaponLevel - 1) / 2);
            const relicBlades = game.player.projectileStacks ?? 0;
            const evolutionBlades = game.evolved ? 4 : 0;
            const bladeCount = Math.min(14, baseBlades + relicBlades + evolutionBlades);
            game.shots = game.shots.filter((shot) => shot.kind !== "orbital_blade" || (shot.bladeIndex ?? 0) < bladeCount);
            for (let index = 0; index < bladeCount; index++) {
              const existing = game.shots.find((shot) => shot.kind === "orbital_blade" && shot.bladeIndex === index);
              if (existing) {
                existing.totalBlades = bladeCount;
                existing.damage = weaponDamage * 0.75 * (1 + (game.upgradeCounts.gift_orbital_edge?.count ?? 0) * 0.12);
                continue;
              }
              game.shots.push({
                x: game.player.x, y: game.player.y, vx: 0, vy: 0,
                damage: weaponDamage * 0.75 * (1 + (game.upgradeCounts.gift_orbital_edge?.count ?? 0) * 0.12), life: 9999, maxLife: 9999,
                hitTargets: [], bouncesRemaining: 0, piercesRemaining: 999,
                kind: "orbital_blade", bladeIndex: index, totalBlades: bladeCount, radius: 20,
              });
            }
            game.shotTimer = 0.5;
          } else if (game.weaponId === "rune_sentinels") {
            // Os totens estacionários disparam por conta própria; este timer apenas evita
            // que o loop genérico de armas execute repetidamente enquanto há alvos.
            game.shotTimer = game.player.fireRate * 0.8;
          }

          if (game.weaponId !== "orbital_swords" && game.weaponId !== "rune_sentinels") fractalAudio.shoot();
          }
        }
        // Grilhão: o selo visual acompanha o herói e permanece ativo nas duas formas.
        if (game.weaponId === "gravity_shackle") {
          const auraRadius = (game.evolved ? 140 : 106)
            * (1 + game.player.specialAreaStacks * 0.1)
            * game.player.projectileRangeMultiplier
            * (1 + game.player.projectileStacks * 0.06);
          let aura = game.gravityAuraShot;
          if (!aura) {
            aura = {
              x: game.player.x, y: game.player.y, vx: 0, vy: 0,
              damage: getEquippedWeaponStrikeDamage(game) * (game.evolved ? 0.75 : 0.5625) * (1 + (game.upgradeCounts.gift_gravity_resonance?.count ?? 0) * 0.15),
              life: 9999, maxLife: 9999, hitTargets: [], bouncesRemaining: 0, piercesRemaining: 999,
              kind: "gravity_well", radius: auraRadius, pulseTimer: 0, isAura: true, active: true,
            };
            game.gravityAuraShot = aura;
            game.shots.push(aura);
          }
          aura.x = game.player.x;
          aura.y = game.player.y;
          aura.radius = auraRadius;
          aura.damage = getEquippedWeaponStrikeDamage(game) * (game.evolved ? 0.75 : 0.5625) * (1 + (game.upgradeCounts.gift_gravity_resonance?.count ?? 0) * 0.15);
          aura.life = 9999;
          aura.maxLife = 9999;
          // A aura fica visível continuamente; apenas os impactos das correntes têm intervalo.
          aura.active = true;
          game.gravityAuraActive = true;
        } else {
          // A aura só é removida quando há uma referência ativa; evita alocar um array por frame.
          if (game.gravityAuraShot) {
            const auraIndex = game.shots.indexOf(game.gravityAuraShot);
            if (auraIndex >= 0) game.shots.splice(auraIndex, 1);
            game.gravityAuraShot = undefined;
          }
          game.gravityAuraActive = true;
        }

        const desiredAction: PlayerVisualAction = game.player.castTimer > 0 ? "cast" : game.player.moving ? "move" : "idle";
        const desiredDirection = desiredAction === "cast" ? game.player.castFacing : game.player.facing;
        if (desiredAction !== game.player.spriteAction || desiredDirection !== game.player.spriteDirection) {
          game.player.previousSpriteAction = game.player.spriteAction;
          game.player.previousSpriteDirection = game.player.spriteDirection;
          game.player.spriteAction = desiredAction;
          game.player.spriteDirection = desiredDirection;
          game.player.spriteBlend = 0;
        } else if (game.player.spriteBlend < 1) {
          game.player.spriteBlend = Math.min(1, game.player.spriteBlend + dt / 0.12);
        }
        game.shots.forEach((shot) => {
          if (shot.kind === "dash_strike" && shot.targetEnemy) {
            shot.x = shot.targetEnemy.x;
            shot.y = shot.targetEnemy.y;
          } else if (shot.kind === "orbital_blade") {
            const bladeCount = Math.max(1, shot.totalBlades ?? 3);
            const bladeIndex = shot.bladeIndex ?? 0;
            const isOuterBlade = game.evolved && bladeIndex >= 8;
            const orbitDistance = (isOuterBlade ? 98 : 65)
              * (1 + game.player.specialAreaStacks * 0.1)
              * game.player.projectileRangeMultiplier
              * (1 + (game.upgradeCounts.gift_orbital_orbit?.count ?? 0) * 0.12);
            const attackSpeedFactor = 0.72 / Math.max(0.18, game.player.fireRate);
            const rotationGiftLevel = game.upgradeCounts.gift_orbital_velocity?.count ?? 0;
            const rot = game.elapsed * (3.2 * attackSpeedFactor) * (1 + rotationGiftLevel * 0.12) * (isOuterBlade ? -1 : 1);
            const angle = rot + (bladeIndex * Math.PI * 2) / bladeCount;
            shot.x = game.player.x + Math.cos(angle) * orbitDistance;
            shot.y = game.player.y + Math.sin(angle) * orbitDistance;
            shot.angle = angle;
          } else if (shot.kind === "scythe_slash") {
            shot.x = game.player.x;
            shot.y = game.player.y;
          } else if (shot.kind === "gravity_well" && shot.isAura) {
            // A aura apenas acompanha o jogador; não aplica atração.
            shot.x = game.player.x;
            shot.y = game.player.y;
          } else if (shot.kind !== "plasma_puddle") {
            if (shot.targetEnemy) {
              if (shot.targetEnemy.hp <= 0) { shot.life = 0; return; }
              const dx = shot.targetEnemy.x - shot.x, dy = shot.targetEnemy.y - shot.y;
              const d = Math.max(1, Math.hypot(dx, dy));
              const speed = Math.max(1, Math.hypot(shot.vx, shot.vy));
              shot.vx = (dx / d) * speed;
              shot.vy = (dy / d) * speed;
            }
            shot.x += shot.vx * dt;
            shot.y += shot.vy * dt;
          }
          if (shot.kind === "plasma_puddle") {
            shot.pulseTimer = (shot.pulseTimer ?? 0) - dt;
          }
          shot.life -= dt;
        });
        // The Core leaves a damaging singularity either on impact or when its flight expires.
        for (const shot of [...game.shots]) {
          if (shot.kind === "plasma_core" && shot.life <= 0 && !shot.hasDetonated) {
            shot.hasDetonated = true;
            spawnPlasmaPuddle(game, shot.x, shot.y, shot.damage);
          }
        }
        game.orbitalPulseTimer = (game.orbitalPulseTimer ?? 0) - dt;
        if (game.orbitalPulseTimer <= 0) {
          for (const shot of game.shots) if (shot.kind === "orbital_blade") shot.hitTargets = [];
          game.orbitalPulseTimer = 0.35;
        }
        // Projectiles and temporary fields have bounded lifetimes; don't cull attacks just because
        // the camera moved away while they were still travelling or dealing area damage.
        compactAlive(game.shots);
        if (game.weaponId === "rune_sentinels") {
          game.sentinelRespawnTimer = Math.max(0, game.sentinelRespawnTimer - dt);
          const baseTotemLimit = game.weaponLevel >= 10 ? 3 : game.weaponLevel >= 5 ? 2 : 1;
          const totemLimit = baseTotemLimit + game.player.projectileStacks;
          if (game.sentinelRespawnTimer <= 0 && game.sentinelTotems.length < totemLimit) {
            while (game.sentinelTotems.length < totemLimit) {
              const index = game.sentinelTotems.length;
              const totemId = game.nextSentinelTotemId++;
              let angle = ((totemId - 1) * 2.399963229728653) % (Math.PI * 2);
              let orbitRadius = 118;
              let position = resolveCemeteryCollision(
                game.player.x + Math.cos(angle) * orbitRadius,
                game.player.y + Math.sin(angle) * orbitRadius,
                14,
                game.obstacles,
              );
              for (let attempt = 0; attempt < 10 && game.sentinelTotems.some((existing) => distance(position.x, position.y, existing.x, existing.y) < 72); attempt++) {
                angle = (angle + 2.399963229728653) % (Math.PI * 2);
                orbitRadius = 118 + ((attempt % 3) + 1) * 24;
                position = resolveCemeteryCollision(
                  game.player.x + Math.cos(angle) * orbitRadius,
                  game.player.y + Math.sin(angle) * orbitRadius,
                  14,
                  game.obstacles,
                );
              }
              const maxHp = 260 + game.weaponLevel * 20;
              game.sentinelTotems.push({
                id: totemId,
                x: position.x, y: position.y,
                hp: maxHp, maxHp, attackTimer: 0.18 + index * 0.08, radius: 14,
              });
            }
          }
          for (const totem of game.sentinelTotems) {
            totem.hp = Math.max(0, totem.hp - 1.0 * dt);
            totem.attackTimer -= dt;
            if (totem.attackTimer > 0 || totem.hp <= 0) continue;
            const attackRange = (game.evolved ? 420 : 210) * (1 + game.player.specialAreaStacks * 0.1) * game.player.projectileRangeMultiplier;
            const target = game.enemies
              .filter((enemy) => enemy.hp > 0 && distance(totem.x, totem.y, enemy.x, enemy.y) <= attackRange)
              .sort((a, b) => distance(totem.x, totem.y, a.x, a.y) - distance(totem.x, totem.y, b.x, b.y))[0];
            if (!target) continue;
            const dx = target.x - totem.x, dy = target.y - totem.y;
            const length = Math.max(1, Math.hypot(dx, dy));
            const beamSpeed = 750;
            const life = length / beamSpeed + 0.15;
            game.shots.push({
              x: totem.x, y: totem.y,
              vx: (dx / length) * beamSpeed, vy: (dy / length) * beamSpeed,
              damage: getEquippedWeaponStrikeDamage(game) * (1 + (game.upgradeCounts.gift_sentinel_focus?.count ?? 0) * 0.12),
              life, maxLife: life, hitTargets: [], bouncesRemaining: 0,
              piercesRemaining: 1, kind: "sentinel_beam", targetEnemy: target,
            });
            const relayLevel = game.upgradeCounts.gift_sentinel_relay?.count ?? 0;
            totem.attackTimer = Math.max(0.24, game.player.fireRate * 0.8 / (1 + relayLevel * 0.10));
          }
        } else {
          game.sentinelTotems = [];
          game.sentinelRespawnTimer = 0;
        }

        const movementGrid = game.enemies.length < 20 ? buildEnemySpatialGrid(game.enemies) : null;
        for (const enemy of game.enemies) {
          const d = Math.max(1, distance(game.player.x, game.player.y, enemy.x, enemy.y));
          enemy.flash = Math.max(0, enemy.flash - dt);
          enemy.attack = Math.max(0, enemy.attack - dt);
          const movementFactor = (enemy.slowTimer ?? 0) > 0 ? (enemy.slowFactor ?? 0.7) : 1;
          enemy.slowTimer = Math.max(0, (enemy.slowTimer ?? 0) - dt);
          if (enemy.slowTimer <= 0) enemy.slowFactor = undefined;
          const aggroTotem = game.weaponId === "rune_sentinels"
            ? game.sentinelTotems
                .filter((totem) => totem.hp > 0 && distance(enemy.x, enemy.y, totem.x, totem.y) <= 280)
                .sort((a, b) => distance(enemy.x, enemy.y, a.x, a.y) - distance(enemy.x, enemy.y, b.x, b.y))[0]
            : undefined;
          if (aggroTotem) {
            enemy.windup = 0;
            enemy.dashTime = 0;
            let aggroSpeedMultiplier = 1;
            if (enemy.type === "boss") {
              const bossInFury = enemy.hp <= enemy.maxHp * 0.30;
              if (bossInFury && !enemy.furyTriggered) {
                enemy.furyTriggered = true;
                game.shake = 14;
                for (let particle = 0; particle < 26; particle++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = 70 + Math.random() * 190;
                  game.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45 + Math.random() * 0.45, color: particle % 2 ? "#ff4b55" : "#ff9a54" });
                }
                toast.error("O GUARDIÃO ENTROU EM FÚRIA!");
              }
              aggroSpeedMultiplier = bossInFury ? 1.35 : enemy.hp <= enemy.maxHp * 0.5 ? 1.16 : 1;
              if (enemy.hp <= enemy.maxHp * 0.5 && !enemy.summonedAtHalf) {
                enemy.summonedAtHalf = true;
                for (let index = 0; index < 3; index++) {
                  const angle = (Math.PI * 2 * index) / 3;
                  game.enemies.push({ x: enemy.x + Math.cos(angle) * 58, y: enemy.y + Math.sin(angle) * 58, hp: 34, maxHp: 34, speed: 62, radius: 10, damage: 8, color: "#9b91b4", xp: 2, type: "wraith", attack: 0, flash: 0, windup: 0, targetX: 0, targetY: 0, dashTime: 0, summonedAtHalf: false, furyTriggered: false });
                }
              }
            }
            const totemDistance = Math.max(1, distance(enemy.x, enemy.y, aggroTotem.x, aggroTotem.y));
            if (totemDistance > aggroTotem.radius + enemy.radius + 14) {
              const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
              const steerX = (aggroTotem.x - enemy.x) / totemDistance + separation.x * 0.24;
              const steerY = (aggroTotem.y - enemy.y) / totemDistance + separation.y * 0.24;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * movementFactor * aggroSpeedMultiplier * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * movementFactor * aggroSpeedMultiplier * dt;
            } else if (enemy.attack <= 0) {
              aggroTotem.hp = Math.max(0, aggroTotem.hp - enemy.damage * (enemy.type === "brute" ? 1.35 : 1));
              enemy.attack = enemy.type === "boss" ? 1.25 : enemy.type === "brute" ? 1.1 : 0.85;
            }
          } else if (enemy.type === "boss") {
            const inFury = enemy.hp <= enemy.maxHp * 0.30;
            if (inFury && !enemy.furyTriggered) {
              enemy.furyTriggered = true;
              game.shake = 14;
              for (let i = 0; i < 26; i++) { const angle = Math.random() * Math.PI * 2; const speed = 70 + Math.random() * 190; game.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45 + Math.random() * 0.45, color: i % 2 ? "#ff4b55" : "#ff9a54" }); }
              toast.error("O GUARDIÃO ENTROU EM FÚRIA!");
            }
            if (enemy.windup > 0) {
              enemy.windup -= dt;
              if (enemy.windup <= 0 && distance(game.player.x, game.player.y, enemy.targetX, enemy.targetY) < 101 && game.player.invuln <= 0) {
                game.player.hp = Math.max(0, game.player.hp - getPlayerDamageTaken(game, 28)); game.player.invuln = 0.85; game.player.hitFlash = 0.3; 
              }
            } else if (enemy.attack <= 0) {
              const phaseTwo = enemy.hp <= enemy.maxHp * 0.5;
              enemy.targetX = game.player.x; enemy.targetY = game.player.y; enemy.windup = (phaseTwo ? 0.82 : 1.05) * (inFury ? 0.75 : 1); enemy.attack = (phaseTwo ? 3.8 : 5.1) * (inFury ? 0.75 : 1);
            }
            if (enemy.hp <= enemy.maxHp * 0.5 && !enemy.summonedAtHalf) {
              enemy.summonedAtHalf = true;
              for (let i = 0; i < 3; i++) {
                const angle = (Math.PI * 2 * i) / 3;
                game.enemies.push({ x: enemy.x + Math.cos(angle) * 58, y: enemy.y + Math.sin(angle) * 58, hp: 34, maxHp: 34, speed: 62, radius: 10, damage: 8, color: "#9b91b4", xp: 2, type: "wraith", attack: 0, flash: 0, windup: 0, targetX: 0, targetY: 0, dashTime: 0, summonedAtHalf: false, furyTriggered: false });
              }
            }
            const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
            const steerX = (game.player.x - enemy.x) / d + separation.x * 0.28;
            const steerY = (game.player.y - enemy.y) / d + separation.y * 0.28;
            const steerLength = Math.max(1, Math.hypot(steerX, steerY));
            const phaseTwoSpeed = inFury ? 1.35 : enemy.hp <= enemy.maxHp * 0.5 ? 1.16 : 1;
            enemy.x += (steerX / steerLength) * enemy.speed * movementFactor * phaseTwoSpeed * dt;
            enemy.y += (steerY / steerLength) * enemy.speed * movementFactor * phaseTwoSpeed * dt;
          } else if (enemy.type === "charger") {
            if (enemy.dashTime > 0) {
              enemy.dashTime = Math.max(0, enemy.dashTime - dt);
              enemy.x += enemy.targetX * 390 * movementFactor * dt; enemy.y += enemy.targetY * 390 * movementFactor * dt;
              const dashDistance = distance(game.player.x, game.player.y, enemy.x, enemy.y);
              if (dashDistance < enemy.radius + 20 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - getPlayerDamageTaken(game, enemy.damage)); game.player.invuln = .65; game.player.hitFlash = 0.3;  enemy.dashTime = 0; }
            } else if (enemy.windup > 0) {
              enemy.windup = Math.max(0, enemy.windup - dt);
              if (enemy.windup === 0) { enemy.dashTime = .34; enemy.attack = 2.25; }
            } else if (enemy.attack <= 0 && d < 245) {
              const predictedX = game.player.x + dx * game.player.speed * 0.18;
              const predictedY = game.player.y + dy * game.player.speed * 0.18;
              const aimDistance = Math.max(1, distance(enemy.x, enemy.y, predictedX, predictedY));
              enemy.targetX = (predictedX - enemy.x) / aimDistance; enemy.targetY = (predictedY - enemy.y) / aimDistance;
              enemy.windup = .52;
            } else {
              const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
              const steerX = (game.player.x - enemy.x) / d + separation.x * 0.22;
              const steerY = (game.player.y - enemy.y) / d + separation.y * 0.22;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * movementFactor * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * movementFactor * dt;
              if (d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - getPlayerDamageTaken(game, enemy.damage)); game.player.invuln = .65; game.player.hitFlash = 0.3;  enemy.attack = 1.1; }
            }
          } else if (enemy.type === "brute") {
            if (enemy.windup > 0) {
              enemy.windup = Math.max(0, enemy.windup - dt);
              if (enemy.windup === 0) {
                if (distance(game.player.x, game.player.y, enemy.x, enemy.y) < 78 + 12 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - getPlayerDamageTaken(game, enemy.damage * 1.35)); game.player.invuln = .8; game.player.hitFlash = 0.3;  }
                for (let i=0;i<5;i++) { const a=i*Math.PI*2/5; game.particles.push({x:enemy.x,y:enemy.y,vx:Math.cos(a)*105,vy:Math.sin(a)*105,life:.35,color:"#e7a56d"}); }
                enemy.attack = 2.7;
              }
            } else {
              if (d < 112 && enemy.attack <= 0) enemy.windup = .72;
              else {
                const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
                const approach = d < 88 ? 0.32 : 1;
                const steerX = (game.player.x - enemy.x) / d * approach + separation.x * 0.26;
                const steerY = (game.player.y - enemy.y) / d * approach + separation.y * 0.26;
                const steerLength = Math.max(1, Math.hypot(steerX, steerY));
                enemy.x += (steerX / steerLength) * enemy.speed * movementFactor * dt;
                enemy.y += (steerY / steerLength) * enemy.speed * movementFactor * dt;
              }
              if (d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - getPlayerDamageTaken(game, enemy.damage)); game.player.invuln = .72; game.player.hitFlash = 0.3;  enemy.attack = 1.2; }
            }
          } else {
            const separation = movementGrid ? getEnemySeparation(enemy, movementGrid) : NO_ENEMY_SEPARATION;
            const ux = (game.player.x - enemy.x) / d, uy = (game.player.y - enemy.y) / d;
            if (enemy.type === "wraith") {
              const side = Math.sin(enemy.x * 0.026 + enemy.y * 0.019) >= 0 ? 1 : -1;
              const tangentX = -uy * side, tangentY = ux * side;
              const approach = d < 62 ? 0.34 : d > 150 ? 1 : 0.72;
              const steerX = ux * approach + tangentX * 0.34 + separation.x * 0.48;
              const steerY = uy * approach + tangentY * 0.34 + separation.y * 0.48;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * movementFactor * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * movementFactor * dt;
            } else {
              const targetRadius = 92;
              const approach = clamp((d - targetRadius) / 65, -0.42, 0.72);
              const side = Math.sin(enemy.x * 0.017 - enemy.y * 0.023) >= 0 ? 1 : -1;
              const steerX = ux * approach - uy * side * 0.48 + separation.x * 0.38;
              const steerY = uy * approach + ux * side * 0.48 + separation.y * 0.38;
              const steerLength = Math.max(1, Math.hypot(steerX, steerY));
              enemy.x += (steerX / steerLength) * enemy.speed * movementFactor * dt;
              enemy.y += (steerY / steerLength) * enemy.speed * movementFactor * dt;
            }
            if (enemy.type === "elite" && enemy.attack <= 0) {
              if (d < 105 && game.player.invuln <= 0) { game.player.hp = Math.max(0, game.player.hp - getPlayerDamageTaken(game, 7)); game.player.invuln = 0.35; game.player.hitFlash = 0.3;  }
              enemy.attack = 1.7;
            }
            if (enemy.type === "wraith" && d < enemy.radius + 15 && enemy.attack <= 0 && game.player.invuln <= 0) {
              game.player.hp = Math.max(0, game.player.hp - getPlayerDamageTaken(game, enemy.damage)); game.player.invuln = 0.72; game.player.hitFlash = 0.3;  enemy.attack = 0.8;
            }
          }
        }
        const destroyedTotems = game.sentinelTotems.filter((totem) => totem.hp <= 0);
        if (destroyedTotems.length > 0) {
          for (const totem of destroyedTotems) {
            const overloadLevel = game.upgradeCounts.gift_sentinel_overload?.count ?? 0;
            const burstRadius = 140 * (1 + overloadLevel * 0.12);
            const weaponPower = (1 + (game.weaponLevel - 1) * 0.055) * (game.evolved ? 1.15 : 1);
            const burstDamage = game.player.damage * weaponPower * 2.5 * (1 + overloadLevel * 0.15);
            game.shots.push({
              x: totem.x, y: totem.y, vx: 0, vy: 0,
              damage: burstDamage, life: 0.18, maxLife: 0.18,
              hitTargets: [], bouncesRemaining: 0, piercesRemaining: 0,
              kind: "sentinel_explosion", radius: burstRadius,
            });
            (game.rings ??= []).push({ x: totem.x, y: totem.y, r: 12, max: burstRadius, life: 0.68, color: game.evolved ? "#dc2626" : "#38bdf8" });
            for (let particle = 0; particle < 14; particle++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 70 + Math.random() * 220;
              game.particles.push({
                x: totem.x, y: totem.y,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 0.4 + Math.random() * 0.55,
                color: game.evolved ? (particle % 2 ? "#7f1d1d" : "#ef4444") : (particle % 2 ? "#fbbf24" : "#22d3ee"),
              });
            }
          }
          game.sentinelTotems = game.sentinelTotems.filter((totem) => totem.hp > 0);
          game.sentinelRespawnTimer = 5;
        }
        for (let eIdx = 0; eIdx < game.enemies.length; eIdx++) {
          const enemy = game.enemies[eIdx];
          let nearObstacle = false;
          for (let oIdx = 0; oIdx < game.obstacles.length; oIdx++) {
            const obs = game.obstacles[oIdx];
            const maxDist = enemy.radius + obs.radius;
            if (Math.abs(enemy.x - obs.x) < maxDist && Math.abs(enemy.y - obs.y) < maxDist) {
              nearObstacle = true;
              break;
            }
          }
          if (nearObstacle) {
            const resolved = resolveCemeteryCollision(enemy.x, enemy.y, enemy.radius, game.obstacles);
            enemy.x = resolved.x;
            enemy.y = resolved.y;
          }
        }
        // Vínculos Rituais de Almas: seleciona apenas os alvos mais próximos (5/8).
        // A lista de vínculos é reutilizada e a seleção não cria arrays temporários.
        const gravityAura = game.gravityAuraShot;
        if (game.weaponId === "gravity_shackle" && game.gravityAuraActive && gravityAura?.active) {
          const tethers = game.gravityTethers ?? (game.gravityTethers = []);
          const maxTethers = game.evolved ? 8 : 5;
          // Alcance mecânico independente do selo: dobra o raio, sem ampliar o visual.
          const maxRange = (gravityAura.radius ?? (game.evolved ? 140 : 106)) * 2;
          const maxRangeSquared = maxRange * maxRange;
          let tetherCount = tethers.length;
          game.gravityAuraTimer2 = (game.gravityAuraTimer2 ?? 0) - dt;
          if (game.gravityAuraTimer2 <= 0) {
            game.gravityAuraTimer2 = 0.12;
            const best = gravityBestEnemies, bestD = gravityBestDist;
            let count = 0;
            const px = game.player.x, py = game.player.y;
            for (let enemyIndex = 0; enemyIndex < game.enemies.length; enemyIndex++) {
              const enemy = game.enemies[enemyIndex];
              if (enemy.hp <= 0) continue;
              const dx = enemy.x - px; if (dx > maxRange || dx < -maxRange) continue;
              const dy = enemy.y - py; if (dy > maxRange || dy < -maxRange) continue;
              const dsq = dx * dx + dy * dy;
              if (dsq > maxRangeSquared) continue;
              if (count === maxTethers && dsq >= bestD[count - 1]) continue;
              let j = count < maxTethers ? count++ : count - 1;
              while (j > 0 && bestD[j - 1] > dsq) { best[j] = best[j - 1]; bestD[j] = bestD[j - 1]; j--; }
              best[j] = enemy; bestD[j] = dsq;
            }
            for (let rank = 0; rank < count; rank++) {
              const tether = tethers[rank] ?? { id: rank, enemy: best[rank]!, duration: 1 };
              tether.id = rank; tether.enemy = best[rank]!; tether.duration = 1;
              tethers[rank] = tether;
            }
            tethers.length = count;
            tetherCount = count;
          } else {
            let w = 0;
            for (let i = 0; i < tethers.length; i++) if (tethers[i].enemy.hp > 0) tethers[w++] = tethers[i];
            tethers.length = w; tetherCount = w;
          }

          const pressureLevel = game.upgradeCounts.gift_gravity_pressure?.count ?? 0;
          const slowFactor = clamp(0.65 - pressureLevel * 0.05, 0.45, 0.65);
          for (let i = 0; i < tetherCount; i++) {
            const enemy = tethers[i].enemy;
            enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 0.35);
            enemy.slowFactor = Math.min(enemy.slowFactor ?? 0.70, slowFactor);
          }

          gravityAura.pulseTimer = (gravityAura.pulseTimer ?? 0) - dt;
          if (gravityAura.pulseTimer <= 0) {
            // Um único impacto concentra quatro pulsos de dano; sem ondas intermediárias.
            gravityAura.pulseTimer = game.evolved ? 1.4 : 1.8;
            const hitDamage = gravityAura.damage * 4;
            for (let i = 0; i < tetherCount; i++) {
              const enemy = tethers[i].enemy;
              if (enemy.hp <= 0) continue;
              const appliedDamage = Math.min(enemy.hp, hitDamage);
              enemy.hp -= appliedDamage;
              game.totalDamageDealt += appliedDamage;
              enemy.flash = Math.max(enemy.flash, 0.08);
              if (enemy.hp <= 0) handleEnemyDefeat(game, enemy);
            }
          }
        } else if (game.gravityTethers) {
          game.gravityTethers.length = 0;
        }

        // A grade só é criada quando algum ataque realmente precisa testar colisões.
        // Os impactos do Grilhão são espaçados; não é necessário reconstruí-la a cada frame.
        let collisionGrid: EnemySpatialGrid | null = null;
        for (const shot of game.shots) {
          // A aura é processada exclusivamente pelo sistema de Vínculos Rituais acima.
          if (shot.kind === "gravity_well" && shot.isAura) continue;
          const isPulsingField = shot.kind === "plasma_puddle";
          if (isPulsingField) {
            if ((shot.pulseTimer ?? 0) > 0) continue;
            shot.pulseTimer = 0.4;
            shot.hitTargets.length = 0;
          }
          const wideAttack = shot.kind === "scythe_slash" || shot.kind === "sentinel_explosion" || isPulsingField;
          let nearbyTargets: Enemy[];
          // As demais armas continuam consultando a grade espacial sob demanda.
          if (!collisionGrid) collisionGrid = buildEnemySpatialGrid(game.enemies);
          nearbyTargets = wideAttack
            ? getEnemiesInRadius(shot.x, shot.y, (shot.radius ?? 180) + 42, collisionGrid)
            : getNearbyEnemies(shot.x, shot.y, collisionGrid);
          if (!wideAttack && shot.targetEnemy && !nearbyTargets.includes(shot.targetEnemy)) nearbyTargets.push(shot.targetEnemy);
          for (const enemy of nearbyTargets) {
            if (enemy.hp <= 0 || shot.hitTargets.includes(enemy)) continue;
            if (shot.targetEnemy && shot.targetEnemy !== enemy) continue;
            const hitX = shot.x - enemy.x;
            const hitY = shot.y - enemy.y;
            const hitDistanceSquared = hitX * hitX + hitY * hitY;
            let hit = false;
            if (shot.kind === "plasma_puddle" || shot.kind === "sentinel_explosion") {
              const radius = (shot.radius ?? 90) + enemy.radius;
              hit = hitDistanceSquared <= radius * radius;
            } else if (shot.kind === "scythe_slash") {
              const radius = (shot.radius ?? 180) + enemy.radius;
              const targetAngle = Math.atan2(enemy.y - shot.y, enemy.x - shot.x);
              const angleDifference = Math.atan2(Math.sin(targetAngle - (shot.angle ?? 0)), Math.cos(targetAngle - (shot.angle ?? 0)));
              hit = hitDistanceSquared <= radius * radius && Math.abs(angleDifference) <= (shot.arcSpan ?? Math.PI * 1.1) / 2;
            } else {
              const hitRadius = enemy.radius + (shot.kind === "orbital_blade" ? (shot.radius ?? 20) : shot.kind === "plasma_core" ? (shot.radius ?? 13) : 5);
              hit = hitDistanceSquared < hitRadius * hitRadius;
            }
            if (hit) {
              const markedBossBonus = game.weaponId === "void_revolver"
                && (shot.kind === "bullet" || shot.kind === "revolver_empowered")
                && (enemy.type === "elite" || enemy.type === "boss")
                ? 1 + (game.upgradeCounts.gift_revolver_mark?.count ?? 0) * 0.12
                : 1;
              const weakpointBonus = game.weaponId === "void_revolver"
                && (shot.kind === "bullet" || shot.kind === "revolver_empowered")
                && enemy.hp > enemy.maxHp * 0.70
                ? 1 + (game.upgradeCounts.gift_revolver_weakpoint?.count ?? 0) * 0.12
                : 1;
              const hitDamage = shot.damage * markedBossBonus * weakpointBonus;
              const appliedDamage = Math.min(enemy.hp, hitDamage);
              enemy.hp -= hitDamage;
              game.totalDamageDealt += appliedDamage;
              enemy.flash = 0.09;
              if (game.particles.length < 75) {
                game.particles.push({
                  x: shot.x,
                  y: shot.y,
                  vx: (Math.random() - 0.5) * 140,
                  vy: (Math.random() - 0.5) * 140,
                  life: 0.18,
                  color: shot.isAnchorBurst ? "#fbbf24" : shot.isChainLightning ? "#67e8f9" : "#f3dcff",
                });
              }
              game.damageNumbers.push({
                x: enemy.x + (Math.random() - 0.5) * 8,
                y: enemy.y - enemy.radius - 8,
                value: hitDamage,
                life: 0.72,
                maxLife: 0.72,
                drift: (Math.random() - 0.5) * 10,
              });
              if (game.damageNumbers.length > 12) game.damageNumbers.shift();
              shot.hitTargets.push(enemy);
              if (shot.kind === "plasma_puddle") {
                enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 0.5);
                const pullRadius = shot.radius ?? 118;
                const pullX = shot.x - enemy.x, pullY = shot.y - enemy.y;
                const pullDistanceSq = pullX * pullX + pullY * pullY;
                if (pullDistanceSq > 1 && pullDistanceSq <= pullRadius * pullRadius) {
                  const pullDistance = Math.sqrt(pullDistanceSq);
                  const implosionLevel = game.upgradeCounts.gift_core_implosion?.count ?? 0;
                  const pullStep = Math.min((game.evolved ? 16 : 10) + implosionLevel * 3, Math.max(0, pullDistance - enemy.radius - 6));
                  enemy.x += (pullX / pullDistance) * pullStep;
                  enemy.y += (pullY / pullDistance) * pullStep;
                }
              } else if (shot.kind === "scythe_slash" && game.weaponId === "spectral_scythe") {
                const crippleLevel = game.upgradeCounts.gift_scythe_cripple?.count ?? 0;
                if (crippleLevel > 0) {
                  enemy.slowTimer = Math.max(enemy.slowTimer ?? 0, 0.7);
                  enemy.slowFactor = Math.min(enemy.slowFactor ?? 1, clamp(0.85 - crippleLevel * 0.05, 0.70, 0.85));
                }
              }

              // Descarga em cadeia: cada impacto do projétil original pode chamar alvos extras.
              const supportsChainRelic = shot.kind === undefined || shot.kind === "bullet" || shot.kind === "revolver_empowered" || shot.kind === "plasma_core";
              if (!shot.isChainLightning && supportsChainRelic && game.player.relicChainLightning > 0) {
                const chainLevel = Math.min(3, game.player.relicChainLightning);
                const chainCount = chainLevel;
                const chainDamage = [0, 0.55, 0.65, 0.75][chainLevel];
                const chainRange = [0, 180, 215, 250][chainLevel];
                const chainSpeed = 720;
                const chainRangeSq = chainRange * chainRange;
                let foundCount = 0;
                for (const candidate of game.enemies) {
                  if (foundCount >= chainCount) break;
                  if (candidate === enemy || candidate.hp <= 0 || shot.hitTargets.includes(candidate)) continue;
                  const cdx = candidate.x - enemy.x;
                  const cdy = candidate.y - enemy.y;
                  const distSq = cdx * cdx + cdy * cdy;
                  if (distSq <= chainRangeSq) {
                    const chainDistance = Math.max(1, Math.sqrt(distSq));
                    game.shots.push({
                      x: enemy.x,
                      y: enemy.y,
                      vx: (cdx / chainDistance) * chainSpeed,
                      vy: (cdy / chainDistance) * chainSpeed,
                      damage: Math.max(1, Math.round(hitDamage * chainDamage)),
                      life: chainDistance / chainSpeed + 0.15,
                      hitTargets: [...shot.hitTargets],
                      bouncesRemaining: 0,
                      piercesRemaining: 0,
                      isChainLightning: true,
                      targetEnemy: candidate,
                    });
                    foundCount++;
                  }
                }
              }

              if (enemy.hp <= 0) handleEnemyDefeat(game, enemy, shot);
              if (shot.kind === "plasma_core") {
                const projectileSpeed = Math.max(1, Math.hypot(shot.vx, shot.vy));
                const dirX = shot.vx / projectileSpeed, dirY = shot.vy / projectileSpeed;

                // O Núcleo continua sendo detonado no último impacto, mas pode atravessar
                // alvos ou ricochetear antes disso quando essas relíquias estiverem equipadas.
                if (shot.piercesRemaining > 0) {
                  shot.piercesRemaining -= 1;
                  shot.targetEnemy = undefined;
                  shot.x = enemy.x + dirX * (enemy.radius + (shot.radius ?? 13) + 5);
                  shot.y = enemy.y + dirY * (enemy.radius + (shot.radius ?? 13) + 5);
                  shot.life = Math.max(shot.life, 0.18);
                  continue;
                }

                if (shot.bouncesRemaining > 0) {
                  let bestTarget: Enemy | null = null;
                  let bestDistanceSquared = 280 * 280;
                  for (const candidate of game.enemies) {
                    if (candidate.hp <= 0 || shot.hitTargets.includes(candidate)) continue;
                    const nextX = candidate.x - enemy.x;
                    const nextY = candidate.y - enemy.y;
                    const nextDistanceSquared = nextX * nextX + nextY * nextY;
                    if (nextDistanceSquared < bestDistanceSquared) {
                      bestDistanceSquared = nextDistanceSquared;
                      bestTarget = candidate;
                    }
                  }
                  if (bestTarget) {
                    const nextDistance = Math.max(1, Math.sqrt(bestDistanceSquared));
                    shot.x = enemy.x;
                    shot.y = enemy.y;
                    shot.vx = ((bestTarget.x - enemy.x) / nextDistance) * projectileSpeed;
                    shot.vy = ((bestTarget.y - enemy.y) / nextDistance) * projectileSpeed;
                    shot.targetEnemy = bestTarget;
                    shot.bouncesRemaining -= 1;
                    shot.life = Math.max(shot.life, nextDistance / projectileSpeed + 0.15);
                    continue;
                  }
                }

                if (!shot.hasDetonated) {
                  shot.hasDetonated = true;
                  spawnPlasmaPuddle(game, shot.x, shot.y, shot.damage);
                }
                shot.life = 0;
                break;
              }

              // Cortes, lâminas e campos atingem todos os alvos da forma durante cada pulso.
              if (shot.kind === "scythe_slash" || shot.kind === "orbital_blade" || shot.kind === "sentinel_explosion" || isPulsingField) continue;

              // Perfuração prioriza inimigos alinhados à frente; ricochete busca um novo alvo quando não há alvo alinhado.
              let continued = false;
              const projectileSpeed = Math.max(1, Math.hypot(shot.vx, shot.vy));
              const dirX = shot.vx / projectileSpeed, dirY = shot.vy / projectileSpeed;

              if (!shot.isChainLightning && shot.piercesRemaining > 0) {
                // A perfuração sempre mantém o vetor original; o projétil segue mesmo sem outro alvo alinhado.
                shot.targetEnemy = undefined;
                shot.x = enemy.x + dirX * (enemy.radius + 8);
                shot.y = enemy.y + dirY * (enemy.radius + 8);
                shot.piercesRemaining -= 1;
                shot.life = Math.max(shot.life, 0.6);
                continued = true;
              }

              if (!continued && !shot.isChainLightning && shot.bouncesRemaining > 0) {
                let bestTarget: Enemy | null = null;
                let bestDistSq = 280 * 280;
                for (const candidate of game.enemies) {
                  if (candidate === enemy || candidate.hp <= 0 || shot.hitTargets.includes(candidate)) continue;
                  const rdx = candidate.x - enemy.x;
                  const rdy = candidate.y - enemy.y;
                  const distSq = rdx * rdx + rdy * rdy;
                  if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    bestTarget = candidate;
                  }
                }
                if (bestTarget) {
                  const nextDistance = Math.max(1, Math.sqrt(bestDistSq));
                  shot.x = enemy.x;
                  shot.y = enemy.y;
                  shot.vx = ((bestTarget.x - enemy.x) / nextDistance) * projectileSpeed;
                  shot.vy = ((bestTarget.y - enemy.y) / nextDistance) * projectileSpeed;
                  shot.targetEnemy = bestTarget;
                  shot.bouncesRemaining -= 1;
                  shot.life = Math.max(shot.life, nextDistance / projectileSpeed + 0.15);
                  continued = true;
                }
              }

              if (!continued) shot.life = 0;
              break;
            }
          }
        }
        // Urnas/gatinhos só recebem dano pelo contato físico do personagem.
        for (const urn of game.urns) {
          if (urn.broken) continue;
          urn.contactCooldown = Math.max(0, (urn.contactCooldown ?? 0) - dt);
          if (distance(game.player.x, game.player.y, urn.x, urn.y) <= 14 + urn.radius && urn.contactCooldown <= 0) {
            urn.hp -= 1; urn.contactCooldown = 0.35;
            for (let p = 0; p < 4; p++) {
              const angle = Math.random() * Math.PI * 2, speed = 25 + Math.random() * 85;
              game.particles.push({ x: urn.x, y: urn.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.25 + Math.random() * 0.25, color: "#b7a4b9" });
            }
            if (urn.hp <= 0) {
              urn.broken = true;
              for (let p = 0; p < 18; p++) {
                const angle = Math.random() * Math.PI * 2, speed = 45 + Math.random() * 170;
                game.particles.push({ x: urn.x, y: urn.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.35 + Math.random() * 0.45, color: p % 2 ? "#c4b5c5" : "#8f7b99" });
              }
              const roll = Math.random(), fortuneBonus = [0, 0.10, 0.20, 0.30, 0.40, 0.50][Math.max(0, Math.min(5, purchases.fortune))];
              const specialMultiplier = (1 + fortuneBonus) * game.omenRewardMultiplier;
              const foodChance = Math.min(0.18, 0.09 * specialMultiplier), voidChance = Math.min(0.04, 0.01 * specialMultiplier);
              const highestFieldRelicLevel = Math.max(purchases.area, purchases.experience, purchases.projectile_range, purchases.projectiles, purchases.ricochet, purchases.piercing, purchases.chain_lightning);
              const baseRelicDropChance = [0, 0, 0.01, 0.03, 0.05][Math.max(0, Math.min(4, highestFieldRelicLevel))];
              const relicChance = Math.min(0.12, baseRelicDropChance * specialMultiplier);
              const eligibleRelics: SpecialDrop["kind"][] = [];
              if (purchases.area >= 1 && game.player.specialAreaStacks < MAX_AREA_RELIC_STACKS) eligibleRelics.push("area");
              if (purchases.experience >= 1 && game.player.specialExperienceStacks < MAX_EXPERIENCE_RELIC_STACKS) eligibleRelics.push("experience");
              if (purchases.projectile_range >= 1 && game.player.projectileRangeStacks < MAX_PROJECTILE_RANGE_STACKS) eligibleRelics.push("projectile_range");
              if (purchases.projectiles >= 1 && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) eligibleRelics.push("projectiles");
              const projectileRelicsSupported = supportsProjectileRelics(game.weaponId);
              if (projectileRelicsSupported && purchases.ricochet >= 1 && game.player.relicRicochet < 3) eligibleRelics.push("ricochet");
              if (projectileRelicsSupported && purchases.piercing >= 1 && game.player.relicPiercing < 3) eligibleRelics.push("piercing");
              if (projectileRelicsSupported && purchases.chain_lightning >= 1 && game.player.relicChainLightning < 3) eligibleRelics.push("chain_lightning");
              if (roll < 0.20) game.gems.push({ x: urn.x, y: urn.y, value: 15, radius: 8, runeCrystal: true });
              else if (eligibleRelics.length && roll < 0.20 + relicChance) game.specialDrops.push({ x: urn.x, y: urn.y, kind: eligibleRelics[Math.floor(Math.random() * eligibleRelics.length)], radius: 13 });
              else if (roll < 0.20 + relicChance + foodChance) game.specialDrops.push({ x: urn.x, y: urn.y, kind: "food", radius: 14 });
              else if (roll < 0.20 + relicChance + foodChance + voidChance) game.specialDrops.push({ x: urn.x, y: urn.y, kind: "void", radius: 14 });
            }
          }
        }
        game.enemies = game.enemies.filter((enemy) => enemy.hp > 0 && (enemy.type === "boss" || enemy.isExecutioner || distance(enemy.x, enemy.y, game.player.x, game.player.y) < Math.max(game.width, game.height) / zoomRef.current * 1.45));
        game.gems.forEach((gem) => {
          const previousX = gem.x, previousY = gem.y;
          const d = distance(game.player.x, game.player.y, gem.x, gem.y);
          if (d <= game.player.pickupRadius) {
            const pull = 260 * dt;
            gem.x += ((game.player.x - gem.x) / Math.max(1, d)) * pull;
            gem.y += ((game.player.y - gem.y) / Math.max(1, d)) * pull;
            game.particles.push({ x: gem.x, y: gem.y, vx: (game.player.x - gem.x) * 0.16 + (Math.random() - 0.5) * 22, vy: (game.player.y - gem.y) * 0.16 + (Math.random() - 0.5) * 22, life: 0.22, color: Math.random() > 0.5 ? "#a78bfa" : "#38bdf8" });
            // O rastro é desenhado no Canvas usando a posição anterior e a atual.
            gem.previousX = previousX;
            gem.previousY = previousY;
          }
          if (d < 17) {
            fractalAudio.gem();
            game.player.xp += gem.value * game.player.xpMultiplier;
            game.crystalsCollected += gem.runeCrystal ? 5 : 1;
            gem.value = 0;
          }
        });
        game.gems = game.gems.filter((gem) => gem.value > 0 && distance(gem.x, gem.y, game.player.x, game.player.y) < Math.max(game.width, game.height) * 1.6);
        game.specialDrops.forEach((drop) => {
          const d = distance(game.player.x, game.player.y, drop.x, drop.y);
          if (d < game.player.pickupRadius) { drop.x += ((game.player.x - drop.x) / Math.max(1, d)) * 280 * dt; drop.y += ((game.player.y - drop.y) / Math.max(1, d)) * 280 * dt; }
          if (d < 18) {
            if(drop.kind==="food"){game.player.hp=Math.min(game.player.maxHp,game.player.hp+game.player.maxHp*.4);game.pickupLabels.push({x:game.player.x,y:game.player.y-28,text:"+40% HP! Iguaria Cósmica 🍔",life:1.8,maxLife:1.8});drop.radius=0;fractalAudio.special();return;}
            if(drop.kind==="void"){for(const gem of game.gems){gem.x=game.player.x;gem.y=game.player.y;}game.pickupLabels.push({x:game.player.x,y:game.player.y-28,text:"Vórtice do Vazio! Cristais Sugados!",life:1.8,maxLife:1.8});drop.radius=0;fractalAudio.special();return;}
            fractalAudio.special();
            const specialUpgradeId: UpgradeId = drop.kind === "area" ? "special_area" : drop.kind === "experience" ? "special_experience" : drop.kind === "projectile_range" ? "special_projectile_range" : drop.kind === "projectiles" ? "special_projectiles" : drop.kind === "ricochet" ? "special_ricochet" : drop.kind === "piercing" ? "special_piercing" : "special_chain_lightning";
            const specialUpgrade = SPECIAL_UPGRADES.find((item) => item.id === specialUpgradeId)!;
            const currentRune = game.upgradeCounts[specialUpgradeId];
            game.upgradeCounts[specialUpgradeId] = { name: specialUpgrade.name, count: (currentRune?.count ?? 0) + 1, rarity: "uncommon" };
            const pickupNames: Record<SpecialDrop["kind"], string> = {
              area: "Ímã de Fragmentos",
              experience: "Eco do Conhecimento",
              projectile_range: "Ressonância de Alcance",
              projectiles: "Coroa de Estilhaços",
              ricochet: "Ricochete Instável",
              piercing: "Perfuração Espectral",
              chain_lightning: "Descarga em Cadeia",
              food: "Iguaria de uma Dimensão Perdida",
              void: "Vórtice do Vazio",
            };
            game.pickupLabels.push({ x: drop.x, y: drop.y - 22, text: pickupNames[drop.kind], life: 1.25, maxLife: 1.25 });
            if (drop.kind === "area" && game.player.specialAreaStacks < MAX_AREA_RELIC_STACKS) { game.player.specialAreaStacks += 1; game.player.pickupRadius = 85 * (1 + game.player.specialAreaStacks * 0.10); }
            if (drop.kind === "experience" && game.player.specialExperienceStacks < MAX_EXPERIENCE_RELIC_STACKS) { game.player.specialExperienceStacks += 1; game.player.xpMultiplier = 1 + game.player.specialExperienceStacks * 0.05; }
            if (drop.kind === "projectile_range" && game.player.projectileRangeStacks < MAX_PROJECTILE_RANGE_STACKS) { game.player.projectileRangeStacks += 1; game.player.projectileRangeMultiplier = 1 + game.player.projectileRangeStacks * 0.10; }
            if (drop.kind === "projectiles" && game.player.projectileStacks < MAX_EXTRA_PROJECTILES) { game.player.projectileStacks += 1; }
            if (drop.kind === "ricochet" && game.player.relicRicochet < 3) game.player.relicRicochet += 1;
            if (drop.kind === "piercing" && game.player.relicPiercing < 3) game.player.relicPiercing += 1;
            if (drop.kind === "chain_lightning" && game.player.relicChainLightning < 3) game.player.relicChainLightning += 1;
            drop.radius = 0;
          }
        });
        game.specialDrops = game.specialDrops.filter((drop) => drop.radius > 0 && distance(drop.x, drop.y, game.player.x, game.player.y) < Math.max(game.width, game.height) * 1.6);
        game.urns = game.urns.filter((urn) => !urn.broken);
        if(Math.floor(game.elapsed/60)>=game.nextUrnMinute){spawnCemeteryUrns(game,8+Math.floor(Math.random()*5));game.nextUrnMinute=Math.floor(game.elapsed/60)+1;}
        game.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
        compactAlive(game.particles);
        if (game.particles.length > 140) game.particles.splice(0, game.particles.length - 140);
        game.shake = Math.max(0, (game.shake ?? 0) - dt * 30);
        if (game.rings) {
          game.rings.forEach((ring) => {
            ring.life -= dt;
            ring.r += (ring.max - ring.r) * Math.min(1, dt * 9);
          });
          compactAlive(game.rings);
          if (game.rings.length > 20) game.rings.splice(0, game.rings.length - 20);
        }
        if (game.gems.length > 70) {
          const nearby: Gem[] = [];
          const clusters = new Map<string, Gem>();
          for (const gem of game.gems) {
            if (gem.runeCrystal || distance(gem.x, gem.y, game.player.x, game.player.y) < 240) { nearby.push(gem); continue; }
            const cellX = Math.floor(gem.x / 180), cellY = Math.floor(gem.y / 180), key = cellX + ":" + cellY;
            const cluster = clusters.get(key);
            if (cluster) cluster.value += gem.value;
            else clusters.set(key, { x: cellX * 180 + 90, y: cellY * 180 + 90, value: gem.value, radius: 7 });
          }
          game.gems = [...nearby, ...clusters.values()];
        }
        if (game.player.xp >= game.player.nextXp && !game.ended && eventRewardRemainingRef.current === 0) {
          game.player.xp -= game.player.nextXp; game.player.level += 1; game.highestLevel = Math.max(game.highestLevel, game.player.level); fractalAudio.levelUp(); game.player.nextXp = Math.floor(game.player.nextXp * 1.32 + 5);
          
          setSelectedUpgrade(null);
              setFlippedCardId(null);
              setLevelChoices(buildLevelChoices(game, purchases));
        }
        if (game.omenId === "revenge") {
          game.omenRevengeCooldown = Math.max(0, game.omenRevengeCooldown - dt);
          if (game.player.hp < game.lastObservedHp && game.omenRevengeCooldown <= 0) {
            const radius = 145;
            const targets = game.enemies.filter((enemy) => enemy.hp > 0 && distance(game.player.x, game.player.y, enemy.x, enemy.y) <= radius).slice(0, 10);
            for (const enemy of targets) {
              const hitDistance = Math.max(1, distance(game.player.x, game.player.y, enemy.x, enemy.y));
              game.shots.push({ x: game.player.x, y: game.player.y, vx: (enemy.x - game.player.x) / hitDistance * 850, vy: (enemy.y - game.player.y) / hitDistance * 850, damage: game.player.damage * 0.55, life: hitDistance / 850 + 0.25, hitTargets: [], bouncesRemaining: 0, piercesRemaining: 0, isChainLightning: true, targetEnemy: enemy });
            }
            game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 18, max: radius, life: 0.35, color: "#fb7185" }];
            game.omenRevengeCooldown = 4;
          }
          game.lastObservedHp = game.player.hp;
        }
        if (game.player.hp <= 0 && game.anchorReviveAvailable && game.anchorRevivesUsed < 2) {
          const consumedAnchorNumber = game.anchorRevivesUsed + 1;
          game.anchorReviveAvailable = false;
          game.anchorRevivesUsed = consumedAnchorNumber;
          const improvedAnchor = purchases.anchor_soul >= 2;
          game.player.hp = Math.max(1, game.player.maxHp * (improvedAnchor ? 0.60 : 0.40));
          game.player.invuln = improvedAnchor ? 6 : 3;
          game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 10, max: 220, life: 1.1, color: "#fbbf24" }];
          for (let i = 0; i < 32; i++) {
            const angle = Math.random() * Math.PI * 2, speed = 45 + Math.random() * 180;
            game.particles.push({ x: game.player.x, y: game.player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45 + Math.random() * 0.55, color: i % 2 ? "#fbbf24" : "#f5d0fe" });
          }

          if (consumedAnchorNumber === 2 && purchases.anchor_soul >= 3) {
            const burstRadius = 260;
            const burstDamage = getEquippedWeaponStrikeDamage(game);
            const burstTargets = game.enemies.filter((enemy) => enemy.hp > 0 && distance(game.player.x, game.player.y, enemy.x, enemy.y) <= burstRadius);
            game.rings = [...(game.rings ?? []), { x: game.player.x, y: game.player.y, r: 18, max: burstRadius, life: 0.85, color: "#fbbf24" }];
            for (let i = 0; i < 42; i++) {
              const angle = Math.random() * Math.PI * 2, speed = 70 + Math.random() * 230;
              game.particles.push({ x: game.player.x, y: game.player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.35 + Math.random() * 0.55, color: i % 2 ? "#fbbf24" : "#fff1b3" });
            }
            for (const enemy of burstTargets) {
              game.shots.push({
                x: enemy.x, y: enemy.y, vx: 0, vy: 0, damage: burstDamage, life: 0.2,
                hitTargets: [], bouncesRemaining: 0, piercesRemaining: 0,
                isChainLightning: true, isSplash: true, isAnchorBurst: true, targetEnemy: enemy,
              });
            }
            game.pickupLabels.push({ x: game.player.x, y: game.player.y - 55, text: "ÂNCORA · EXPLOSÃO", life: 1.8, maxLife: 1.8 });
            toast.success("A segunda Âncora detonou e atingiu " + burstTargets.length + " inimigo(s)!");
          } else {
            game.pickupLabels.push({ x: game.player.x, y: game.player.y - 35, text: "ÂNCORA DA ALMA · RESSURREIÇÃO", life: 2.2, maxLife: 2.2 });
            toast.success("A Âncora da Alma impediu sua queda!");
          }
        }
        if (game.player.hp <= 0 && !game.ended) { game.ended = true; setStats({ totalDamageDealt: Math.round(game.totalDamageDealt), crystalsCollected: game.crystalsCollected, highestLevel: game.highestLevel }); setResult("defeat"); fractalAudio.defeat(); finishRun(false); }
        if (game.elapsed >= RUN_DURATION_SECONDS && !game.ended && !game.bossSpawned) {
          spawnEnemy(game, missionId, game.elapsed, corruption, true);
          game.bossSpawned = true;
          if (!bossNotified) { bossNotified = true; setBossMessage(true); fractalAudio.bossAlert(); window.setTimeout(() => setBossMessage(false), 5200); }
        }
        if (now - lastHud > 250 && game.player.hp > 0 && !game.ended) {
          lastHud = now;
          const halfViewWidth = game.width / (2 * zoomRef.current);
          const halfViewHeight = game.height / (2 * zoomRef.current);
          const visibleEnemies = game.enemies.reduce((count, enemy) =>
            count + Number(enemy.x >= game.player.x - halfViewWidth && enemy.x <= game.player.x + halfViewWidth && enemy.y >= game.player.y - halfViewHeight && enemy.y <= game.player.y + halfViewHeight), 0);
          setHud({ hp: game.player.hp, maxHp: game.player.maxHp, xp: game.player.xp, nextXp: game.player.nextXp, level: game.player.level, kills: game.kills, elapsed: game.elapsed, moveSpeed: Math.round(game.player.speed), fps: measuredFps, visibleEnemies, phase: snapshot.phaseLabel, pressure: snapshot.totalPressure + (game.challengeEvent ? 2 : 0), event: game.challengeEvent ? { id: game.challengeEvent.id, remaining: game.challengeEvent.remaining, progress: game.challengeEvent.progress, inside: distance(game.player.x, game.player.y, game.challengeEvent.x, game.challengeEvent.y) <= game.challengeEvent.radius } : null, runes: Object.entries(game.upgradeCounts).map(([id, rune]) => ({ id, name: rune.name, count: rune.count, rarity: rune.rarity })) });
        }
      }
      if (!paused && levelChoices.length === 0 && !game.ended) {
        fpsFrames += 1;
        if (!fpsWindowStart) fpsWindowStart = now;
        if (now - fpsWindowStart >= 500) {
          measuredFps = Math.round(fpsFrames * 1000 / (now - fpsWindowStart));
          fpsFrames = 0;
          fpsWindowStart = now;
        }
        drawGame(ctx, game, corruption, missionId, spritesRef.current, showPlayerHp, showDamageNumbers, zoomRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [running, desktopSupported, paused, levelChoices.length, missionId, corruption, speedMultiplier, finishRun, purchases, showPlayerHp, showDamageNumbers]);

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  const mission = FRACTAL_MISSIONS.find((item) => item.id === missionId)!;
  const exchangeValue = Number(exchangeAmount);
  const isWeaponUnlocked = (weapon: WeaponId) => {
    const key = WEAPON_CONFIG[weapon].purchaseKey;
    return key === null || Boolean(purchases[key]);
  };
  const exchangeValid = Number.isInteger(exchangeValue) && exchangeValue >= 10 && exchangeValue % 10 === 0 && exchangeValue <= fractalBalance;
  const toggleFullscreen = async () => {
    const target = canvasRef.current?.closest("[data-fractal-arena]") as HTMLElement | null;
    try { if (!document.fullscreenElement) await target?.requestFullscreen(); else await document.exitFullscreen(); } catch { /* Fullscreen may be unavailable in embedded browsers. */ }
  };

  if (!desktopSupported) {
    return (
      <section className="fractals-desktop-required" role="status" aria-live="polite">
        <div className="fractals-desktop-required__panel">
          <div className="fractals-desktop-required__emblem"><Monitor aria-hidden="true" /></div>
          <p className="fractals-desktop-required__eyebrow">Experiência exclusiva para computador</p>
          <h2>Ecos dos Fractais</h2>
          <p>Celulares e tablets não são suportados. Para jogar, abra Ecos dos Fractais em um computador com tela ampla, teclado e mouse.</p>
          <div className="fractals-desktop-required__controls">
            <span><Keyboard aria-hidden="true" /> WASD / Setas <small>Movimentar</small></span>
            <span><b>ESPAÇO</b> <small>Dash</small></span>
          </div>
          <p className="fractals-desktop-required__footnote">O jogo só pode ser iniciado em PC/Desktop. No computador: WASD ou setas para mover e Espaço para dash.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="fractals-hub" data-fractal-arena>
      {missionPickerOpen && !running && !result && (
        <div className="fractals-mission-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMissionPickerOpen(false); }}>
          <section className="fractals-mission-picker" role="dialog" aria-modal="true" aria-labelledby="fractals-mission-picker-title">
            <header className="fractals-mission-picker__header">
              <div><p>MAPAS DA FENDA · 01 / 05 DISPONÍVEL</p><h3 id="fractals-mission-picker-title">Escolha sua expedição</h3><span>Cada região guarda uma história e uma ameaça próprias.</span></div>
              <button type="button" aria-label="Fechar seleção de missão" onClick={() => setMissionPickerOpen(false)}>×</button>
            </header>
            <div className="fractals-mission-picker__grid">
              {FRACTAL_MISSIONS.map((item) => {
                const available = item.id === 1;
                const MissionIcon = item.id === 1 ? MapPin : item.id === 2 ? Flame : item.id === 3 ? Leaf : item.id === 4 ? Snowflake : Orbit;
                return (
                  <button key={item.id} type="button" disabled={!available} onClick={() => { setMissionId(item.id); setMissionPickerOpen(false); }} className={`fractals-mission-card ${available ? "is-available" : "is-locked"} ${missionId === item.id ? "is-current" : ""}`}>
                    <div className="fractals-mission-card__top">
                      <span className="fractals-mission-card__icon"><MissionIcon/></span>
                      {available ? <span className="fractals-mission-card__status">DISPONÍVEL</span> : <span className="fractals-mission-card__chains"><Link2/><Lock/><Link2/></span>}
                    </div>
                    <strong>{item.name}</strong>
                    <small>{item.pathName}</small>
                    <p>{item.lore}</p>
                    <span className="fractals-mission-card__footer">{available ? "ENTRAR NESTA REGIÃO →" : "EM BREVE · REGIÃO SELADA"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {!running && !result && (
        <Card className="fractals-gold-frame fractals-gold-corners relative overflow-hidden rounded-2xl p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-5">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.08] blur-3xl" />
          <div className="relative space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-200">
                  <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_#f59e0b]" />
                  Sobrevivência roguelike
                </div>
                <h2 className="font-display text-2xl font-black tracking-wide text-white sm:text-3xl">ECOS <span className="text-amber-300">DOS</span> FRACTAIS</h2>
                <p className="mt-1 text-xs text-white/65 sm:text-sm">Atravesse a fenda, reúna fragmentos e sobreviva ao despertar do guardião.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2">
                  <GemIcon className="h-5 w-5 text-amber-300" />
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-100/75">Seu saldo</p>
                    <p className="font-mono text-lg font-black leading-tight text-amber-200">{fractalBalance.toLocaleString("pt-BR")} <span className="text-xs">FR</span></p>
                  </div>
                </div>
                <button type="button" onClick={toggleAudio} className="rounded border border-purple-500/30 bg-purple-950/40 p-1.5 text-purple-300 transition-colors hover:text-amber-300" title={isMuted ? "Ativar som" : "Desativar som"} aria-label={isMuted ? "Ativar efeitos sonoros" : "Desativar efeitos sonoros"}>
                  {isMuted ? <VolumeX className="h-4 w-4 text-zinc-500" /> : <Volume2 className="h-4 w-4 text-amber-400" />}
                </button>
              </div>
            </header>

            <section className="fractals-gold-frame fractals-gold-corners rounded-xl p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-display text-sm font-black uppercase tracking-wider text-amber-100">Arma da expedição</h3><p className="text-[10px] text-white/55">Escolha uma única arma para esta partida.</p></div>
                <span className="rounded-full border border-violet-300/25 bg-violet-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-violet-100">{WEAPON_CONFIG[selectedWeapon].name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(WEAPON_CONFIG) as WeaponId[]).map((weapon) => {
                  const config = WEAPON_CONFIG[weapon];
                  const unlocked = isWeaponUnlocked(weapon);
                  const active = selectedWeapon === weapon;
                  return <button key={weapon} type="button" disabled={!unlocked} onClick={() => setSelectedWeapon(weapon)}
                    className={`rounded-xl border p-2.5 text-left transition ${active ? "border-amber-300/70 bg-amber-300/10 shadow-[0_0_18px_rgba(245,158,11,.12)]" : unlocked ? "border-white/10 bg-black/25 hover:border-violet-200/40" : "border-white/5 bg-black/20 opacity-45"}`}>
                    <span className="flex items-center justify-between gap-1"><b className="text-[11px] text-white">{config.name}</b>{active ? <Check className="h-4 w-4 text-amber-300"/> : unlocked ? <span className="text-[8px] text-emerald-200">LIBERADA</span> : <Lock className="h-3.5 w-3.5 text-white/50"/>}</span>
                    <span className="mt-1 block text-[9px] leading-snug text-white/55">{config.description}</span>
                    {!unlocked && <span className="mt-1 block text-[8px] font-bold text-amber-200/70">DESBLOQUEIE NA ABA ARMAS</span>}
                  </button>;
                })}
              </div>
            </section>
            <section className="fractals-gold-frame fractals-gold-corners rounded-xl p-3 text-center sm:p-4">
              <p className="mb-2 text-xs text-white/75 sm:text-sm">Sobreviva por 12 minutos. O guardião desperta ao final da incursão.</p>
              <Button onClick={start} disabled={preparingArena} aria-busy={preparingArena} className="mx-auto h-12 w-full max-w-xl rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 font-display text-base font-black tracking-wider text-[#21170b] shadow-[0_0_28px_rgba(245,158,11,0.3)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80">
                <Play className="mr-2 h-5 w-5 fill-current" /> {preparingArena ? "PREPARANDO CENÁRIO..." : "ENTRAR NA FENDA"}
              </Button>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">

              <section className="fractals-gold-frame fractals-gold-corners flex min-w-0 flex-col rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded border border-rose-400/40 bg-rose-950/60 text-rose-300"><Skull className="h-3.5 w-3.5" /></span>
                    <span className="text-[11px] font-black uppercase tracking-wider text-rose-200">Risco da Fenda</span>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${corruption === 0 ? "border-emerald-400/40 bg-emerald-950/40 text-emerald-200" : corruption >= 4 ? "border-rose-400/50 bg-rose-950/60 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.3)]" : "border-amber-400/40 bg-amber-950/40 text-amber-200"}`}>
                    {corruption === 0 ? "Paz Relativa" : "Nível " + corruption + " · " + CORRUPTION_LEVELS[corruption].name}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/70">{CORRUPTION_LEVELS[corruption].description}</p>
                <div className="fractals-corruption-bar" role="radiogroup" aria-label="Níveis de corrupção da fenda">
                  {CORRUPTION_LEVELS.map((level) => {
                    const locked = level.level > unlockedCorruption;
                    const active = corruption === level.level;
                    const isDanger = level.level >= 4;
                    return (
                      <button key={level.level} type="button" role="radio" aria-checked={active} disabled={locked}
                        onClick={() => setCorruption(level.level)}
                        title={locked ? "Nível " + level.level + " bloqueado (vença a dificuldade anterior)" : "Selecionar " + level.level + ": " + level.name}
                        className={`fractals-corruption-node ${active ? "is-active" : ""} ${isDanger ? "is-danger" : ""} ${locked ? "is-locked" : ""}`}>
                        <span className="fractals-corruption-pip" />
                        <span className="text-[10px] font-black">{locked ? <Lock className="inline h-2.5 w-2.5" /> : level.level}</span>
                        <span className="text-[8px] font-semibold uppercase tracking-wider opacity-80">{level.level === 0 ? "Base" : "N" + level.level}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-950/25 p-2.5">
                    <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300"><Sparkles className="h-3 w-3" /> Recompensas</p>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-emerald-100/90">
                      {corruption === 0 ? <>Vitória: <b className="text-emerald-300">25 FR</b> base<br /><span className="text-[10px] text-emerald-200/70">Derrota: +2 FR por minuto</span></> : <>Vitória: <b className="text-emerald-300">{25 + corruption * 15} FR</b> (+{corruption * 15} extra)<br /><span className="text-[10px] text-emerald-200/70">Derrota: +{2 + corruption} FR por minuto</span></>}
                    </p>
                  </div>
                  <div className="rounded-lg border border-rose-400/20 bg-rose-950/25 p-2.5">
                    <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-rose-300"><AlertTriangle className="h-3 w-3" /> Ameaça do Vazio</p>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-rose-100/90">
                      {corruption === 0 ? <>Sem reforços do Vazio.<br /><span className="text-[10px] text-rose-200/70">Inimigos em densidade padrão.</span></> :
                       corruption === 1 ? <>Presença inquieta.<br /><span className="text-[10px] text-rose-200/70">Inimigos +10% mais densos.</span></> :
                       corruption === 2 ? <>Surgimento de Elites acelerado.<br /><span className="text-[10px] text-rose-200/70">Pressão constante na arena.</span></> :
                       corruption === 3 ? <>O Vazio avança com fúria.<br /><span className="text-[10px] text-rose-200/70">Invasões massivas e rápidas.</span></> :
                       corruption === 4 ? <>Ruptura abissal.<br /><span className="text-[10px] text-rose-200/70">Elites ferozes dominam a arena.</span></> :
                       <>Pesadelo Irreversível.<br /><span className="text-[10px] text-rose-200/70">Agressividade e hordas máximas.</span></>}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-white/40">
                  {unlockedCorruption < 5 ? "Nível " + (unlockedCorruption + 1) + " será desbloqueado ao derrotar o Guardião no Nível " + unlockedCorruption + "." : "✦ Todos os selos de corrupção foram rompidos."}
                </p>
              {unlockedCorruption >= 4 && purchases.omen_archive && (
                <section className="mt-3 rounded-xl border border-fuchsia-300/20 bg-fuchsia-950/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2"><div><h3 className="font-display text-sm font-black uppercase tracking-wider text-fuchsia-100">Arquivo dos Presságios</h3><p className="text-[10px] text-white/55">Liberado a partir da Corrupção 4. Você pode escolher agora e usar quando iniciar uma expedição nesse nível ou superior.</p></div><span className="text-[9px] font-bold text-fuchsia-200">{selectedOmen ? OMEN_CONFIG[selectedOmen].name : "SEM PRESSÁGIO"}</span></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => setSelectedOmen(null)} className={`rounded-lg border p-2 text-left ${selectedOmen === null ? "border-amber-300/60 bg-amber-300/10" : "border-white/10 bg-black/20"}`}><b className="text-[11px] text-white">Nenhum Presságio</b><span className="block text-[9px] text-white/50">Jogar sem modificador especial.</span></button>
                    {(Object.keys(OMEN_CONFIG) as OmenId[]).map((omen) => <button key={omen} type="button" onClick={() => setSelectedOmen(omen)} className={`rounded-lg border p-2 text-left ${selectedOmen === omen ? "border-fuchsia-300/60 bg-fuchsia-400/10" : "border-white/10 bg-black/20"}`}><b className="text-[11px] text-white">{OMEN_CONFIG[omen].name}</b><span className="mt-0.5 block text-[9px] leading-snug text-white/55">{OMEN_CONFIG[omen].description}</span></button>)}
                  </div>
                </section>
              )}

              </section>
            </div>

            <section className="fractals-gold-frame fractals-gold-corners fractals-forge-panel rounded-xl p-3.5 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="fractals-shop-item__slot !h-11 !w-11">
                    <ShoppingBag className="h-5 w-5 text-amber-200" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold uppercase tracking-wider text-amber-100 sm:text-lg">Arsenal de Fractais</h3>
                    <p className="text-xs text-violet-200/70">Melhorias permanentes e relíquias rúnicas de expedição.</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShopOpen((value) => !value)} className="h-9 border-amber-300/40 bg-amber-400/10 px-4 text-xs font-black uppercase tracking-wider text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.15)] hover:bg-amber-400/20">
                  {shopOpen ? "Fechar Arsenal" : "Abrir Arsenal"}
                  <ChevronDown className={shopOpen ? "ml-2 h-4 w-4 rotate-180 transition-transform duration-300" : "ml-2 h-4 w-4 transition-transform duration-300"} />
                </Button>
              </div>

              {shopError && <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/15 p-2.5 text-xs text-rose-200">{shopError}</p>}

              {shopOpen && (
                <div className="mt-4 space-y-4 border-t border-amber-300/20 pt-4">
                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-amber-300/25 bg-black/40 p-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-200"><Coins className="h-4 w-4 text-amber-300" /> Troca de Moedas</div>
                      <p className="mt-1 text-xs text-white/65">Converta 10 fractais em 1 moeda de ouro. Saldo: <strong className="text-amber-300">{coinBalance.toLocaleString("pt-BR")} moedas</strong></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="number" min={10} max={fractalBalance} step={10} inputMode="numeric" value={exchangeAmount} onChange={(event) => setExchangeAmount(event.target.value)} aria-label="Quantidade de fractais para converter" className="h-9 w-20 rounded border border-amber-300/30 bg-black/60 px-2 text-center text-xs font-bold text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-300" placeholder="FR" />
                      <span className="text-xs font-semibold text-amber-200/80">= {Math.floor(Math.max(0, exchangeValue) / 10).toLocaleString("pt-BR")} moedas</span>
                      <Button size="sm" disabled={shopBusy || !exchangeValid} onClick={() => void exchangeFractals()} className="h-9 border border-amber-300 bg-gradient-to-b from-amber-300 to-amber-500 px-3 text-xs font-black text-black hover:brightness-110">CONVERTER</Button>
                    </div>
                  </div>

                  <div className="fractals-shop-tabs grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Categorias do Arsenal">
                    <button type="button" role="tab" aria-selected={shopSection === "permanent"} onClick={() => setShopSection("permanent")} className={shopSection === "permanent" ? "is-active" : ""}><Crown className="h-4 w-4 text-amber-300" /> Permanentes</button>
                    <button type="button" role="tab" aria-selected={shopSection === "relics"} onClick={() => setShopSection("relics")} className={shopSection === "relics" ? "is-active" : ""}><Sparkles className="h-4 w-4 text-amber-300" /> Relíquias</button>
                    <button type="button" role="tab" aria-selected={shopSection === "weapons"} onClick={() => setShopSection("weapons")} className={shopSection === "weapons" ? "is-active" : ""}><Swords className="h-4 w-4 text-amber-300" /> Armas</button>
                    <button type="button" role="tab" aria-selected={shopSection === "omens"} onClick={() => setShopSection("omens")} className={shopSection === "omens" ? "is-active" : ""}><BookOpen className="h-4 w-4 text-amber-300" /> Presságios</button>
                  </div>

                  {shopSection === "permanent" && (
                    <div className="fractals-shop-grid">
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Heart className="h-5 w-5 text-rose-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Vida Reforçada</p><ShopInfoButton info={SHOP_ITEM_INFO.health} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.health.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.health + " de 15"}>{Array.from({ length: 15 }).map((_, i) => <i key={i} className={i < purchases.health ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.health}/15</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.health >= 15 || (!isMaster && fractalBalance < FRACTAL_SHOP.health[purchases.health]?.cost)} onClick={() => void purchaseUpgrade("health")}>{purchases.health >= 15 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.health[purchases.health]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Timer className="h-5 w-5 text-sky-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Duração de Projéteis</p><ShopInfoButton info={SHOP_ITEM_INFO.projectile_duration} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.projectile_duration.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.projectile_duration + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.projectile_duration ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.projectile_duration}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.projectile_duration >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_duration[purchases.projectile_duration]?.cost)} onClick={() => void purchaseUpgrade("projectile_duration")}>{purchases.projectile_duration >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.projectile_duration[purchases.projectile_duration]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><GemIcon className="h-5 w-5 text-fuchsia-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Ressonância Rara</p><ShopInfoButton info={SHOP_ITEM_INFO.rarity} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.rarity.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.rarity + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.rarity ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.rarity}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.rarity >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.rarity[purchases.rarity]?.cost)} onClick={() => void purchaseUpgrade("rarity")}>{purchases.rarity >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.rarity[purchases.rarity]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Gauge className="h-5 w-5 text-emerald-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Aceleração 2x</p><ShopInfoButton info={SHOP_ITEM_INFO.speed_2x} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.speed_2x.summary}</p>
                          <span className="fractals-shop-item__status">{purchases.speed_2x ? "Desbloqueado" : "Nível 0/1 · 1.000 FR"}</span>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.speed_2x || (!isMaster && fractalBalance < FRACTAL_SHOP.speed.double.cost)} onClick={() => void purchaseUpgrade("speed_2x")}>{purchases.speed_2x ? "ADQUIRIDO" : isMaster ? "GRÁTIS" : "1.000 FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Flame className="h-5 w-5 text-amber-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Aceleração 3x</p><ShopInfoButton info={SHOP_ITEM_INFO.speed_3x} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.speed_3x.summary}</p>
                          <span className="fractals-shop-item__status">{purchases.speed_3x ? "Desbloqueado" : purchases.speed_2x ? "Nível 0/1 · 2.000 FR" : "Bloqueado · requer 2x"}</span>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.speed_3x || (!isMaster && (!purchases.speed_2x || fractalBalance < FRACTAL_SHOP.speed.triple.cost))} onClick={() => void purchaseUpgrade("speed_3x")}>{purchases.speed_3x ? "ADQUIRIDO" : isMaster ? "GRÁTIS" : "2.000 FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Move className="h-5 w-5 text-emerald-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Ruptura Cinética</p><ShopInfoButton info={SHOP_ITEM_INFO.dash} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.dash.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.dash + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.dash ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.dash}/3</span></div>
                          <span className="fractals-shop-item__status">{purchases.dash >= 3 ? "Duas investidas liberadas" : purchases.dash >= 2 ? "Impacto durante o dash liberado" : purchases.dash >= 1 ? "Invulnerabilidade durante o dash" : "Disponível"}</span>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.dash >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.dash[purchases.dash])} onClick={() => void purchaseUpgrade("dash")}>{purchases.dash >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.dash[purchases.dash].toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><RotateCcw className="h-5 w-5 text-sky-300" /></div>
                        <div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Rerrolagem de Dádivas</p><ShopInfoButton info={SHOP_ITEM_INFO.reroll} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.reroll.summary}</p><div className="fractals-shop-pips" aria-label={"Nível " + purchases.reroll + " de 10"}>{Array.from({length:10}).map((_,i)=><i key={i} className={i<purchases.reroll?"fractals-shop-pip is-filled":"fractals-shop-pip"}/>)}<span>{purchases.reroll}/10</span></div><span className="fractals-shop-item__status">{unlockedCorruption>=1?"Disponível":"Requer Corrupção 1"}</span></div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || unlockedCorruption<1 && !isMaster || purchases.reroll>=10 || (!isMaster && fractalBalance<FRACTAL_SHOP.reroll[purchases.reroll])} onClick={()=>void purchaseUpgrade("reroll")}>{purchases.reroll>=10?"MAX":isMaster?"GRÁTIS":FRACTAL_SHOP.reroll[purchases.reroll].toLocaleString("pt-BR")+" FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Sparkles className="h-5 w-5 text-amber-300" /></div>
                        <div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Oráculo das Relíquias</p><ShopInfoButton info={SHOP_ITEM_INFO.oracle} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.oracle.summary}</p><div className="fractals-shop-pips" aria-label={"Nível " + purchases.oracle + " de 10"}>{Array.from({length:10}).map((_,i)=><i key={i} className={i<purchases.oracle?"fractals-shop-pip is-filled":"fractals-shop-pip"}/>)}<span>{purchases.oracle}/10 · {ORACLE_FOURTH_CHOICE_CHANCE[clamp(purchases.oracle,0,10)]}%</span></div><span className="fractals-shop-item__status">{purchases.oracle>=1?"Relíquias de Campo liberadas":unlockedCorruption>=1?"Disponível":"Requer Corrupção 1"}</span></div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || unlockedCorruption<1 && !isMaster || purchases.oracle>=10 || (!isMaster && fractalBalance<FRACTAL_SHOP.oracle[purchases.oracle])} onClick={()=>void purchaseUpgrade("oracle")}>{purchases.oracle>=10?"MAX":isMaster?"GRÁTIS":FRACTAL_SHOP.oracle[purchases.oracle].toLocaleString("pt-BR")+" FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Ban className="h-5 w-5 text-rose-300" /></div>
                        <div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Selo do Exílio</p><ShopInfoButton info={SHOP_ITEM_INFO.banish} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.banish.summary}</p><div className="fractals-shop-pips" aria-label={"Nível " + purchases.banish + " de 5"}>{Array.from({length:5}).map((_,i)=><i key={i} className={i<purchases.banish?"fractals-shop-pip is-filled":"fractals-shop-pip"}/>)}<span>{purchases.banish}/5</span></div></div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.banish>=5 || (!isMaster && fractalBalance<FRACTAL_SHOP.banish[purchases.banish])} onClick={()=>void purchaseUpgrade("banish")}>{purchases.banish>=5?"MAX":isMaster?"GRÁTIS":FRACTAL_SHOP.banish[purchases.banish].toLocaleString("pt-BR")+" FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Clover className="h-5 w-5 text-emerald-300" /></div>
                        <div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Fortuna Fractal</p><ShopInfoButton info={SHOP_ITEM_INFO.fortune} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.fortune.summary}</p><div className="fractals-shop-pips" aria-label={"Nível " + purchases.fortune + " de 5"}>{Array.from({length:5}).map((_,i)=><i key={i} className={i<purchases.fortune?"fractals-shop-pip is-filled":"fractals-shop-pip"}/>)}<span>{purchases.fortune}/5 · +{purchases.fortune*10}%</span></div><span className="fractals-shop-item__status">{unlockedCorruption>=2?"Disponível":"Requer Corrupção 2"}</span></div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || unlockedCorruption<2 && !isMaster || purchases.fortune>=5 || (!isMaster && fractalBalance<FRACTAL_SHOP.fortune[purchases.fortune])} onClick={()=>void purchaseUpgrade("fortune")}>{purchases.fortune>=5?"MAX":isMaster?"GRÁTIS":FRACTAL_SHOP.fortune[purchases.fortune].toLocaleString("pt-BR")+" FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Dna className="h-5 w-5 text-fuchsia-300" /></div>
                        <div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Transmutação Rúnica</p><ShopInfoButton info={SHOP_ITEM_INFO.transmutation} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.transmutation.summary}</p><div className="fractals-shop-pips" aria-label={"Nível " + purchases.transmutation + " de 3"}>{Array.from({length:3}).map((_,i)=><i key={i} className={i<purchases.transmutation?"fractals-shop-pip is-filled":"fractals-shop-pip"}/>)}<span>{[0,3,6,10][purchases.transmutation]}%</span></div><span className="fractals-shop-item__status">{unlockedCorruption>=3?"Disponível":"Requer Corrupção 3"}</span></div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || unlockedCorruption<3 && !isMaster || purchases.transmutation>=3 || (!isMaster && fractalBalance<FRACTAL_SHOP.transmutation[purchases.transmutation])} onClick={()=>void purchaseUpgrade("transmutation")}>{purchases.transmutation>=3?"MAX":isMaster?"GRÁTIS":FRACTAL_SHOP.transmutation[purchases.transmutation].toLocaleString("pt-BR")+" FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Heart className="h-5 w-5 text-rose-300" /></div>
                        <div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Âncora da Alma</p><ShopInfoButton info={SHOP_ITEM_INFO.anchor_soul} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.anchor_soul.summary}</p><div className="fractals-shop-pips" aria-label={"Nível " + purchases.anchor_soul + " de 3"}>{Array.from({length:3}).map((_,i)=><i key={i} className={i<purchases.anchor_soul?"fractals-shop-pip is-filled":"fractals-shop-pip"}/>)}<span>{purchases.anchor_soul}/3</span></div><span className="fractals-shop-item__status">{purchases.anchor_soul>=3?"Explosão da segunda Âncora liberada":purchases.anchor_soul>=2?"Recuperação reforçada liberada":purchases.anchor_soul>=1?"Ressurreição liberada":unlockedCorruption>=2?"Disponível":"Requer Corrupção 2"}</span></div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.anchor_soul>=3 || unlockedCorruption<2 && !isMaster || (!isMaster && fractalBalance<Number(FRACTAL_SHOP.anchor_soul[purchases.anchor_soul] ?? 0))} onClick={()=>void purchaseUpgrade("anchor_soul")}>{purchases.anchor_soul>=3?"MAX":isMaster?"GRÁTIS":Number(FRACTAL_SHOP.anchor_soul[purchases.anchor_soul] ?? 0).toLocaleString("pt-BR")+" FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><BookOpen className="h-5 w-5 text-fuchsia-300" /></div>
                        <div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Arquivo dos Presságios</p><ShopInfoButton info={SHOP_ITEM_INFO.omen_archive} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.omen_archive.summary}</p><span className="fractals-shop-item__status">{purchases.omen_archive?"Arquivo desbloqueado":unlockedCorruption>=4?"Requer Corrupção 4":"Requer Corrupção 4"}</span></div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.omen_archive || unlockedCorruption<4 && !isMaster || (!isMaster && fractalBalance<FRACTAL_SHOP.omen_archive)} onClick={()=>void purchaseUpgrade("omen_archive")}>{purchases.omen_archive?"ADQUIRIDO":isMaster?"GRÁTIS":FRACTAL_SHOP.omen_archive.toLocaleString("pt-BR")+" FR"}</button>
                      </article>

                    </div>
                  )}



                  {shopSection === "omens" && (
                    <div className="fractals-shop-grid">
                      {!purchases.omen_archive ? <article className="fractals-shop-item"><div className="fractals-shop-item__slot"><Lock className="h-5 w-5 text-fuchsia-300"/></div><div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Arquivo selado</p><ShopInfoButton info={SHOP_ITEM_INFO.archive_sealed} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO.archive_sealed.summary}</p></div></article> :
                        (Object.keys(OMEN_CONFIG) as OmenId[]).map((omen) => <article key={omen} className="fractals-shop-item"><div className="fractals-shop-item__slot"><BookOpen className="h-5 w-5 text-fuchsia-300"/></div><div className="min-w-0"><div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">{OMEN_CONFIG[omen].name}</p><ShopInfoButton info={SHOP_ITEM_INFO[`omen_${omen}`]} onOpen={setShopInfo} /></div><p className="fractals-shop-item__description">{SHOP_ITEM_INFO[`omen_${omen}`].summary}</p><span className="fractals-shop-item__status">{selectedOmen===omen?"Selecionado para a próxima partida":unlockedCorruption>=4?"Disponível · sem custo adicional":"Requer Corrupção 4"}</span></div><button type="button" className="fractals-shop-buy-btn" disabled={unlockedCorruption<4 || selectedOmen===omen} onClick={()=>setSelectedOmen(omen)}>{selectedOmen===omen?"ATIVO":"SELECIONAR"}</button></article>)
                      }
                    </div>
                  )}
                  {shopSection === "weapons" && (
                    <div className="fractals-shop-grid">
                      {(Object.keys(WEAPON_CONFIG) as WeaponId[]).map((weapon) => {
                        const config = WEAPON_CONFIG[weapon];
                        const unlocked = isWeaponUnlocked(weapon);
                        const mastered = Boolean(purchases[config.masteryKey]);
                        const projectOwned = Boolean(purchases[config.projectKey]);
                        return <article key={weapon} className="fractals-shop-item">
                          <div className="fractals-shop-item__slot"><Swords className="h-5 w-5 text-violet-300"/></div>
                          <div className="min-w-0">
                            <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">{config.name}</p><ShopInfoButton info={SHOP_ITEM_INFO[`weapon_${weapon}`]} onOpen={setShopInfo} /></div>
                            <p className="fractals-shop-item__description">{SHOP_ITEM_INFO[`weapon_${weapon}`].summary}</p>
                            {weapon === "void_revolver" ? <span className="fractals-shop-item__status">Arma inicial · gratuita</span> :
                              <span className="fractals-shop-item__status">{unlocked ? "Arma desbloqueada" : "Desbloqueio permanente"}</span>}
                            {unlocked && <span className="fractals-shop-item__status">{mastered ? "Maestria concluída" : "Maestria: vença uma expedição com esta arma"}</span>}
                            {unlocked && <span className="fractals-shop-item__status">{projectOwned ? "Projeto de evolução adquirido" : mastered ? "Projeto disponível · 5.000 FR" : "Projeto bloqueado pela maestria"}</span>}
                          </div>
                          {!unlocked ? <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || (!isMaster && fractalBalance<config.price)} onClick={()=>void purchaseUpgrade(config.purchaseKey as string)}>{isMaster?"GRÁTIS":config.price.toLocaleString("pt-BR")+" FR"}</button> :
                            !projectOwned ? <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || (!mastered && !isMaster) || (!isMaster && fractalBalance<FRACTAL_SHOP.evolution_project)} onClick={()=>void purchaseUpgrade(config.projectKey as string)}>{mastered || isMaster ? (isMaster?"GRÁTIS":"5.000 FR") : "MAESTRIA"}</button> :
                            <span className="fractals-shop-item__status">EVOLUÇÃO LIBERADA</span>}
                        </article>;
                      })}
                    </div>
                  )}
                  {shopSection === "relics" && (
                    <div className="fractals-shop-grid">
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Orbit className="h-5 w-5 text-violet-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Vórtice Coletor</p><ShopInfoButton info={SHOP_ITEM_INFO.area} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.area.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.area + " de 4"}>{Array.from({ length: 4 }).map((_, i) => <i key={i} className={i < purchases.area ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.area}/4</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.area >= 4 || (!isMaster && fractalBalance < FRACTAL_SHOP.area[purchases.area]?.cost)} onClick={() => void purchaseUpgrade("area")}>{purchases.area >= 4 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.area[purchases.area]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Sparkles className="h-5 w-5 text-amber-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Afinidade de XP</p><ShopInfoButton info={SHOP_ITEM_INFO.experience} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.experience.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.experience + " de 4"}>{Array.from({ length: 4 }).map((_, i) => <i key={i} className={i < purchases.experience ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.experience}/4</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.experience >= 4 || (!isMaster && fractalBalance < FRACTAL_SHOP.experience[purchases.experience]?.cost)} onClick={() => void purchaseUpgrade("experience")}>{purchases.experience >= 4 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.experience[purchases.experience]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Target className="h-5 w-5 text-teal-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Alcance Arcano</p><ShopInfoButton info={SHOP_ITEM_INFO.projectile_range} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.projectile_range.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.projectile_range + " de 4"}>{Array.from({ length: 4 }).map((_, i) => <i key={i} className={i < purchases.projectile_range ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.projectile_range}/4</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.projectile_range >= 4 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectile_range[purchases.projectile_range]?.cost)} onClick={() => void purchaseUpgrade("projectile_range")}>{purchases.projectile_range >= 4 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.projectile_range[purchases.projectile_range]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>

                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Swords className="h-5 w-5 text-indigo-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Coroa de Estilhaços</p><ShopInfoButton info={SHOP_ITEM_INFO.projectiles} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.projectiles.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.projectiles + " de 4"}>{Array.from({ length: 4 }).map((_, i) => <i key={i} className={i < purchases.projectiles ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.projectiles}/4</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.projectiles >= 4 || (!isMaster && fractalBalance < FRACTAL_SHOP.projectiles[purchases.projectiles]?.cost)} onClick={() => void purchaseUpgrade("projectiles")}>{purchases.projectiles >= 4 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.projectiles[purchases.projectiles]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><RotateCw className="h-5 w-5 text-cyan-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Ricochete Arcano</p><ShopInfoButton info={SHOP_ITEM_INFO.ricochet} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.ricochet.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.ricochet + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.ricochet ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.ricochet}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.ricochet >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.ricochet[purchases.ricochet]?.cost)} onClick={() => void purchaseUpgrade("ricochet")}>{purchases.ricochet >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.ricochet[purchases.ricochet]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Target className="h-5 w-5 text-violet-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Perfuração Espectral</p><ShopInfoButton info={SHOP_ITEM_INFO.piercing} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.piercing.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.piercing + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.piercing ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.piercing}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.piercing >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.piercing[purchases.piercing]?.cost)} onClick={() => void purchaseUpgrade("piercing")}>{purchases.piercing >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.piercing[purchases.piercing]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                      <article className="fractals-shop-item">
                        <div className="fractals-shop-item__slot"><Zap className="h-5 w-5 text-sky-300" /></div>
                        <div className="min-w-0">
                          <div className="fractals-shop-item__heading"><p className="fractals-shop-item__name">Descarga em Cadeia</p><ShopInfoButton info={SHOP_ITEM_INFO.chain_lightning} onOpen={setShopInfo} /></div>
                          <p className="fractals-shop-item__description">{SHOP_ITEM_INFO.chain_lightning.summary}</p>
                          <div className="fractals-shop-pips" aria-label={"Nível " + purchases.chain_lightning + " de 3"}>{Array.from({ length: 3 }).map((_, i) => <i key={i} className={i < purchases.chain_lightning ? "fractals-shop-pip is-filled" : "fractals-shop-pip"} />)}<span>{purchases.chain_lightning}/3</span></div>
                        </div>
                        <button type="button" className="fractals-shop-buy-btn" disabled={shopBusy || purchases.chain_lightning >= 3 || (!isMaster && fractalBalance < FRACTAL_SHOP.chain_lightning[purchases.chain_lightning]?.cost)} onClick={() => void purchaseUpgrade("chain_lightning")}>{purchases.chain_lightning >= 3 ? "MAX" : isMaster ? "GRÁTIS" : FRACTAL_SHOP.chain_lightning[purchases.chain_lightning]?.cost.toLocaleString("pt-BR") + " FR"}</button>
                      </article>
                    </div>
                  )}
                </div>
              )}
              <Dialog open={Boolean(shopInfo)} onOpenChange={(open) => { if (!open) setShopInfo(null); }}>
                <DialogContent className="fractals-shop-info-dialog max-h-[82vh] overflow-y-auto sm:max-w-[520px]">
                  {shopInfo && <>
                    <DialogHeader className="fractals-shop-info-header">
                      <span className="fractals-shop-info-category"><Diamond className="h-3 w-3" />{shopInfo.category}</span>
                      <DialogTitle className="fractals-shop-info-title">{shopInfo.title}</DialogTitle>
                      <DialogDescription className="fractals-shop-info-summary">{shopInfo.summary}</DialogDescription>
                    </DialogHeader>
                    <div className="fractals-shop-info-details">
                      <p className="fractals-shop-info-eyebrow">COMO FUNCIONA</p>
                      {shopInfo.details.map((detail, index) => <p key={index} className="fractals-shop-info-detail">{detail}</p>)}
                    </div>
                  </>}
                </DialogContent>
              </Dialog>
            </section>
          </div>
        </Card>
      )}

      {(running || result) && (
        <Card className="fractals-game-shell overflow-hidden border-border/70 bg-[#11111a] text-white">
          <div className="fractals-arena-frame relative">
            <canvas ref={canvasRef} className="block h-[min(78vh,720px)] min-h-[430px] w-full select-none" aria-label="Arena de sobrevivência para PC. Use WASD ou setas para mover e Espaço para dash." />
            <section className="fractals-hud-bar absolute inset-x-0 top-0" aria-label="Status da expedição">
              <div className="fractals-hud-zone fractals-hud-zone--left">
                <div className="fractals-hud-meter">
                  <span className="fractals-hud-label"><Heart/> VIDA</span>
                  <b>{Math.ceil(hud.hp)}<i>/{Math.ceil(hud.maxHp)}</i></b>
                  <span className="fractals-hud-track"><i className="is-life" style={{width:`${clamp(hud.hp / Math.max(1, hud.maxHp), 0, 1) * 100}%`}}/></span>
                </div>
                <div className="fractals-hud-meter">
                  <span className="fractals-hud-label"><Sparkles/> NV.{hud.level} · XP</span>
                  <b>{Math.floor(hud.xp)}<i>/{Math.floor(hud.nextXp)}</i></b>
                  <span className="fractals-hud-track"><i className="is-xp" style={{width:`${clamp(Math.floor(hud.xp) / Math.max(1, Math.floor(hud.nextXp)), 0, 1) * 100}%`}}/></span>
                </div>
                <div className="fractals-hud-kills"><Skull/><b>{hud.kills}</b><small>ABATES</small></div>
              </div>
              <div className="fractals-hud-zone fractals-hud-zone--center">
                <div className="fractals-hud-clock"><Timer/><b>{formatTime(hud.elapsed)}</b><small>/ 12:00</small></div>
                <div className="fractals-hud-density"><span className="fractals-live-dot"/><b>{hud.pressure.toFixed(1)}</b><small>DENSIDADE</small></div>
                <div className="fractals-hud-performance"><b>{hud.fps}</b><small>FPS</small><i>{hud.visibleEnemies}/50</i></div>
                {hud.event && <div className="fractals-hud-event"><Target/> {hud.event.id === 1 ? "RITUAL RÚNICO" : "CAÇADA DO ALGOZ"} · {Math.ceil(hud.event.remaining)}s {hud.event.id === 1 ? "· " + Math.floor(hud.event.progress) + "/25s" : ""}</div>}
              </div>
              <div className="fractals-hud-zone fractals-hud-zone--right">
                <div className="fractals-hud-mission"><b>{mission.name}</b><small>{mission.pathName} · {CORRUPTION_LEVELS[corruption].name}</small></div>
                <div className="fractals-hud-control-group" aria-label="Velocidade da expedição">
                  <small>RITMO</small>
                  <button type="button" aria-label="Diminuir velocidade" disabled={speedMultiplier === 1} onClick={() => setSpeedMultiplier((value) => value === 3 ? 2 : 1)}>−</button>
                  <b>{speedMultiplier}×</b>
                  <button type="button" aria-label="Aumentar velocidade" disabled={speedMultiplier === 3 || (!isMaster && (speedMultiplier === 1 ? !purchases.speed_2x : !purchases.speed_3x))} onClick={() => setSpeedMultiplier((value) => value === 1 ? 2 : 3)}>+</button>
                </div>
                <div className="fractals-hud-control-group" aria-label="Zoom da fase">
                  <button type="button" aria-label="Diminuir zoom" disabled={zoom <= 0.6} onClick={() => { const next = clamp(zoomRef.current - 0.1, 0.6, 1.6); zoomRef.current = next; setZoom(next); }}><ZoomOut/></button>
                  <b>{Math.round(zoom * 100)}%</b>
                  <button type="button" aria-label="Aumentar zoom" disabled={zoom >= 1.6} onClick={() => { const next = clamp(zoomRef.current + 0.1, 0.6, 1.6); zoomRef.current = next; setZoom(next); }}><ZoomIn/></button>
                </div>
                {!result && <Button size="sm" variant="outline" className="fractals-hud-pause" onClick={() => setPaused((value) => !value)}><Pause/></Button>}
              </div>
            </section>

            <div className="fractals-arena-hint pointer-events-none absolute bottom-3 left-3"><b>NECRÓPOLE DOS ESQUECIDOS</b> · WASD / SETAS: MOVER · ESPAÇO: DASH (RECARGA 1,25s)</div>
            {bossMessage && !result && <div className="fractals-boss-alert pointer-events-none absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 px-3 text-center"><span>⚠ ALERTA DE FENDA: O GUARDIÃO DESPERTOU ⚠</span></div>}
            {paused && !result && levelChoices.length === 0 && <div className="fractals-pause-overlay absolute inset-0 grid place-items-center overflow-y-auto p-3 sm:p-5">
 <div className={`fractals-pause-panel relative w-full ${pausePanel === "master" ? "max-w-3xl" : "max-w-md"} overflow-hidden p-4 sm:p-5`}>
  <div className="fractals-pause-header mb-4 flex items-center justify-between pb-3"><div><p className="text-[9px] font-bold uppercase tracking-[.24em] text-violet-200/70">Ecos dos Fractais · Refúgio</p><h3 className="mt-1 font-display text-2xl text-white">Expedição pausada</h3></div><div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-200/10 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.12)]"><Pause className="h-5 w-5"/></div></div>
  {pausePanel === "main" ? <>
   <div className="fractals-pause-actions grid grid-cols-2 gap-2"><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setPausePanel("attributes")}><UserRound className="h-4 w-4"/> Atributos</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setPausePanel("runes")}><Sparkles className="h-4 w-4 text-amber-200"/> Dádivas &amp; Runas</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={toggleFullscreen}><Maximize className="h-4 w-4"/> Tela cheia</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowPlayerHp((v) => !v)}><Heart className="h-4 w-4 text-rose-300"/> HP: {showPlayerHp ? "visível" : "oculto"}</Button><Button variant="outline" className="h-auto justify-start gap-2 rounded-xl border-violet-100/15 bg-white/[0.055] py-3 text-white shadow-inner hover:border-violet-100/35 hover:bg-violet-300/10" onClick={() => setShowDamageNumbers((v) => !v)}><Swords className="h-4 w-4 text-amber-200"/> Dano: {showDamageNumbers ? "visível" : "oculto"}</Button></div>
   <Button variant="destructive" className="mt-3 h-10 w-full border border-rose-300/25 bg-rose-950/55 font-bold text-rose-100 hover:bg-rose-900/70" onClick={() => { const game = gameRef.current; if (!game || game.ended) return; game.ended = true; setStats({ totalDamageDealt: Math.round(game.totalDamageDealt), crystalsCollected: game.crystalsCollected, highestLevel: game.highestLevel }); setResult("defeat"); setPaused(false); setPausePanel("main"); fractalAudio.defeat(); finishRun(false); }}><Skull className="mr-2 h-4 w-4"/> Desistir da partida</Button>
    <div className="fractals-pause-speed mt-3 rounded-2xl p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/75"><Gauge className="h-4 w-4"/> Velocidade da expedição</div><div className="grid grid-cols-3 gap-2">{([1,2,3] as const).map((speed) => <Button key={speed} size="sm" variant={speedMultiplier===speed?"default":"outline"} disabled={!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)} className={!isMaster && speed>1?"border-white/10 opacity-45":""} onClick={()=>setSpeedMultiplier(speed)}>{speed}x{!isMaster && (speed===2 ? !purchases.speed_2x : speed===3 ? !purchases.speed_3x : false)?" 🔒":""}</Button>)}</div>{!isMaster && <p className="mt-2 text-[10px] text-white/45">Desbloqueie 2x e 3x na loja de fractais.</p>}{isMaster && <p className="mt-2 text-[10px] text-emerald-200/70">Acesso de mestre: todas as velocidades liberadas para testes.</p>}</div>
    {isMaster && <Button className="mt-3 h-12 w-full border border-amber-200/50 bg-gradient-to-r from-amber-300 via-emerald-300 to-emerald-500 font-black tracking-wide text-[#08130e] shadow-[0_0_28px_rgba(52,211,153,.22)] hover:brightness-110" onClick={() => { setMasterGiftListOpen(false); setPausePanel("master"); }}><Crown className="mr-2 h-5 w-5"/> Painel do Mestre</Button>}
    <Button className="fractals-pause-resume mt-3 h-11 w-full font-bold" onClick={() => {setPausePanel("main");setPaused(false)}}><Play className="mr-2 h-4 w-4"/> Retomar expedição</Button>
  </> : pausePanel === "attributes" ? <>
   <div className="mb-3 grid grid-cols-2 gap-2">{[["Vida",`${Math.ceil(gameRef.current?.player.hp ?? hud.hp)} / ${Math.ceil(gameRef.current?.player.maxHp ?? hud.maxHp)}`],["Dano",`${(gameRef.current?.player.damage ?? 0).toFixed(1)}`],["Velocidade",`${(gameRef.current?.player.speed ?? 0).toFixed(0)}`],["Intervalo de ataque",`${(gameRef.current?.player.fireRate ?? 0).toFixed(2)}s`],["Nível",`${gameRef.current?.player.level ?? hud.level}`],["Projéteis",`${1 + (gameRef.current?.player.projectileStacks ?? 0)}`],["Ricochete",`${gameRef.current?.player.relicRicochet ?? 0}/3`],["Perfuração",`${gameRef.current?.player.relicPiercing ?? 0}/3`],["Descarga em Cadeia",`${gameRef.current?.player.relicChainLightning ?? 0}/3`],["Sentinelas ativas",`${gameRef.current?.sentinelTotems.length ?? 0}`],["Alcance",`+${Math.round((gameRef.current?.player.projectileRangeMultiplier ?? 1) * 100 - 100)}%`],["Experiência",`${Math.floor(gameRef.current?.player.xp ?? hud.xp)} / ${Math.floor(gameRef.current?.player.nextXp ?? hud.nextXp)}`],["Abates",`${gameRef.current?.kills ?? hud.kills}`],["Multiplicador",`${speedMultiplier}x`],["Arma",WEAPON_CONFIG[gameRef.current?.weaponId ?? selectedWeapon].name],["Nível da arma",`${gameRef.current?.weaponLevel ?? 1}/10`],["Presságio",gameRef.current?.omenId ? OMEN_CONFIG[gameRef.current.omenId].name : "Nenhum"]].map(([label,value])=><div key={label} className="rounded-lg border border-white/10 bg-white/5 p-2"><p className="text-[10px] text-white/45">{label}</p><p className="text-sm font-semibold tabular-nums text-white">{value}</p></div>)}</div>
   <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10" onClick={()=>setPausePanel("main")}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar ao menu</Button>
  </> : pausePanel === "runes" ? <>
   <section className="mb-3 max-h-[60vh] overflow-y-auto rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
    <div className="mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-200"/><h4 className="text-xs font-black uppercase tracking-wider text-violet-100">Dádivas &amp; Runas Ativas</h4></div>
    {Object.entries(gameRef.current?.upgradeCounts ?? {}).length > 0 ? <div className="grid grid-cols-1 gap-1.5">
      {Object.entries(gameRef.current?.upgradeCounts ?? {}).map(([id,rune])=><div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-violet-400/10 text-sm">{id==="power"?"⚔":id==="haste"?"⚡":id==="vitality"?"✚":id==="swift"?"➤":id==="special_area"?"🧲":id==="special_experience"?"🔮":id==="special_projectile_range"?"🏹":id==="special_ricochet"?"↗":id==="special_piercing"?"⟿":id==="special_chain_lightning"?"⚡":"✦"}</span><div className="min-w-0"><p className="truncate text-[11px] font-bold text-white">{rune.name}</p><p className="text-[9px] uppercase tracking-wider text-violet-200/65">{rune.rarity==="evolution"?"Evolução":rune.rarity==="maestria"?"Maestria":rune.rarity==="legendary"?"Lendária":rune.rarity==="epic"?"Épica":rune.rarity==="rare"?"Rara":rune.rarity==="uncommon"?"Incomum":"Comum"}</p></div></div>
        <strong className="shrink-0 text-xs tabular-nums text-amber-200">x{rune.count}</strong>
      </div>)}
    </div> : <p className="text-[10px] text-white/45">Nenhuma dádiva acumulada nesta expedição.</p>}
   </section>
   <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10" onClick={()=>setPausePanel("main")}><ArrowLeft className="mr-2 h-4 w-4"/> Voltar ao menu</Button>
  </> : <>
    {isMaster && <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300/25 bg-gradient-to-r from-emerald-950/70 via-[#15251f] to-amber-950/30 p-3">
        <div><p className="text-[9px] font-black uppercase tracking-[.22em] text-emerald-200/70">Acesso privilegiado</p><h4 className="mt-1 text-lg font-black text-white">Painel do Mestre</h4></div>
        <Shield className="h-7 w-7 text-amber-200"/>
      </div>
      <section className="space-y-2 rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3">
        <div className="flex items-center gap-2"><Swords className="h-4 w-4 text-emerald-200"/><h4 className="text-xs font-black uppercase tracking-[.16em] text-emerald-100">Troca Rápida de Arma</h4></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(WEAPON_CONFIG) as WeaponId[]).map((weaponId) => {
            const active = (masterWeaponSelection ?? gameRef.current?.weaponId ?? selectedWeapon) === weaponId;
            return <Button key={weaponId} variant="outline" className={`h-auto min-h-[54px] justify-start whitespace-normal border px-3 py-2 text-left text-[11px] font-bold leading-tight transition-all ${active ? "border-amber-300/80 bg-gradient-to-br from-amber-300/25 to-emerald-400/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,.18)] ring-1 ring-amber-200/30" : "border-white/10 bg-white/[.04] text-white/75 hover:border-emerald-200/40 hover:bg-emerald-400/10"}`} onClick={() => {
              const game = gameRef.current;
              if (!game) return;
              setMasterWeaponSelection(weaponId);
              game.weaponId = weaponId;
              game.shots = [];
              game.gravityAuraShot = undefined;
              game.gravityAuraActive = true;
              game.sentinelTotems = [];
              game.sentinelRespawnTimer = 0;
              game.shotTimer = 0.25;
              game.revolverShotCount = 0;
              game.orbitalPulseTimer = 0;
              game.player.castTimer = 0;
              toast.info("Arma alterada para " + WEAPON_CONFIG[weaponId].name + ".");
            }}>{active && <Check className="mr-1.5 h-3.5 w-3.5 shrink-0 text-amber-200"/>}{WEAPON_CONFIG[weaponId].name}</Button>;
          })}
        </div>
      </section>
      <section className="space-y-2 rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-200"/><h4 className="text-xs font-black uppercase tracking-[.16em] text-violet-100">Conceder Dádiva</h4></div>
        <Button variant="outline" className="h-10 w-full justify-between border-violet-200/25 bg-violet-400/[.08] text-xs font-bold text-violet-100 hover:bg-violet-400/[.16]" onClick={() => setMasterGiftListOpen((open) => !open)}>
          {masterGiftListOpen ? "Ocultar Lista de Dádivas" : "Mostrar Lista de Dádivas"} <ChevronDown className={`h-4 w-4 transition-transform ${masterGiftListOpen ? "rotate-180" : ""}`}/>
        </Button>
        {masterGiftListOpen && <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {MASTER_GIFT_OPTIONS.filter((gift) => {
            const activeWeapon = gameRef.current?.weaponId ?? selectedWeapon;
            if (gift.id === "weapon_mastery" || gift.id === "weapon_evolution" || gift.id === "anchor_soul") return false;
            if (gift.id.startsWith("gift_") && !WEAPON_GIFTS[activeWeapon].some((weaponGift) => weaponGift.id === gift.id)) return false;
            if (["special_ricochet", "special_piercing", "special_chain_lightning"].includes(gift.id) && !supportsProjectileRelics(activeWeapon)) return false;
            return true;
          }).map((gift) => {
            const game = gameRef.current;
            const currentLevel = game?.upgradeCounts[gift.id]?.count ?? 0;
            const capped = gift.id.startsWith("gift_") ? currentLevel >= 3
               : gift.id === "special_area" ? (game?.player.specialAreaStacks ?? 0) >= MAX_AREA_RELIC_STACKS
              : gift.id === "special_experience" ? (game?.player.specialExperienceStacks ?? 0) >= MAX_EXPERIENCE_RELIC_STACKS
              : gift.id === "special_projectile_range" ? (game?.player.projectileRangeStacks ?? 0) >= MAX_PROJECTILE_RANGE_STACKS
              : gift.id === "special_projectiles" ? (game?.player.projectileStacks ?? 0) >= MAX_EXTRA_PROJECTILES
              : gift.id === "special_ricochet" ? (game?.player.relicRicochet ?? 0) >= 3
              : gift.id === "special_piercing" ? (game?.player.relicPiercing ?? 0) >= 3
              : gift.id === "special_chain_lightning" ? (game?.player.relicChainLightning ?? 0) >= 3 : false;
            return <Button key={gift.id} variant="outline" disabled={!game || capped} className="h-auto min-h-[46px] justify-between gap-2 border-white/10 bg-black/20 px-3 py-2 text-left text-[10px] text-white hover:border-violet-200/35 hover:bg-violet-400/10 disabled:opacity-35" onClick={() => { if (!gameRef.current) return; applyUpgrade(gift); toast.success(gift.name + " concedida pelo Mestre."); }}>
              <span className="min-w-0 truncate">{gift.name}</span><span className="shrink-0 rounded-full border border-amber-200/25 bg-amber-300/10 px-2 py-1 text-[9px] font-black tabular-nums text-amber-100">Nvl. {currentLevel}</span>
            </Button>;
          })}
        </div>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button variant="outline" disabled={!gameRef.current || (gameRef.current?.weaponLevel ?? 10) >= 10} className="h-auto min-h-[48px] border-cyan-300/30 bg-cyan-400/10 px-2 py-2 text-[10px] font-black text-cyan-100 hover:bg-cyan-400/20" onClick={() => { const gift = MASTER_GIFT_OPTIONS.find((g) => g.id === "weapon_mastery"); if (gift && gameRef.current) { applyUpgrade(gift); toast.success("Ressonância da Arma: +1 nível."); } }}><Swords className="mr-1.5 h-4 w-4 shrink-0"/>Ressonância da Arma (+1 nível)</Button>
          <Button variant="outline" disabled={!gameRef.current || Boolean(gameRef.current?.evolved)} className="h-auto min-h-[48px] border-amber-300/35 bg-amber-400/10 px-2 py-2 text-[10px] font-black text-amber-100 hover:bg-amber-400/20" onClick={() => { const gift = MASTER_GIFT_OPTIONS.find((g) => g.id === "weapon_evolution"); if (gift && gameRef.current) { applyUpgrade(gift); toast.success("Despertar forçado pelo Mestre."); } }}><Crown className="mr-1.5 h-4 w-4 shrink-0"/>Forçar Despertar (Evolução)</Button>
          <Button variant="outline" disabled={!gameRef.current || Boolean(gameRef.current?.anchorReviveAvailable) || (gameRef.current?.anchorRevivesUsed ?? 0) >= 2} className="h-auto min-h-[48px] border-rose-300/30 bg-rose-400/10 px-2 py-2 text-[10px] font-black text-rose-100 hover:bg-rose-400/20" onClick={() => { const gift = MASTER_GIFT_OPTIONS.find((g) => g.id === "anchor_soul"); if (gift && gameRef.current) { applyUpgrade(gift); toast.success("Âncora da Alma concedida."); } }}><Heart className="mr-1.5 h-4 w-4 shrink-0"/>Âncora da Alma</Button>
        </div>
      </section>
      <section className="space-y-2 rounded-xl border border-amber-300/20 bg-amber-950/15 p-3">
        <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-amber-200"/><h4 className="text-xs font-black uppercase tracking-[.16em] text-amber-100">Ações de Teste de Estresse</h4></div>
        <Button className="h-11 w-full border border-emerald-200/25 bg-gradient-to-r from-emerald-500 to-teal-400 text-xs font-black text-[#06140f] hover:brightness-110" onClick={() => {
          const game = gameRef.current;
          if (!game) return;
          game.enemies = Array.from({ length: 50 }, (_, index) => {
            const angle = index / 50 * Math.PI * 2, ring = 46 + (index % 3) * 29;
            const x = game.player.x + Math.cos(angle) * ring, y = game.player.y + Math.sin(angle) * ring;
            return { x, y, hp: 100000, maxHp: 100000, speed: 22, radius: 10, damage: 0, color: "#9b91b4", xp: 0, type: "wraith" as const, attack: 0, flash: 0, windup: 0, targetX: x, targetY: y, dashTime: 0, summonedAtHalf: false, furyTriggered: false };
          });
          game.spawnTimer = Number.MAX_SAFE_INTEGER;
          game.bossSpawned = true;
          setPausePanel("main"); setPaused(false);
          toast.info("Teste de carga ativo: 50 monstros na arena. Confira o desempenho.");
        }}>TESTE DE CARGA (50 MONSTROS)</Button>
        <Button variant="outline" className="h-10 w-full border-rose-300/30 bg-rose-400/10 text-xs font-black text-rose-100 hover:bg-rose-400/20" onClick={() => {
          const game = gameRef.current;
          if (!game) return;
          game.player.hp = game.player.maxHp; game.player.hitFlash = 0; game.player.invuln = 0;
          setHud((current) => ({ ...current, hp: game.player.hp, maxHp: game.player.maxHp }));
          toast.success("HP restaurado ao máximo.");
        }}><Heart className="mr-2 h-4 w-4"/>Restaurar HP Total</Button>
      </section>
    </div>}
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button variant="outline" className="h-10 border-white/15 text-white hover:bg-white/10" onClick={() => setPausePanel("main")}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar ao menu</Button>
      <Button className="fractals-pause-resume h-10 font-bold" onClick={() => { setPausePanel("main"); setPaused(false); }}><Play className="mr-2 h-4 w-4"/>Retomar</Button>
    </div>
   </>}
 </div>
</div>}
            {levelChoices.length > 0 && (
              <div className="fractals-upgrade-overlay absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.38),rgba(5,4,10,0.96)_75%)] p-2 backdrop-blur-md sm:p-4">
                <div className="fractals-upgrade-panel w-full max-w-xl space-y-3 rounded-2xl border border-violet-200/20 bg-[#14101d]/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.75)] sm:p-4">
                  <div className="text-center">
                    <p className="text-[8px] font-black uppercase tracking-[.22em] text-violet-200/70 sm:text-[9px]">
                      {eventRewardStep > 0 ? `DESAFIO DA FENDA · DÁDIVA ${eventRewardStep}/2` : "O FRACTAL DESPERTA"}
                    </p>
                    <h3 className="mt-0.5 font-display text-lg text-white sm:text-2xl">
                      {eventRewardStep > 0 ? "Escolha sua recompensa" : "Selecione uma Dádiva"}
                    </h3>
                    <p className="text-[9px] text-white/45">Toque para selecionar · Use o ícone de giro para ler os detalhes</p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[9px] font-bold text-sky-100">Rerrolagens: {gameRef.current?.rerollsRemaining ?? 0}</span>
                      <span className="rounded-full border border-rose-300/20 bg-rose-400/10 px-2.5 py-1 text-[9px] font-bold text-rose-100">Exílios: {gameRef.current?.banishesRemaining ?? 0}</span>
                      <Button size="sm" variant="outline" disabled={(gameRef.current?.rerollsRemaining ?? 0) <= 0} onClick={rerollGiftChoices} className="h-8 border-sky-300/30 bg-sky-400/10 px-3 text-[9px] font-black text-sky-100 hover:bg-sky-400/20"><RotateCcw className="mr-1.5 h-3 w-3"/> RERROLAR OPÇÕES</Button>
                    </div>
                  </div>

                  <div className={`grid gap-1.5 sm:gap-3 ${levelChoices.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
                    {levelChoices.map((upgrade) => {
                      const Icon = upgrade.icon;
                      const rarity = upgrade.rarity ?? "normal";
                      const isSelected = selectedUpgrade?.id === upgrade.id;
                      const isFlipped = flippedCardId === upgrade.id;
                      const isWeaponGift = upgrade.id.startsWith("gift_");

                      const rarityBorder = isWeaponGift
                        ? "border-emerald-300/75 bg-gradient-to-br from-emerald-500/25 via-lime-400/10 to-[#071a16] shadow-[0_0_20px_rgba(16,185,129,.24)] ring-1 ring-lime-300/25"
                        : rarity === "evolution"
                        ? "border-amber-200/80 bg-gradient-to-br from-fuchsia-500/25 via-cyan-400/10 to-amber-400/25 shadow-[0_0_26px_rgba(251,191,36,.25)] ring-1 ring-fuchsia-300/30"
                        : rarity === "maestria"
                        ? "border-cyan-300/60 bg-gradient-to-b from-cyan-400/20 to-[#10202a] shadow-[0_0_20px_rgba(34,211,238,.18)]"
                        : rarity === "legendary"
                        ? "border-amber-300/70 bg-gradient-to-b from-amber-400/20 to-[#21180e] shadow-[0_0_18px_rgba(251,191,36,.12)]"
                        : rarity === "uncommon"
                        ? "border-rose-400/70 bg-gradient-to-br from-rose-500/25 via-amber-500/15 to-[#25120f] shadow-[0_0_18px_rgba(244,63,94,.18)]"
                        : rarity === "epic"
                        ? "border-fuchsia-400/50 bg-gradient-to-b from-fuchsia-500/15 to-[#1c1226]"
                        : rarity === "rare"
                        ? "border-sky-300/40 bg-gradient-to-b from-sky-500/10 to-[#101724]"
                        : "border-amber-200/20 bg-gradient-to-b from-white/[0.05] to-[#181420]";

                      const rarityTag = isWeaponGift
                        ? "text-emerald-100 border-emerald-300/50 bg-gradient-to-r from-emerald-500/20 to-lime-400/15"
                        : rarity === "evolution"
                        ? "text-amber-100 border-fuchsia-300/50 bg-gradient-to-r from-fuchsia-500/20 via-cyan-400/15 to-amber-400/20"
                        : rarity === "maestria"
                        ? "text-cyan-100 border-cyan-300/40 bg-cyan-400/10"
                        : rarity === "legendary"
                        ? "text-amber-200 border-amber-300/40 bg-amber-400/10"
                        : rarity === "uncommon"
                        ? "text-amber-100 border-rose-300/50 bg-rose-500/20"
                        : rarity === "epic"
                        ? "text-fuchsia-200 border-fuchsia-300/30 bg-fuchsia-400/10"
                        : rarity === "rare"
                        ? "text-sky-200 border-sky-300/30 bg-sky-400/10"
                        : "text-amber-100/70 border-white/10 bg-white/5";

                      const iconStyle = isWeaponGift
                        ? "border-emerald-300/70 bg-gradient-to-br from-emerald-500/30 via-emerald-400/15 to-lime-300/20 text-lime-100 shadow-[0_0_18px_rgba(16,185,129,.28)]"
                        : rarity === "evolution"
                        ? "border-amber-200/70 bg-gradient-to-br from-fuchsia-400/25 via-cyan-300/20 to-amber-300/30 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,.25)]"
                        : rarity === "maestria"
                        ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-100"
                        : rarity === "legendary"
                        ? "border-amber-300/50 bg-amber-400/20 text-amber-100"
                        : rarity === "uncommon"
                        ? "border-rose-300/60 bg-gradient-to-br from-rose-500/30 to-amber-400/25 text-amber-100"
                        : rarity === "epic"
                        ? "border-fuchsia-300/40 bg-fuchsia-400/20 text-fuchsia-100"
                        : rarity === "rare"
                        ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
                        : "border-amber-200/20 bg-amber-200/10 text-amber-100";

                      return (
                        <div
                          key={upgrade.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedUpgrade(upgrade)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedUpgrade(upgrade);
                            }
                          }}
                          className={`group relative flex min-h-[140px] cursor-pointer select-none flex-col justify-between rounded-xl border p-2 text-left transition-all duration-200 sm:min-h-[160px] ${rarityBorder} ${
                            isSelected
                              ? (isWeaponGift ? "ring-2 ring-lime-300 scale-[1.02] shadow-[0_0_24px_rgba(163,230,53,.35)] -translate-y-1 brightness-110" : "ring-2 ring-amber-300 scale-[1.02] shadow-[0_0_20px_rgba(252,211,77,0.35)] -translate-y-1 brightness-110")
                              : "hover:border-white/30 hover:-translate-y-0.5"
                          }`}
                        >
                          <button
                            type="button"
                            title={isFlipped ? "Ver frente" : "Ver descrição do efeito"}
                            aria-label={isFlipped ? "Ver frente da carta" : "Ver verso da carta"}
                            onClick={(e) => {
                              e.stopPropagation();
                              fractalAudio.cardFlip();
                              setFlippedCardId(isFlipped ? null : upgrade.id);
                            }}
                            className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/70 backdrop-blur-sm transition hover:bg-white/20 hover:text-white"
                          >
                            <RotateCw className={`h-3 w-3 transition-transform duration-300 ${isFlipped ? "rotate-180 text-amber-300" : ""}`} />
                          </button>
                          {(gameRef.current?.banishesRemaining ?? 0) > 0 && upgrade.id !== "weapon_mastery" && upgrade.id !== "weapon_evolution" && (
                            <button type="button" title="Banir esta dádiva nesta partida" aria-label={`Banir ${upgrade.name}`}
                              onClick={(event) => { event.stopPropagation(); banishGiftChoice(upgrade); }}
                              className="absolute right-9 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-rose-300/25 bg-rose-950/70 text-rose-200 transition hover:bg-rose-500/30">
                              <Ban className="h-3 w-3"/>
                            </button>
                          )}

                          {isSelected && (
                            <div className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black shadow-md">
                              <Check className="h-3 w-3 stroke-[3]" />
                            </div>
                          )}

                          {!isFlipped ? (
                            <div className="my-auto flex flex-col items-center justify-center pt-2 text-center">
                              <div className={`mb-2 grid h-10 w-10 place-items-center rounded-xl border shadow-inner ${iconStyle}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <p className="line-clamp-2 text-xs font-bold leading-tight text-white sm:text-sm">
                                {upgrade.name}
                              </p>
                              <span className={`mt-2 rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider sm:text-[8px] ${rarityTag}`}>
                                {isWeaponGift ? "Exclusiva · Incomum" : rarity === "evolution" ? "Evolução" : rarity === "maestria" ? "Maestria" : rarity === "legendary" ? "Lendária" : rarity === "uncommon" ? "Incomum" : rarity === "epic" ? "Épica" : rarity === "rare" ? "Rara" : "Normal"}
                              </span>
                            </div>
                          ) : (
                            <div className="my-auto flex flex-col justify-between pt-4 text-center">
                              <p className="text-[10px] leading-relaxed text-white/90 sm:text-xs">
                                {getUpgradeDescription(upgrade)}
                              </p>
                              <span className="mt-2 text-[7px] font-bold uppercase tracking-wider text-amber-200/80 sm:text-[8px]">
                                {rarity === "evolution" ? "Forma definitiva da arma" : rarity === "maestria" ? "Maestria · +1 nível da arma" : rarity === "uncommon" ? "Relíquia · sem bônus de raridade" : rarity === "epic" ? "+50% Potência" : rarity === "rare" ? "+25% Potência" : "100% Padrão"}
                              </span>
                            </div>
                          )}

                          <div className="mt-1 border-t border-white/10 pt-1 text-center">
                            <span className="text-[8px] font-semibold uppercase tracking-wider text-white/40">
                              {isSelected ? "Selecionado" : "Tocar p/ escolher"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2">
                    <Button
                      disabled={!selectedUpgrade}
                      onClick={() => {
                        if (selectedUpgrade) {
                          chooseUpgrade(selectedUpgrade);
                          setSelectedUpgrade(null);
                          setFlippedCardId(null);
                        }
                      }}
                      className={`h-11 w-full rounded-xl font-display text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
                        selectedUpgrade
                          ? "bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-black shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:brightness-110 active:scale-[0.98]"
                          : "cursor-not-allowed border border-white/10 bg-white/5 text-white/30"
                      }`}
                    >
                      {selectedUpgrade ? "Reivindicar Dádiva Selecionada" : "Selecione uma dádiva"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {result && <div className="fractals-result-overlay absolute inset-0 grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(91,46,133,0.28),rgba(5,4,10,0.95)_72%)] p-4 backdrop-blur-md"><div className="fractals-result-panel w-full max-w-sm rounded-[1.6rem] border border-violet-200/20 bg-[#171320]/95 p-5 text-center shadow-[0_30px_100px_rgba(0,0,0,0.7)]"><div className="fractals-result-icon mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl border border-amber-200/20 bg-gradient-to-br from-amber-200/15 via-violet-400/15 to-violet-950/70 shadow-[0_0_36px_rgba(167,139,250,0.18)]">{result==="victory"?<Sparkles className="h-7 w-7 text-amber-200"/>:<Skull className="h-7 w-7 text-rose-300"/>}</div><p className="fractals-result-kicker text-xs uppercase tracking-[.22em] text-violet-200">{result==="victory"?"Guardião derrotado":"Expedição encerrada"}</p><h3 className="fractals-result-title mt-1 font-display text-2xl">{result==="victory"?"O fractal silenciou":"O Vazio prevaleceu"}</h3><div className="fractals-result-stats mt-4 grid grid-cols-2 gap-2 text-left">
  <div className="fractals-stat-tile"><Skull/><span>Inimigos abatidos</span><b>{hud.kills.toLocaleString("pt-BR")}</b></div>
  <div className="fractals-stat-tile"><Swords/><span>Dano infligido</span><b>{stats.totalDamageDealt.toLocaleString("pt-BR")}</b></div>
  <div className="fractals-stat-tile"><GemIcon/><span>Fragmentos colhidos</span><b>{stats.crystalsCollected.toLocaleString("pt-BR")}</b></div>
  <div className="fractals-stat-tile"><Timer/><span>Tempo sobrevivido</span><b>{formatTime(hud.elapsed)}</b></div>
 </div><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-100/60">Nível máximo alcançado: {stats.highestLevel}</p><p className="fractals-result-note mt-3 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 text-sm font-bold text-amber-100">✦ RECOMPENSA DA FENDA · {earnedFractals !== null ? earnedFractals.toLocaleString("pt-BR") : "—"} FR</p><p className="fractals-result-note mt-2 text-xs text-amber-100/80">{rewardStatus === "pending" ? "Validando as recompensas com o servidor..." : rewardStatus === "error" ? "Não foi possível confirmar as recompensas desta expedição." : earnedFractals !== null && earnedFractals > 0 ? `Você recebeu ${earnedFractals.toLocaleString("pt-BR")} fractais nesta expedição.` : result === "victory" ? "Vitória registrada. O próximo nível foi liberado." : "Nenhum fractal extra foi concedido nesta tentativa."}</p><Button className="fractals-result-button mt-4 gap-2" onClick={()=>{setRunning(false);setResult(null);setBossMessage(false);gameRef.current=null;}}><RotateCcw className="h-4 w-4"/> Voltar à expedição</Button></div></div>}
          </div>
          <div className="fractals-arena-footer flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] text-white/45 sm:px-4"><span>Arma automática: projétil perseguidor</span><span>Recompensas e progressão validadas no servidor</span></div>
        </Card>
      )}
      <div className="fractals-lore-note flex items-start gap-2 rounded-xl border border-amber-300/15 bg-gradient-to-r from-amber-500/[0.07] to-transparent p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><p>Último Silêncio apresenta Ecos errantes, Enlutados resistentes, Vigias de elite com aura de drenagem e o Pranteador Sem Rosto, que marca uma área antes de liberar uma onda de lamento e convoca ecos quando perde metade da vida. A loja e a progressão de corrupção já usam o estado persistente da conta; a concessão de recompensas de fim de expedição é validada e creditada pelo servidor.</p></div>
    </div>
  );
}
