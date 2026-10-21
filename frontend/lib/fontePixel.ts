// Fonte pixel (videogame) da liguinha — telão, página da Liga e animações de resultado.
// Uma instância só: cada chamada de next/font gera um @font-face próprio.
// Do pacote @fontsource (npm), não do Google na hora do build — o download falhava de vez em quando.
import localFont from 'next/font/local'

export const pixel = localFont({
  src: '../node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
})
