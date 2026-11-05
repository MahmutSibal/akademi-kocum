import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// API taban adresi. Öncelik sırası:
/// 1. Ayarlar ekranından kaydedilen adres
/// 2. `--dart-define=API_BASE_URL=http://192.168.1.25:5678`
/// 3. Platform varsayılanı (Android emülatör: 10.0.2.2, diğerleri: localhost)
class AppConfig extends ChangeNotifier {
  static const _prefsKey = 'api_base_url';
  static const _fromDefine = String.fromEnvironment('API_BASE_URL');

  String _baseUrl = defaultBaseUrl;
  String get baseUrl => _baseUrl;

  static String get defaultBaseUrl {
    if (_fromDefine.isNotEmpty) return _fromDefine;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:5678';
    }
    return 'http://localhost:5678';
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString(_prefsKey) ?? defaultBaseUrl;
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    final normalized = url.trim().replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    if (normalized.isEmpty || normalized == defaultBaseUrl) {
      await prefs.remove(_prefsKey);
      _baseUrl = defaultBaseUrl;
    } else {
      await prefs.setString(_prefsKey, normalized);
      _baseUrl = normalized;
    }
    notifyListeners();
  }
}
