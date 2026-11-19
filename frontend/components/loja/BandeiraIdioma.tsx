// Bandeirinha do idioma da carta (Mercado de Cartas, v1.91.0) — desenhada aqui porque o Windows não mostra
// bandeira em emoji (aparece "BR" em letra). Idioma sem bandeira vira a sigla num selinho.
const W = 18, H = 12

export default function BandeiraIdioma({ idioma, titulo }: { idioma: string; titulo?: string }) {
  const comum = { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': titulo ?? idioma,
    className: 'inline-block shrink-0 rounded-[2px] ring-1 ring-black/10' }
  switch (idioma) {
    case 'PT':
      return (
        <svg {...comum}><title>{titulo ?? idioma}</title>
          <rect width={W} height={H} fill="#009C3B" />
          <path d="M9 1.4 16.2 6 9 10.6 1.8 6Z" fill="#FFDF00" />
          <circle cx="9" cy="6" r="2.6" fill="#002776" />
        </svg>
      )
    case 'EN':
      return (
        <svg {...comum}><title>{titulo ?? idioma}</title>
          <rect width={W} height={H} fill="#FFFFFF" />
          {[0, 2, 4, 6, 8, 10].map(y => <rect key={y} y={y} width={W} height={1} fill="#B22234" />)}
          <rect width={W * 0.45} height={H * 0.54} fill="#3C3B6E" />
        </svg>
      )
    case 'JP':
      return (
        <svg {...comum}><title>{titulo ?? idioma}</title>
          <rect width={W} height={H} fill="#FFFFFF" />
          <circle cx={W / 2} cy={H / 2} r="3.4" fill="#BC002D" />
        </svg>
      )
    case 'ES':
      return (
        <svg {...comum}><title>{titulo ?? idioma}</title>
          <rect width={W} height={H} fill="#AA151B" />
          <rect y={H / 4} width={W} height={H / 2} fill="#F1BF00" />
        </svg>
      )
    default:
      return <span className="text-[10px] font-black px-1 rounded border border-current opacity-70" title={titulo}>{idioma}</span>
  }
}
