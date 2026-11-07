import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api.dart';
import 'state/providers.dart';
import 'tema.dart';
import 'telas/inicio.dart';
import 'telas/login.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await Api.criar();
  final container = ProviderContainer(overrides: [apiProvider.overrideWithValue(api)]);
  // Os cookies guardados ainda valem? Se sim, abre direto logado.
  await container.read(sessaoProvider.notifier).restaurar();
  runApp(UncontrolledProviderScope(container: container, child: const SantuarioLigaApp()));
}

class SantuarioLigaApp extends ConsumerWidget {
  const SantuarioLigaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logado = ref.watch(sessaoProvider) != null;
    return MaterialApp(
      title: 'Santuário Liga',
      debugShowCheckedModeBanner: false,
      theme: temaDoApp(),
      home: logado ? const TelaInicio() : const TelaLogin(),
    );
  }
}
