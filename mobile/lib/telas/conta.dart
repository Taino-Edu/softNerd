import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../state/providers.dart';
import '../tema.dart';

class AbaConta extends ConsumerWidget {
  const AbaConta({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(sessaoProvider);
    final inicial = (u?.nome.isNotEmpty ?? false) ? u!.nome.characters.first.toUpperCase() : '?';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(children: [
              CircleAvatar(radius: 30, backgroundColor: Marca.amarelo, child: Text(inicial, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Marca.azulEscuro))),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u?.nome ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(u?.papel == 'Customer' ? 'Jogador' : (u?.papel ?? ''), style: const TextStyle(color: Colors.black54)),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.logout),
          label: const Text('Sair da conta'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50), foregroundColor: Marca.vermelho),
          onPressed: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (c) => AlertDialog(
                title: const Text('Sair da conta?'),
                content: const Text('Você precisará entrar de novo com e-mail e senha.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
                  FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sair')),
                ],
              ),
            );
            if (ok == true) await ref.read(sessaoProvider.notifier).sair();
          },
        ),
        const SizedBox(height: 24),
        Center(child: Text('Servidor: $apiUrl', style: const TextStyle(color: Colors.black38, fontSize: 12))),
      ],
    );
  }
}
