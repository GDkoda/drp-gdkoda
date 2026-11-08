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
        <ellipse cx="64" cy="38.5" rx="5.1" ry="6.1" fill="currentColor" stroke="none" />
        <ellipse cx="64" cy="38.5" rx="2" ry="3.4" fill="var(--aion-icon-bg, #111521)" stroke="none" />
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

      {/* Face direita — numeral seis desenhado e inclinado com a perspectiva. */}
      <g transform="matrix(.36 -.19 0 .44 64 62)">
        <path
          d="M83 24
             C62 18 42 34 42 60
             C42 85 55 102 75 102
             C95 102 108 88 108 69
             C108 50 94 39 77 39
             C60 39 49 51 49 68
             C49 81 58 90 73 90
             C87 90 96 82 96 69
             C96 58 88 51 77 51"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
