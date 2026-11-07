import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/providers.dart';
import '../tema.dart';
import '../widgets/estado.dart';

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
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const SizedBox(height: 12),
                  Text('Santuário Nerd',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, color: Marca.azulEscuro)),
                  const SizedBox(height: 4),
                  const Text('Liga e Liguinha', textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 32),
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
                    Text(_erro!, style: const TextStyle(color: Marca.vermelho, fontWeight: FontWeight.w600)),
                  ],
                  const SizedBox(height: 22),
                  FilledButton(
                    onPressed: _enviando ? null : _entrar,
                    child: _enviando ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Entrar'),
                  ),
                  const SizedBox(height: 18),
                  const Text('Ainda não tem conta? Cadastre-se no site da loja e volte aqui.',
                      textAlign: TextAlign.center, style: TextStyle(color: Colors.black54, fontSize: 13)),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
