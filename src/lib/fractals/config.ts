export type FractalPathId = "mourning" | "anger" | "envy" | "sadness" | "chaos";

export interface FractalMission {
  id: 1 | 2 | 3 | 4 | 5;
  slug: string;
  name: string;
  pathId: FractalPathId;
  pathName: string;
  color: string;
  maxFractals: number;
  baseDifficulty: number;
  identity: string;
  mechanics: string[];
  bossTitle: string;
}

export const FRACTAL_MISSIONS: readonly FractalMission[] = [
  {
    id: 1,
    slug: "ultimo-silencio",
    name: "Último Silêncio",
    pathId: "mourning",
    pathName: "Caminho do Luto",
    color: "#777987",
    maxFractals: 10,
    baseDifficulty: 1,
    identity: "Resistência, desgaste e drenagem de vida.",
    mechanics: ["Criaturas resistentes", "Zonas de drenagem", "Inimigos que protegem uns aos outros"],
    bossTitle: "O Pranteador Sem Rosto",
  },
  {
    id: 2,
    slug: "furia-eterna",
    name: "Fúria Eterna",
    pathId: "anger",
    pathName: "Caminho da Raiva",
    color: "#e34b43",
    maxFractals: 15,
    baseDifficulty: 2,
    identity: "Agressividade, velocidade e explosões.",
    mechanics: ["Investidas telegrafadas", "Criaturas explosivas", "Ataques em cadeia"],
    bossTitle: "O Coração em Brasa",
  },
  {
    id: 3,
    slug: "jardim-da-cobica",
    name: "Jardim da Cobiça",
    pathId: "envy",
    pathName: "Caminho da Inveja",
    color: "#58a66a",
    maxFractals: 25,
    baseDifficulty: 3,
    identity: "Veneno, regeneração e parasitismo.",
    mechanics: ["Inimigos regenerativos", "Nuvens venenosas", "Criaturas que fortalecem outras"],
    bossTitle: "A Matriarca Insaciável",
  },
  {
    id: 4,
    slug: "lagrimas-do-abismo",
    name: "Lágrimas do Abismo",
    pathId: "sadness",
    pathName: "Caminho da Tristeza",
    color: "#4d91d8",
    maxFractals: 50,
    baseDifficulty: 4,
    identity: "Controle de área, lentidão e congelamento.",
    mechanics: ["Solo congelado", "Projéteis que desaceleram", "Rotas de fuga limitadas"],
    bossTitle: "A Voz Sob o Gelo",
  },
  {
    id: 5,
    slug: "coracao-do-caos",
    name: "Coração do Caos",
    pathId: "chaos",
    pathName: "Caminho do Caos",
    color: "#a879d8",
    maxFractals: 100,
    baseDifficulty: 5,
    identity: "Distorção, imprevisibilidade e padrões combinados.",
    mechanics: ["Trajetórias distorcidas", "Padrões mutáveis", "Combinações de ameaças"],
    bossTitle: "O Fractal Primordial",
  },
] as const;

export const RUN_DURATION_SECONDS = 12 * 60;
export const CORRUPTION_LEVEL_MIN = 0;
export const CORRUPTION_LEVEL_MAX = 5;

export interface CorruptionLevel {
  level: number;
  name: string;
  description: string;
}

export const CORRUPTION_LEVELS: readonly CorruptionLevel[] = [
  { level: 0, name: "Íntegro", description: "A arena ainda resiste à influência do Vazio." },
  { level: 1, name: "Maculado", description: "A presença do Vazio começa a alterar a arena." },
  { level: 2, name: "Contaminado", description: "Ameaças especiais aparecem com maior frequência." },
  { level: 3, name: "Devorado", description: "As mecânicas do caminho tornam-se mais presentes." },
  { level: 4, name: "Abissal", description: "Elites e combinações perigosas pressionam a sobrevivência." },
  { level: 5, name: "Irreversível", description: "A arena está profundamente tomada pelo Vazio." },
] as const;
