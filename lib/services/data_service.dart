import '../core/api_client.dart';

/// `POST /webhook/data` uç noktası: { action, params } -> { data }.
class DataService {
  DataService(this._api);
  final ApiClient _api;

  Future<Object?> call(String action, [Map<String, dynamic> params = const {}]) async {
    final res = await _api.post('data', {'action': action, 'params': params}, timeout: const Duration(seconds: 30));
    return res['data'];
  }
}
