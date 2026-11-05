import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

/// API çağrısı başarısız olduğunda kullanıcıya gösterilebilir mesaj taşır.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.details = const []});

  final String message;
  final int? statusCode;
  final List<String> details;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

/// n8n webhook'larıyla konuşan ince HTTP katmanı.
/// Tüm istek/yanıtlar JSON; JWT varsa Authorization başlığına eklenir.
class ApiClient {
  ApiClient(this._config, {http.Client? client}) : _http = client ?? http.Client();

  final AppConfig _config;
  final http.Client _http;

  /// Oturum token'ı (Session tarafından ayarlanır).
  String? token;

  /// 401 alındığında çağrılır (oturumu kapatmak için).
  void Function()? onUnauthorized;

  /// LLM çağrıları uzun sürebilir: varsayılan zaman aşımı 3 dakika.
  static const defaultTimeout = Duration(minutes: 3);

  Uri _uri(String path) => Uri.parse('${_config.baseUrl}/webhook/$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    Duration timeout = defaultTimeout,
  }) {
    return _send(() => _http.post(_uri(path), headers: _headers, body: jsonEncode(body)).timeout(timeout));
  }

  /// Dosya yükleme (multipart/form-data, alan adı: file).
  Future<Map<String, dynamic>> upload(
    String path,
    List<int> bytes,
    String fileName, {
    Duration timeout = defaultTimeout,
  }) {
    return _send(() async {
      final req = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll({'Accept': 'application/json', if (token != null) 'Authorization': 'Bearer $token'})
        ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: fileName));
      final streamed = await _http.send(req).timeout(timeout);
      return http.Response.fromStream(streamed);
    });
  }

  Future<Map<String, dynamic>> _send(Future<http.Response> Function() request) async {
    final http.Response res;
    try {
      res = await request();
    } on TimeoutException {
      throw ApiException('İstek zaman aşımına uğradı. Model yanıt üretirken uzun sürmüş olabilir, tekrar deneyin.');
    } on http.ClientException {
      // Mobilde SocketException, web'de XHR hatası bu türe sarılır
      throw ApiException('Sunucuya bağlanılamadı (${_config.baseUrl}). n8n çalışıyor mu ve adres doğru mu?');
    }

    Map<String, dynamic> json = const {};
    final text = utf8.decode(res.bodyBytes);
    if (text.isNotEmpty) {
      try {
        final decoded = jsonDecode(text);
        if (decoded is Map<String, dynamic>) json = decoded;
      } on FormatException {
        // Gövde JSON değil (ör. n8n'in "webhook bulunamadı" sayfası)
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return json;

    if (res.statusCode == 401) onUnauthorized?.call();
    final message = json['error'] as String? ??
        switch (res.statusCode) {
          404 => 'Uç nokta bulunamadı. n8n workflow\'ları aktif mi?',
          500 => 'Sunucu hatası oluştu.',
          _ => 'İstek başarısız oldu (HTTP ${res.statusCode}).',
        };
    final details = (json['details'] as List?)?.map((e) => e.toString()).toList() ?? const <String>[];
    throw ApiException(message, statusCode: res.statusCode, details: details);
  }
}
