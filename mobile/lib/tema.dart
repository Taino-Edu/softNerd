import 'package:flutter/material.dart';

/// Identidade visual do Santuário Nerd (mesmas cores do site): azul da loja, amarelo de destaque e
/// o azul-claro do fundo. Fonte Nunito (a do site), em assets/fonts.
class Marca {
  static const azul = Color(0xFF1E4FD6);
  static const azulEscuro = Color(0xFF123A9E);
  static const azulProfundo = Color(0xFF0C2A75);
  static const ciano = Color(0xFF3EC2F2);
  static const amarelo = Color(0xFFFFE45E);
  static const amareloForte = Color(0xFFF5C518);
  static const fundo = Color(0xFFEEF4FF);
  static const borda = Color(0xFFDCE6FA);
  static const texto = Color(0xFF0C3D5A);
  static const textoSuave = Color(0xFF5B7289);
  static const verde = Color(0xFF16A34A);
  static const vermelho = Color(0xFFDC2626);
  static const laranja = Color(0xFFF59E0B);

  static const degrade = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [azul, azulEscuro],
  );
  static const degradeAmarelo = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [amarelo, amareloForte],
  );

  static List<BoxShadow> sombra([double opacidade = .10]) =>
      [BoxShadow(color: azul.withValues(alpha: opacidade), blurRadius: 18, offset: const Offset(0, 6))];
}

ThemeData temaDoApp() {
  final esquema = ColorScheme.fromSeed(seedColor: Marca.azul, primary: Marca.azul, secondary: Marca.amarelo, surface: Colors.white);
  final base = ThemeData(useMaterial3: true, colorScheme: esquema, fontFamily: 'Nunito');
  return base.copyWith(
    scaffoldBackgroundColor: Marca.fundo,
    textTheme: base.textTheme.apply(bodyColor: Marca.texto, displayColor: Marca.texto),
    appBarTheme: const AppBarTheme(backgroundColor: Marca.azul, foregroundColor: Colors.white, centerTitle: false),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Marca.borda)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Marca.borda)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Marca.azul, width: 2)),
      labelStyle: const TextStyle(color: Marca.textoSuave, fontWeight: FontWeight.w600),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: Marca.amarelo,
      height: 70,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w900 : FontWeight.w600,
            fontSize: 12,
            color: Marca.texto,
          )),
      iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(color: s.contains(WidgetState.selected) ? Marca.azulProfundo : Marca.textoSuave)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Marca.azulProfundo,
      contentTextStyle: const TextStyle(fontFamily: 'Nunito', fontWeight: FontWeight.w700, color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      titleTextStyle: const TextStyle(fontFamily: 'Nunito', fontWeight: FontWeight.w900, fontSize: 20, color: Marca.texto),
    ),
    chipTheme: base.chipTheme.copyWith(side: BorderSide.none, shape: const StadiumBorder()),
  );
}
