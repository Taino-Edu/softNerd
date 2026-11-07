import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../state/providers.dart';
import '../tema.dart';
import '../widgets/marca.dart';

class AbaConta extends ConsumerWidget {
  const AbaConta({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(sessaoProvider);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
      children: [
        Cartao(
          padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 20),
          child: Column(children: [
            AvatarJogador(pokemon: u?.pokemon, shiny: u?.shiny ?? false, nome: u?.nome ?? '', tamanho: 104, destaque: true),
            const SizedBox(height: 14),
            Text(u?.nome ?? '', textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Pilula(u?.papel == 'Customer' ? 'Jogador' : (u?.papel ?? ''), cor: Marca.azul, icone: Icons.verified_user_outlined),
            if (u?.pokemon == null) ...[
              const SizedBox(height: 14),
              const Text('Escolha seu Pokémon preferido no site da loja: ele vira a sua foto aqui no app.',
                  textAlign: TextAlign.center, style: TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w600, fontSize: 13)),
            ],
          ]),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.logout),
          label: const Text('Sair da conta'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(54), foregroundColor: Marca.vermelho, side: const BorderSide(color: Marca.vermelho, width: 1.5)),
          onPressed: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (c) => AlertDialog(
                title: const Text('Sair da conta?'),
                content: const Text('Você precisará entrar de novo com e-mail e senha.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
                  FilledButton(onPressed: () => Navigator.pop(c, true), style: FilledButton.styleFrom(minimumSize: const Size(90, 44)), child: const Text('Sair')),
                ],
              ),
            );
            if (ok == true) await ref.read(sessaoProvider.notifier).sair();
          },
        ),
        const SizedBox(height: 28),
        Center(child: Image.asset('assets/images/logo-santuario.webp', height: 64, opacity: const AlwaysStoppedAnimation(.9))),
        const SizedBox(height: 8),
        const Center(child: Text('Santuário Nerd · José Bonifácio-SP', style: TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w700, fontSize: 13))),
        if (kDebugMode) ...[
          const SizedBox(height: 4),
          Center(child: Text('Servidor: $apiUrl', style: const TextStyle(color: Colors.black26, fontSize: 11))),
        ],
      ],
    );
  }
}
