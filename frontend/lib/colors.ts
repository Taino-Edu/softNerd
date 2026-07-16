// Utilitários de cor compartilhados — antes duplicados em app/page.tsx e
// app/admin/site/page.tsx.

/** Mistura duas cores hex (`a` com `ratio` de `b`) — ex: mixHex('#3EC2F2', '#ffffff', 0.2). */
export function mixHex(a: string, b: string, ratio: number): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
    if (!m) return null
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const pa = parse(a), pb = parse(b)
  if (!pa || !pb) return a
  const mix = pa.map((c, i) => Math.round(c * (1 - ratio) + pb[i] * ratio))
  return '#' + mix.map(c => c.toString(16).padStart(2, '0')).join('')
}

/** Determina se uma cor hexadecimal é escura ou clara (YIQ). */
export function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return yiq < 128
}

/** Retorna a melhor cor de texto (branca ou escura) para contrastar com o fundo. */
export function getContrastText(bgHex: string, darkTextColor = '#0C3D5A', lightTextColor = '#FFFFFF'): string {
  return isDark(bgHex) ? lightTextColor : darkTextColor
}
