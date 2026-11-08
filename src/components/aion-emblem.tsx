import type { SVGProps } from "react";

export function AionEmblem(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="AION — o deus que contempla os seis destinos"
      {...props}
    >
      <title>AION — o deus que contempla os seis destinos</title>

      {/* Órbitas celestes: o D6 flutua no espaço. */}
      <g opacity=".26">
        <ellipse cx="64" cy="63" rx="58" ry="21" transform="rotate(-34 64 63)" />
        <ellipse cx="64" cy="63" rx="58" ry="21" transform="rotate(34 64 63)" strokeDasharray="2 5" />
        <circle cx="64" cy="63" r="56" strokeDasharray="1 6" />
      </g>

      {/* Cubo em perspectiva: três faces visíveis de um dado de seis lados. */}
      <path d="M64 15 104 38V86L64 112 24 86V38Z" strokeWidth="2.8" />
      <path d="M24 38 64 62 104 38M64 62V112" strokeWidth="2.2" />
      <path d="M29 40 64 60 99 40" opacity=".24" />

      {/* Face superior — o olho que vê todas as possibilidades. */}
      <g>
        <path d="M42 38.5Q64 19 86 38.5Q64 58 42 38.5Z" strokeWidth="2.3" />
        <path d="M64 26V22M53 38.5H49M79 38.5H75" strokeWidth="1.35" />
        <circle cx="64" cy="38.5" r="5.35" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.35" />
        <path d="M64 34.1C61.6 36 61.6 41 64 42.9C66.4 41 66.4 36 64 34.1Z" fill="var(--background, #111521)" stroke="currentColor" strokeWidth="1.05" />
        <circle cx="62.9" cy="36.6" r="1" fill="#fff6da" stroke="none" />
        <path d="M58 31.5 55 28M70 31.5 73 28" opacity=".8" />
      </g>

      {/* Face esquerda — coroa gravada no plano lateral do cubo. */}
      <g>
        <path
          d="M30 61 36.5 66.5 42.5 57.5 48.5 73.5 55 68.5 58.5 82
             31 66.5Z"
          strokeWidth="1.9"
          fill="currentColor"
          fillOpacity=".07"
        />
        <path d="M31 66.5 58.5 82 57.5 89 31.5 74.2Z" strokeWidth="1.8" />
        <path d="M31 66.5 57.5 82M36.5 69.8 37.5 76.5M48.5 76.5 48 83" strokeWidth="1.2" opacity=".8" />
        <path d="m44 72 4 3-4 3-4-3Z" fill="currentColor" stroke="none" />
        <circle cx="36.5" cy="66.5" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="42.5" cy="57.5" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="55" cy="68.5" r="1.6" fill="currentColor" stroke="none" />
      </g>

      {/* Face direita — número 6 gravado no plano em perspectiva do D6. */}
      <g>
        <path d="M94 69C83 69 75 78 73 89C71 101 79 106 88 103C97 101 101 92 97 84C94 78 86 77 81 81C76 85 76 92 80 96C84 100 91 99 94 94C97 89 94 84 88 83" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Estrelas e marcas de orientação fora do dado. */}
      <g fill="currentColor" stroke="none">
        <path d="m15 18 2.2 4.7 4.8 2.3-4.8 2.2-2.2 4.8-2.3-4.8L8 25l4.7-2.3Z" />
        <path d="m110 91 1.8 3.8 3.8 1.9-3.8 1.8-1.8 3.9-1.9-3.9-3.8-1.8 3.8-1.9Z" />
        <circle cx="22" cy="103" r="1.5" />
        <circle cx="105" cy="18" r="1.3" />
      </g>
      <path d="M64 4V11M64 117V124M4 63H11M117 63H124" strokeWidth="1.35" opacity=".8" />
    </svg>
  );
}
