import 'package:flutter/foundation.dart';

// Endereço da API.
// - APK de release (o que vai pro celular do jogador): a loja em produção, sem precisar de nada.
// - Debug (celular no USB): `adb reverse tcp:5000 tcp:5000`, então "localhost" no celular é o computador.
// Outro endereço (staging, IP da rede): --dart-define=API_URL=https://...
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: kReleaseMode ? 'https://santuarionerd.com.br' : 'http://localhost:5000',
);
