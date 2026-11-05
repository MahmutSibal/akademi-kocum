import '../core/api_client.dart';
import '../models/chat_message.dart';
import '../models/json_utils.dart';
import 'data_service.dart';

class ChatService {
  ChatService(this._api, this._data);
  final ApiClient _api;
  final DataService _data;

  /// courseId null ise dersten bağımsız genel sohbet.
  Future<List<ChatMessage>> history({int? courseId, int limit = 100}) async =>
      listOf(await _data('chat.history', {'courseId': courseId, 'limit': limit}), ChatMessage.fromJson);

  Future<AskResult> ask({required int userId, int? courseId, required String question}) async =>
      AskResult.fromJson(await _api.post('ask', {'userId': userId, 'courseId': courseId, 'question': question}));

  Future<void> clear({int? courseId}) => _data('chat.clear', {'courseId': courseId});
}
