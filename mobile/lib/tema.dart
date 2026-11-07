import 'package:flutter/material.dart';

/// Cores da marca (mesmas do site): azul da loja e amarelo de destaque.
class Marca {
  static const azul = Color(0xFF1E4FD6);
  static const azulEscuro = Color(0xFF123A9E);
  static const amarelo = Color(0xFFFFE45E);
  static const fundo = Color(0xFFEEF4FF);
  static const verde = Color(0xFF16A34A);
  static const vermelho = Color(0xFFDC2626);
}

ThemeData temaDoApp() {
  final esquema = ColorScheme.fromSeed(seedColor: Marca.azul, primary: Marca.azul, secondary: Marca.amarelo);
  return ThemeData(
    useMaterial3: true,
    colorScheme: esquema,
    scaffoldBackgroundColor: Marca.fundo,
    appBarTheme: const AppBarTheme(backgroundColor: Marca.azul, foregroundColor: Colors.white, centerTitle: false),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFD9E3F7))),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFC9D6F2))),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
  );
}
