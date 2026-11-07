export type MonsterArtwork = {
  src: string;
  alt: string;
};

const MONSTER_ARTWORK: { match: RegExp; artwork: MonsterArtwork }[] = [
  { match: /\bgoblin\b/i, artwork: { src: "/monsters/goblin.svg", alt: "Goblin — criatura pequena de pele verde e orelhas pontudas" } },
  { match: /\blobo\b|\bwolf\b/i, artwork: { src: "/monsters/dire-wolf.svg", alt: "Lobo atroz — fera lupina de presas longas" } },
  { match: /\besqueleto\b|\bskeleton\b/i, artwork: { src: "/monsters/skeleton.svg", alt: "Esqueleto — guerreiro de ossos e olhos azulados" } },
  { match: /\borc\b/i, artwork: { src: "/monsters/orc-raider.svg", alt: "Orc saqueador — brutamontes de presas proeminentes" } },
  { match: /\btroll\b/i, artwork: { src: "/monsters/cave-troll.svg", alt: "Troll das cavernas — gigante de pele rochosa" } },
];

const FALLBACK_ARTWORK: MonsterArtwork = {
  src: "/monsters/abyssal-beast.svg",
  alt: "Fera das sombras — criatura fantástica",
};

/** Selects an existing illustration using the monster name returned by the server. */
export function getMonsterArtwork(monsterName: string | null | undefined): MonsterArtwork {
  const name = (monsterName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return MONSTER_ARTWORK.find(({ match }) => match.test(name))?.artwork ?? FALLBACK_ARTWORK;
}
