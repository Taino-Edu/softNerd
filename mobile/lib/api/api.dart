import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

import '../config.dart';

/// Erro de API com a mensagem que o servidor mandou (ou uma genérica em português).
class ApiErro implements Exception {
  ApiErro(this.mensagem, {this.status});
  final String mensagem;
  final int? status;
  bool get semSessao => status == 401;
  @override
  String toString() => mensagem;
}

/// Cliente HTTP do app. O login da API usa cookies HttpOnly (accessToken/refreshToken), então o
/// app guarda os cookies num PersistCookieJar (sobrevivem ao fechar o app) e os manda em toda chamada.
class Api {
  Api._(this.dio, this.jar);

  final Dio dio;
  final PersistCookieJar jar;

  static Future<Api> criar() async {
    final dir = await getApplicationSupportDirectory();
    final jar = PersistCookieJar(storage: FileStorage('${dir.path}/cookies'));
    final dio = Dio(BaseOptions(
      baseUrl: apiUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept': 'application/json'},
    ));
    dio.interceptors.add(CookieManager(jar));
    // Sessão expirou no meio do uso: tenta renovar uma vez e repete a chamada.
    dio.interceptors.add(InterceptorsWrapper(onError: (e, handler) async {
      final req = e.requestOptions;
      final renovavel = e.response?.statusCode == 401 &&
          !req.path.startsWith('/api/auth/') &&
          req.extra['repetida'] != true;
      if (renovavel) {
        try {
          await dio.post('/api/auth/refresh');
          req.extra['repetida'] = true;
          return handler.resolve(await dio.fetch(req));
        } catch (_) {/* segue com o 401 original */}
      }
      handler.next(e);
    }));
    return Api._(dio, jar);
  }

  /// Converte qualquer falha de rede/HTTP em [ApiErro] com texto que dá pra mostrar.
  Future<T> _chamar<T>(Future<Response<dynamic>> Function() req, T Function(dynamic dados) ler) async {
    try {
      final r = await req();
      return ler(r.data);
    } on DioException catch (e) {
      throw ApiErro(_mensagem(e), status: e.response?.statusCode);
    }
  }

  static String _mensagem(DioException e) {
    final d = e.response?.data;
    if (d is Map) {
      final m = d['message'] ?? d['Message'] ?? d['mensagem'] ?? d['error'];
      if (m is String && m.isNotEmpty) return m;
    }
    if (d is String && d.isNotEmpty && d.length < 200) return d;
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'A internet está lenta. Tente de novo.';
      case DioExceptionType.connectionError:
        return 'Sem conexão com o servidor.';
      default:
        break;
    }
    switch (e.response?.statusCode) {
      case 401:
        return 'Sua sessão acabou. Entre de novo.';
      case 403:
        return 'Você não tem permissão pra isso.';
      case 404:
        return 'Não encontrado.';
      case 429:
        return 'Muitas tentativas. Espere um pouco.';
    }
    return 'Algo deu errado. Tente de novo.';
  }

  Future<Map<String, dynamic>> getMapa(String caminho, {Map<String, dynamic>? query}) =>
      _chamar(() => dio.get(caminho, queryParameters: query), (d) => Map<String, dynamic>.from(d as Map));

  Future<List<dynamic>> getLista(String caminho, {Map<String, dynamic>? query}) =>
      _chamar(() => dio.get(caminho, queryParameters: query), (d) => List<dynamic>.from(d as List));

  Future<Map<String, dynamic>> postMapa(String caminho, {Object? corpo}) => _chamar(
      () => dio.post(caminho, data: corpo), (d) => d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{});

  Future<void> post(String caminho, {Object? corpo}) => _chamar(() => dio.post(caminho, data: corpo), (_) {});

  Future<void> put(String caminho, {Object? corpo}) => _chamar(() => dio.put(caminho, data: corpo), (_) {});

  /// Cookies atuais da API, no formato do cabeçalho `Cookie` (usado pelo SignalR).
  Future<String> cabecalhoCookie() async {
    final cookies = await jar.loadForRequest(Uri.parse(apiUrl));
    return cookies.map((c) => '${c.name}=${c.value}').join('; ');
  }

  Future<void> limparSessao() => jar.deleteAll();
}
