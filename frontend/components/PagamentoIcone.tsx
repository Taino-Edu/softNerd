// Ícone de cada forma de pagamento — um só lugar, pra PDV e fechamento de comanda
// mostrarem o mesmo desenho (o catálogo de formas fica em lib/pagamentos.ts).
import { Banknote, CreditCard, FileText, QrCode, Star, Wallet } from 'lucide-react'

const ICONES = { Pix: QrCode, Dinheiro: Banknote, Crediario: FileText, Pontos: Star, Cashback: Wallet }

export function PagamentoIcone({ forma, className = 'w-4 h-4 shrink-0' }: { forma: string; className?: string }) {
  const Icone = ICONES[forma as keyof typeof ICONES] ?? CreditCard // crédito e débito
  return <Icone className={className} />
}
