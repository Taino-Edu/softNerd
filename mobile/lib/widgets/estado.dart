import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api.dart';

/// Texto de erro amigável a partir de qualquer exceção.
String textoDoErro(Object e) => e is ApiErro ? e.mensagem : 'Algo deu errado. Tente de novo.';

/// Mostra carregando / erro com "Tentar de novo" / o conteúdo. Mantém o conteúdo antigo
/// enquanto recarrega (atualização em segundo plano não pisca a tela).
class EstadoAsync<T> extends StatelessWidget {
  const EstadoAsync({super.key, required this.valor, required this.construir, required this.aoTentar});
  final AsyncValue<T> valor;
  final Widget Function(T dados) construir;
  final VoidCallback aoTentar;

  @override
  Widget build(BuildContext context) {
    if (valor.hasValue) return construir(valor.requireValue);
    if (valor.hasError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off, size: 44, color: Colors.black38),
            const SizedBox(height: 12),
            Text(textoDoErro(valor.error!), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton.icon(onPressed: aoTentar, icon: const Icon(Icons.refresh), label: const Text('Tentar de novo')),
          ]),
        ),
      );
    }
    return const Center(child: CircularProgressIndicator());
  }
}

void avisar(BuildContext context, String texto, {bool erro = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(texto), backgroundColor: erro ? const Color(0xFFB91C1C) : null));
}
