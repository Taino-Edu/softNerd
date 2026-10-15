// =============================================================================
// termos/page.tsx — Termos de Uso da Santuário Nerd
// José Bonifácio, SP — Foro: Comarca de José Bonifácio, SP
// v1.1 junho/2026
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'
import ThemeToggle from '@/components/ThemeToggle'
import { LegalActions } from '@/components/LegalActions'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'Termos de Uso — Santuário Nerd',
  description: 'Termos e condições de uso dos serviços da Santuário Nerd, loja de card games em José Bonifácio, SP.',
}

const sections = [
  { id: 's1', num: '01', title: 'Serviços Oferecidos' },
  { id: 's2', num: '02', title: 'Cadastro e Conta' },
  { id: 's3', num: '03', title: 'Crediário' },
  { id: 's4', num: '04', title: 'Comandas' },
  { id: 's5', num: '05', title: 'Campeonatos' },
  { id: 's6', num: '06', title: 'Propriedade Intelectual' },
  { id: 's7', num: '07', title: 'Limitação de Responsabilidade' },
  { id: 's8', num: '08', title: 'Direitos do Consumidor' },
  { id: 's9', num: '09', title: 'Foro e Legislação' },
  { id: 's10', num: '10', title: 'Contato' },
]

export default function TermosPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <header className="bg-[#10286B] text-white print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 text-xl font-bold">
            <span className="text-[#42B6EE]">Santuário</span><span> Nerd</span>
          </Link>
          <div className="flex items-center gap-3">
            <LegalActions />
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-[#10286B] to-transparent print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-10 pb-8">
          <span className="inline-block text-[10px] font-bold tracking-widest text-[#42B6EE] uppercase mb-3">
            CDC (Lei 8.078/1990) · LGPD (Lei 13.709/2018)
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">Termos de Uso</h1>
          <p className="text-gray-400 text-sm">
            Última atualização: <strong className="text-gray-300">Junho de 2026</strong> — Versão 1.1 ·{' '}
            <span className="text-gray-500">Foro: Comarca de José Bonifácio, SP</span>
          </p>
        </div>
      </div>

      {/* ── Print header ─────────────────────────────────────────────────────── */}
      <div className="hidden print:block py-6 border-b border-gray-200 mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Santuário Nerd — José Bonifácio, SP</p>
        <h1 className="text-2xl font-black text-gray-900">Termos de Uso</h1>
        <p className="text-sm text-gray-500 mt-1">Junho de 2026 · Versão 1.1 · Foro: Comarca de José Bonifácio, SP</p>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-16">
        <div className="flex gap-8 items-start">

          {/* ── Índice lateral ───────────────────────────────────────────────── */}
          <aside className="hidden lg:block w-52 shrink-0 sticky top-6 print:hidden">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Conteúdo</p>
            <nav className="space-y-1">
              {sections.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors group"
                >
                  <span className="text-[10px] font-mono text-gray-600 group-hover:text-[#42B6EE]">{s.num}</span>
                  {s.title}
                </a>
              ))}
            </nav>
            <div className="mt-6 pt-4 border-t border-white/10 space-y-1">
              <Link href="/privacidade" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white">
                → Política de Privacidade
              </Link>
              <Link href="/lgpd" className="flex items-center gap-1.5 text-xs text-[#42B6EE] hover:underline">
                → Exercer direitos LGPD
              </Link>
            </div>
          </aside>

          {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
          <main className="flex-1 min-w-0 space-y-2 pt-2">

            {/* Introdução */}
            <div className="rounded-2xl border p-5 mb-2 text-sm" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              Ao utilizar o sistema digital da <strong style={{ color: 'var(--text-primary)' }}>Santuário Nerd</strong>, você
              concorda com os presentes Termos de Uso. Leia com atenção antes de prosseguir. Estes Termos são regidos
              pela legislação brasileira.
            </div>

            <Section id="s1" num="01" title="Serviços Oferecidos">
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                A <strong style={{ color: 'var(--text-primary)' }}>Santuário Nerd</strong> é uma loja física de card games
                localizada em <strong style={{ color: 'var(--text-primary)' }}>José Bonifácio, SP</strong>. Nosso sistema digital oferece:
              </p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {[
                  'Abertura e gestão de comandas na loja',
                  'Programa de pontos e cashback',
                  'Crediário para clientes cadastrados',
                  'Inscrição e acompanhamento de campeonatos',
                  'Busca de cartas TCG (Pokémon, Magic, Yu-Gi-Oh!)',
                ].map(item => (
                  <li key={item} className="flex gap-2 text-sm rounded-lg px-3 py-2 border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-primary)' }}>
                    <span className="text-[#42B6EE] shrink-0">▸</span> {item}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="s2" num="02" title="Cadastro e Conta">
              <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <p>
                  O cadastro é realizado presencialmente na loja via QR Code ou pelo administrador do sistema.
                  Ao se cadastrar, você declara que as informações fornecidas (nome, CPF, WhatsApp) são verídicas.
                </p>
                <p>
                  O uso indevido do sistema — incluindo fornecimento de dados falsos, tentativas de acesso
                  não autorizado ou abuso do programa de pontos — pode resultar no cancelamento da conta sem aviso prévio.
                </p>
                <p>
                  Você é responsável pela confidencialidade de suas credenciais. Em caso de
                  suspeita de uso não autorizado, entre em contato imediatamente.
                </p>
              </div>
            </Section>

            <Section id="s3" num="03" title="Crediário">
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                O crediário é uma linha de crédito oferecida a clientes cadastrados, sujeita à análise e aprovação.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  ['Prazo padrão', '30 dias corridos a partir da abertura'],
                  ['Limite simultâneo', 'Um crediário aberto por cliente por vez'],
                  ['Bloqueio', 'Crediários em aberto bloqueiam novas comandas'],
                  ['Inadimplência', 'Pode implicar restrição de acesso aos serviços'],
                  ['Aprovação', 'A Santuário Nerd pode negar o crediário a qualquer cliente'],
                ].map(([label, desc]) => (
                  <div key={label} className="rounded-xl p-3 border text-sm" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                    <p className="text-xs font-bold text-[#42B6EE] mb-0.5">{label}</p>
                    <p style={{ color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="s4" num="04" title="Comandas">
              <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <p>
                  A comanda é o registro digital dos itens consumidos durante uma visita à loja.
                  O cliente é responsável pelos itens registrados em sua comanda.
                </p>
                <p>
                  O encerramento da comanda implica concordância com os valores e itens listados.
                  Em caso de divergência, sinalize imediatamente ao responsável pela loja.
                </p>
              </div>
            </Section>

            <Section id="s5" num="05" title="Campeonatos">
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                A participação sujeita-se às regras específicas de cada evento, divulgadas com antecedência.
              </p>
              <ul className="space-y-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                {[
                  'A taxa de inscrição pode ser cobrada antecipadamente e não é reembolsável, salvo cancelamento do evento pela organização',
                  'O participante deve apresentar deck válido conforme o regulamento do jogo',
                  'Comportamento antidesportivo pode resultar em desclassificação',
                  'A Santuário Nerd reserva-se o direito de alterar datas e regras com aviso prévio',
                ].map(item => (
                  <li key={item} className="flex gap-2">
                    <span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span> {item}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="s6" num="06" title="Propriedade Intelectual">
              <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <p>
                  Os nomes, logotipos e conteúdos de jogos de cartas (Pokémon, Magic: The Gathering, Yu-Gi-Oh!
                  e outros) são propriedade de seus respectivos detentores. A Santuário Nerd não reivindica
                  qualquer direito sobre esses conteúdos.
                </p>
                <p>
                  O sistema digital, o código-fonte e o design da plataforma Santuário Nerd são propriedade
                  exclusiva da Santuário Nerd e não podem ser reproduzidos, modificados ou distribuídos sem
                  autorização expressa.
                </p>
              </div>
            </Section>

            <Section id="s7" num="07" title="Limitação de Responsabilidade">
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                A Santuário Nerd não se responsabiliza por:
              </p>
              <ul className="space-y-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                {[
                  'Danos decorrentes do uso indevido do sistema pelo usuário',
                  'Indisponibilidade temporária do sistema por manutenção ou falhas técnicas',
                  'Perda ou dano a cartões físicos que não sejam de responsabilidade da loja',
                ].map(item => (
                  <li key={item} className="flex gap-2">
                    <span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span> {item}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="s8" num="08" title="Direitos do Consumidor (CDC)">
              <div className="text-sm space-y-2" style={{ color: 'var(--text-muted)' }}>
                <p>
                  Estes Termos não afastam nem limitam os direitos previstos no{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong>.
                </p>
                <div className="rounded-xl border border-[#42B6EE]/20 bg-[#42B6EE]/5 px-4 py-3">
                  <p>Em caso de reclamação, contate a Santuário Nerd em{' '}
                    <a href="mailto:contato@santuarionerd.com.br" className="text-[#42B6EE] underline">
                      contato@santuarionerd.com.br
                    </a>{' '}
                    ou registre no portal{' '}
                    <a href="https://www.consumidor.gov.br" target="_blank" rel="noopener noreferrer"
                      className="text-[#42B6EE] underline">
                      consumidor.gov.br
                    </a>.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="s9" num="09" title="Foro e Legislação Aplicável">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Estes Termos são regidos pelas leis da República Federativa do Brasil. Para dirimir
                quaisquer controvérsias, fica eleito o foro da{' '}
                <strong style={{ color: 'var(--text-primary)' }}>Comarca de José Bonifácio, SP</strong>,
                com renúncia expressa a qualquer outro, por mais privilegiado que seja.
              </p>
            </Section>

            <Section id="s10" num="10" title="Contato">
              <div className="text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
                <p>
                  <strong style={{ color: 'var(--text-primary)' }}>E-mail:</strong>{' '}
                  <a href="mailto:contato@santuarionerd.com.br" className="text-[#42B6EE] underline">
                    contato@santuarionerd.com.br
                  </a>
                </p>
                <p><strong style={{ color: 'var(--text-primary)' }}>Local:</strong> Santuário Nerd — José Bonifácio, SP</p>
              </div>
            </Section>

            {/* Rodapé */}
            <div className="pt-6 mt-4 flex flex-wrap gap-4 text-sm border-t" style={{ borderColor: 'var(--border-color)' }}>
              <Link href="/privacidade" className="text-[#42B6EE] hover:underline">Política de Privacidade</Link>
              <Link href="/lgpd" className="text-[#42B6EE] hover:underline">Exercer meus Direitos (LGPD)</Link>
              <a href="mailto:contato@santuarionerd.com.br" className="text-[#42B6EE] hover:underline">
                contato@santuarionerd.com.br
              </a>
            </div>

          </main>
        </div>
      </div>
    </div>
  )
}

function Section({ id, num, title, children }: { id: string; num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-2xl border p-5 sm:p-6 scroll-mt-6" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono font-bold text-[#42B6EE] bg-[#42B6EE]/10 px-2 py-0.5 rounded-md">{num}</span>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}
