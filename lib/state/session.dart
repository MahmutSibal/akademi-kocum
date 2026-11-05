import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../models/user.dart';
import '../services/auth_service.dart';

/// Oturum durumu: giriş yapan kullanıcı ve JWT. Uygulama yeniden açıldığında hatırlanır.
class Session extends ChangeNotifier {
  Session(this._api, this._auth) {
    _api.onUnauthorized = logout;
  }

  static const _tokenKey = 'auth_token';
  static const _userKey = 'auth_user';

  final ApiClient _api;
  final AuthService _auth;

  User? _user;
  User? get user => _user;
  bool get isLoggedIn => _user != null;

  /// Giriş yapılmış ekranlarda kullanılır.
  int get userId => _user!.id;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);
    final userJson = prefs.getString(_userKey);
    if (token != null && userJson != null) {
      _api.token = token;
      _user = User.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      notifyListeners();
    }
  }

  Future<void> login(String email, String password) async => _save(await _auth.login(email, password));

  Future<void> register(String name, String email, String password) async =>
      _save(await _auth.register(name, email, password));

  Future<void> _save(AuthResult result) async {
    _api.token = result.token;
    _user = result.user;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, result.token);
    await prefs.setString(_userKey, jsonEncode(result.user.toJson()));
    notifyListeners();
  }

  Future<void> logout() async {
    if (_user == null && _api.token == null) return;
    _api.token = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    notifyListeners();
  }
}
