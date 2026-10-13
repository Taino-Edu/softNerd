// fotoLeve — foto enviada pela loja (/uploads) no tamanho em que aparece na tela.
//
//   <img src={fotoLeve(p.imageUrl, 480)} … />
//
// A API devolve a foto reduzida e em WebP (CardGameStore/Services/Implementations/FotosLeves.cs),
// uma vez só, e a Cloudflare guarda. A largura é a do lugar na tela em telas de celular
// com densidade 2x (card de 190 px → 480). Com a chave "fotos-leves" desligada a API
// ignora o "?w" e manda a original — nada a mudar aqui.
//
// Foto de fora (cartas de TCG, Google, QR do Pix) volta igual: só /uploads é nosso.

const ORIGENS_DA_LOJA = [
  '',
  process.env.NEXT_PUBLIC_API_URL ?? '',
  'https://santuarionerd.com.br',
].filter((o, i, todas) => todas.indexOf(o) === i)

export function fotoLeve(url: string | null | undefined, largura: number): string | undefined {
  if (!url) return url ?? undefined
  if (url.includes('?')) return url
  const daLoja = ORIGENS_DA_LOJA.some(origem => url.startsWith(`${origem}/uploads/`))
  return daLoja ? `${url}?w=${largura}` : url
}
