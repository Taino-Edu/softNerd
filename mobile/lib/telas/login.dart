import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';
import '../widgets/marca.dart';

class TelaLogin extends ConsumerStatefulWidget {
  const TelaLogin({super.key});
  @override
  ConsumerState<TelaLogin> createState() => _TelaLoginState();
}

class _TelaLoginState extends ConsumerState<TelaLogin> {
  final _email = TextEditingController();
  final _senha = TextEditingController();
  bool _enviando = false;
  bool _ver = false;
  String? _erro;

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    if (_email.text.trim().isEmpty || _senha.text.isEmpty) {
      setState(() => _erro = 'Digite o e-mail e a senha.');
      return;
    }
    setState(() { _enviando = true; _erro = null; });
    try {
      await ref.read(sessaoProvider.notifier).entrar(_email.text, _senha.text);
    } catch (e) {
      if (mounted) setState(() => _erro = textoDoErro(e));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(children: [
        CabecalhoMarca(
          raio: 44,
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 34),
          child: Column(children: [
            Image.asset('assets/images/logo-santuario.webp', height: 150),
            const SizedBox(height: 10),
            const Text.rich(
              TextSpan(style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 24), children: [
                TextSpan(text: 'Jogue, '),
                TextSpan(text: 'evolua', style: TextStyle(color: Marca.amarelo)),
                TextSpan(text: ' e divirta-se'),
              ]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text('Liga e Liguinha', style: TextStyle(color: Colors.white.withValues(alpha: .8), fontWeight: FontWeight.w700)),
          ]),
        ),
        Expanded(
          child: Align(
            alignment: Alignment.topCenter,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 26, 24, 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Text('Bem-vindo de volta!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 2),
                    const Text('Entre com a conta que você usa no site da loja.', style: TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 20),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'E-mail', prefixIcon: Icon(Icons.mail_outline)),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _senha,
                      obscureText: !_ver,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _entrar(),
                      decoration: InputDecoration(
                        labelText: 'Senha',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(icon: Icon(_ver ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _ver = !_ver)),
                      ),
                    ),
                    if (_erro != null) ...[
                      const SizedBox(height: 12),
                      Row(children: [
                        const Icon(Icons.error_outline, color: Marca.vermelho, size: 18),
                        const SizedBox(width: 6),
                        Expanded(child: Text(_erro!, style: const TextStyle(color: Marca.vermelho, fontWeight: FontWeight.w700))),
                      ]),
                    ],
                    const SizedBox(height: 22),
                    BotaoAmarelo(texto: 'Entrar', icone: Icons.login, aoTocar: _entrar, carregando: _enviando),
                    const SizedBox(height: 18),
                    const Text('Ainda não tem conta? Cadastre-se no site da loja e volte aqui.',
                        textAlign: TextAlign.center, style: TextStyle(color: Marca.textoSuave, fontSize: 13, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
