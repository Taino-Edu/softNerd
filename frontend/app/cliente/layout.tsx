import CompleteProfileGuard from '@/components/CompleteProfileGuard'

// Layout da área do cliente: além das páginas, monta o guard que obriga contas
// semi-criadas (quick-login, sem e-mail/senha) a completarem o cadastro.
export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CompleteProfileGuard />
    </>
  )
}
