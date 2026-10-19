// Fonte pixel (videogame) da liguinha — telão, página da Liga e animações de resultado.
// Uma instância só: cada chamada de next/font gera um @font-face próprio.
import { Press_Start_2P } from 'next/font/google'

export const pixel = Press_Start_2P({ weight: '400', subsets: ['latin'], display: 'swap' })
