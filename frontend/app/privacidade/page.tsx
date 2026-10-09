// =============================================================================
// privacidade/page.tsx — Política de Privacidade da Santuário Nerd
// José Bonifácio, SP — LGPD (Lei 13.709/2018) — v1.2 junho/2026
// =============================================================================

import Link from 'next/link'
import type { Metadata } from 'next'
import ThemeToggle from '@/components/ThemeToggle'
import { LegalActions } from '@/components/LegalActions'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'Política de Privacidade — Santuário Nerd',
  description: 'Como a Santuário Nerd coleta, usa e protege seus dados pessoais em conformidade com a LGPD.',
}

const sections = [
  { id: 's1', num: '01', title: 'Quem Somos' },
  { id: 's2', num: '02', title: 'Dados que Coletamos' },
  { id: 's3', num: '03', title: 'Finalidade do Tratamento' },
  { id: 's4', num: '04', title: 'Base Legal' },
  { id: 's5', num: '05', title: 'Compartilhamento' },
  { id: 's6', num: '06', title: 'Seus Direitos' },
  { id: 's7', num: '07', title: 'Retenção de Dados' },
  { id: 's8', num: '08', title: 'Segurança' },
  { id: 's9', num: '09', title: 'Cookies' },
  { id: 's10', num: '10', title: 'Contato' },
  { id: 's11', num: '11', title: 'Alterações' },
]

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <header className="bg-[#1a0a2e] text-white print:hidden">
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
      <div className="bg-gradient-to-b from-[#1a0a2e] to-transparent print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-10 pb-8">
          <span className="inline-block text-[10px] font-bold tracking-widest text-[#42B6EE] uppercase mb-3">
            LGPD · Lei nº 13.709/2018
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">Política de Privacidade</h1>
          <p className="text-gray-400 text-sm">
            Última atualização: <strong className="text-gray-300">Junho de 2026</strong> — Versão 1.2 ·{' '}
            <span className="text-gray-500">José Bonifácio, SP</span>
          </p>
        </div>
      </div>

      {/* ── Print header (apenas no PDF) ────────────────────────────────────── */}
      <div className="hidden print:block py-6 border-b border-gray-200 mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Santuário Nerd — José Bonifácio, SP</p>
        <h1 className="text-2xl font-black text-gray-900">Política de Privacidade</h1>
        <p className="text-sm text-gray-500 mt-1">Junho de 2026 · Versão 1.2 · LGPD (Lei 13.709/2018)</p>
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
              <Link href="/lgpd" className="flex items-center gap-1.5 text-xs text-[#42B6EE] hover:underline">
                → Exercer meus direitos
              </Link>
              <Link href="/termos" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white">
                → Termos de Uso
              </Link>
            </div>
          </aside>

          {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
          <main className="flex-1 min-w-0 space-y-2 pt-2">

            <Section id="s1" num="01" title="Quem Somos">
              <p>
                A <strong>Santuário Nerd</strong> é uma loja de card games em <strong>José Bonifácio, SP</strong>.
                Operamos um sistema digital de comandas, campeonatos, crediário e programa de pontos para nossos clientes.
              </p>
              <InfoBox>
                <p className="font-semibold mb-0.5">Controlador dos dados</p>
                <p>Santuário Nerd — José Bonifácio, SP</p>
                <a href="mailto:contato@santuarionerd.com.br" className="text-[#42B6EE]">
                  contato@santuarionerd.com.br
                </a>
              </InfoBox>
            </Section>

            <Section id="s2" num="02" title="Dados que Coletamos">
              <ul className="space-y-2">
                {[
                  ['Nome completo', 'identificação e personalização do atendimento'],
                  ['CPF', 'identificação única e prevenção de fraudes no crediário'],
                  ['WhatsApp', 'contato e login rápido via QR Code'],
                  ['E-mail', 'confirmações, notificações e recuperação de senha'],
                  ['Histórico de comandas e compras', 'gestão do crediário e pontos'],
                  ['Participação em campeonatos', 'nome do deck, colocação'],
                  ['Saldo de pontos e cashback', 'programa de fidelidade'],
                  ['Conta Google (opcional)', 'se você escolher "Entrar com Google": recebemos do Google só o seu nome, o e-mail confirmado e um código da conta — nunca a sua senha do Google'],
                  ['Endereço IP (hash SHA-256)', 'segurança e prevenção de abusos — nunca armazenamos o IP em texto puro'],
                ].map(([key, val]) => (
                  <li key={key} className="flex gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span>
                    <span><strong style={{ color: 'var(--text-primary)' }}>{key}</strong> — {val}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="s3" num="03" title="Finalidade do Tratamento">
              <ul className="space-y-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                {[
                  'Identificar e autenticar usuários no sistema',
                  'Gerenciar comandas, pedidos e pagamentos (inclusive crediário)',
                  'Administrar o programa de pontos e cashback',
                  'Processar inscrições e resultados de campeonatos',
                  'Enviar comunicações transacionais (crediário, campeonatos, redefinição de senha)',
                  'Cumprir obrigações legais e fiscais',
                  'Prevenir fraudes e garantir a segurança do sistema',
                ].map(item => (
                  <li key={item} className="flex gap-2">
                    <span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="s4" num="04" title="Base Legal (LGPD Art. 7º)">
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ['Consentimento (Art. 7º, I)', 'Registro inicial via QR Code e envio de comunicações'],
                  ['Execução de contrato (Art. 7º, V)', 'Gestão de comandas, crediário e campeonatos'],
                  ['Legítimo interesse (Art. 7º, IX)', 'Segurança do sistema e prevenção de fraudes'],
                  ['Obrigação legal (Art. 7º, II)', 'Fins fiscais e contábeis'],
                ].map(([base, desc]) => (
                  <div key={base} className="rounded-xl p-3 border text-sm" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <p className="font-semibold text-[#42B6EE] text-xs mb-1">{base}</p>
                    <p style={{ color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="s5" num="05" title="Compartilhamento de Dados">
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                Não vendemos nem alugamos seus dados. Compartilhamos apenas com:
              </p>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <li className="flex gap-2"><span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span><span><strong style={{ color: 'var(--text-primary)' }}>APIs de cartas TCG</strong> (Pokémon, Magic, Yu-Gi-Oh!) — apenas para buscar informações de cartas. Nenhum dado pessoal é enviado.</span></li>
                <li className="flex gap-2"><span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span><span><strong style={{ color: 'var(--text-primary)' }}>Provedor de e-mail (SMTP)</strong> — notificações transacionais (redefinição de senha, confirmação de crediário).</span></li>
                <li className="flex gap-2"><span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span><span><strong style={{ color: 'var(--text-primary)' }}>Google</strong> — só se você usar &quot;Entrar com Google&quot;: o Google confirma quem você é e nos envia nome e e-mail. Não enviamos ao Google nenhum dado seu da loja.</span></li>
                <li className="flex gap-2"><span className="text-[#42B6EE] shrink-0 mt-0.5">▸</span><span><strong style={{ color: 'var(--text-primary)' }}>Autoridades públicas</strong> — quando exigido por lei ou ordem judicial.</span></li>
              </ul>
            </Section>

            <Section id="s6" num="06" title="Seus Direitos (LGPD Art. 18)">
              <div className="grid sm:grid-cols-2 gap-2 mb-4">
                {[
                  ['Acesso', 'Saber quais dados possuímos sobre você'],
                  ['Retificação', 'Corrigir dados incompletos ou desatualizados'],
                  ['Exclusão', 'Solicitar a anonimização ou exclusão dos seus dados'],
                  ['Portabilidade', 'Receber seus dados em formato estruturado'],
                  ['Oposição', 'Opor-se a tratamentos baseados em legítimo interesse'],
                  ['Revogação', 'Retirar o consentimento a qualquer momento'],
                ].map(([right, desc]) => (
                  <div key={right} className="flex gap-2 text-sm rounded-lg p-3 border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <span className="text-[#42B6EE] font-bold shrink-0">✓</span>
                    <span><strong style={{ color: 'var(--text-primary)' }}>{right}:</strong>{' '}<span style={{ color: 'var(--text-muted)' }}>{desc}</span></span>
                  </div>
                ))}
              </div>
              <InfoBox>
                Acesse o <Link href="/lgpd" className="text-[#42B6EE] font-semibold underline">formulário LGPD</Link> para exercer seus direitos
                ou envie e-mail para <a href="mailto:contato@santuarionerd.com.br" className="text-[#42B6EE] underline">contato@santuarionerd.com.br</a>.
                Respondemos em até <strong>15 dias corridos</strong> (Art. 18 § 5º).
              </InfoBox>
            </Section>

            <Section id="s7" num="07" title="Retenção de Dados">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Mantemos seus dados pelo tempo necessário para as finalidades descritas, ou conforme exigido
                por lei. Dados de crediário e compras podem ser retidos por até <strong style={{ color: 'var(--text-primary)' }}>5 anos</strong> para fins fiscais.
                Após solicitação de exclusão, anonimizamos os dados pessoais identificáveis, mantendo apenas
                o histórico transacional de forma desidentificada.
              </p>
            </Section>

            <Section id="s8" num="08" title="Segurança">
              <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                {[
                  'Senhas com hash BCrypt — nunca em texto puro',
                  'Tokens de sessão com validade de 60 min e renovação automática',
                  'Cookies HttpOnly e SameSite=Strict',
                  'IPs armazenados como hash SHA-256',
                  'HTTPS em produção',
                  'Trilha de auditoria de acessos a dados sensíveis',
                  'Rate limiting para prevenção de força bruta',
                ].map(item => (
                  <li key={item} className="flex gap-2 rounded-lg p-2.5 border text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)' }}>
                    <span className="text-green-500 shrink-0">🔒</span> {item}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="s9" num="09" title="Cookies">
              <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                  <p className="font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Essenciais</p>
                  <p>Necessários para autenticação e segurança da sessão — incluindo o que reconhece um aparelho onde você já entrou, para que tentativas de senha de outras pessoas não bloqueiem a sua conta nele. Não podem ser desativados.</p>
                </div>
                <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                  <p className="font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Preferências</p>
                  <p>Armazenam preferências de interface (tema claro/escuro). Podem ser limpos nas configurações do navegador.</p>
                </div>
              </div>
            </Section>

            <Section id="s10" num="10" title="Contato e Reclamações">
              <div className="text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
                <p><strong style={{ color: 'var(--text-primary)' }}>E-mail:</strong>{' '}
                  <a href="mailto:contato@santuarionerd.com.br" className="text-[#42B6EE] underline">contato@santuarionerd.com.br</a>
                </p>
                <p><strong style={{ color: 'var(--text-primary)' }}>Local:</strong> Santuário Nerd — José Bonifácio, SP</p>
              </div>
              <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
                Insatisfeito com nossa resposta? Registre reclamação na{' '}
                <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-[#42B6EE] underline">
                  ANPD — Autoridade Nacional de Proteção de Dados
                </a>.
              </p>
            </Section>

            <Section id="s11" num="11" title="Alterações desta Política">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Podemos atualizar esta Política periodicamente. Quando realizarmos alterações relevantes,
                notificaremos os usuários cadastrados por e-mail e atualizaremos a data de última atualização.
                O uso continuado do sistema implica aceitação da nova versão.
              </p>
            </Section>

            {/* Rodapé de links */}
            <div className="pt-6 mt-4 flex flex-wrap gap-4 text-sm border-t" style={{ borderColor: 'var(--border-color)' }}>
              <Link href="/termos" className="text-[#42B6EE] hover:underline">Termos de Uso</Link>
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

// ── Componentes auxiliares ────────────────────────────────────────────────────

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

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-[#42B6EE]/20 bg-[#42B6EE]/5 px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}
