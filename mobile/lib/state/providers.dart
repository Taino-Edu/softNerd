import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api.dart';
import '../models/liga.dart';

/// Preenchido em main() depois de criar o cliente (precisa de I/O pra achar a pasta dos cookies).
final apiProvider = Provider<Api>((ref) => throw UnimplementedError('apiProvider não foi preenchido'));

/// Quem está logado (null = ninguém). A raiz do app troca de tela conforme isso.
class SessaoNotifier extends Notifier<Usuario?> {
  @override
  Usuario? build() => null;

  /// Ao abrir o app: os cookies guardados ainda valem?
  Future<void> restaurar() async {
    try {
      state = Usuario.json(await ref.read(apiProvider).getMapa('/api/user/me'));
    } catch (_) {
      state = null;
    }
  }

  Future<void> entrar(String email, String senha) async {
    final j = await ref
        .read(apiProvider)
        .postMapa('/api/auth/client-login', corpo: {'email': email.trim(), 'password': senha});
    state = Usuario.json(j);
  }

  Future<void> sair() async {
    final api = ref.read(apiProvider);
    try {
      await api.post('/api/auth/logout');
    } catch (_) {/* sai mesmo assim */}
    await api.limparSessao();
    state = null;
  }
}

final sessaoProvider = NotifierProvider<SessaoNotifier, Usuario?>(SessaoNotifier.new);

final torneiosAtivosProvider = FutureProvider.autoDispose<List<TorneioResumo>>((ref) async {
  final lista = await ref.watch(apiProvider).getLista('/api/torneios/ativos');
  return lista.whereType<Map>().map((e) => TorneioResumo.json(Map<String, dynamic>.from(e))).toList();
});

final minhaMesaProvider = FutureProvider.autoDispose.family<MinhaMesa, String>((ref, id) async {
  return MinhaMesa.json(await ref.watch(apiProvider).getMapa('/api/torneios/$id/minha-mesa'));
});

final mesesLigaProvider = FutureProvider.autoDispose<List<LigaMes>>((ref) async {
  final lista = await ref.watch(apiProvider).getLista('/api/liga-mensal/meses');
  return lista.whereType<Map>().map((e) => LigaMes.json(Map<String, dynamic>.from(e))).toList();
});

/// [chave]: "atual" ou "AAAA-MM".
final ligaMensalProvider = FutureProvider.autoDispose.family<LigaMensal, String>((ref, chave) async {
  final query = chave == 'atual'
      ? null
      : {'ano': int.parse(chave.substring(0, 4)), 'mes': int.parse(chave.substring(5))};
  return LigaMensal.json(await ref.watch(apiProvider).getMapa('/api/liga-mensal', query: query));
});
