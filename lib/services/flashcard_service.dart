import '../core/api_client.dart';
import '../models/flashcard.dart';
import '../models/json_utils.dart';
import 'data_service.dart';

class FlashcardService {
  FlashcardService(this._api, this._data);
  final ApiClient _api;
  final DataService _data;

  /// Nottan Ollama ile yeni kartlar üretir.
  Future<FlashcardBatch> generate({required int noteId, int count = 10}) async =>
      FlashcardBatch.fromJson(await _api.post('flashcards', {'noteId': noteId, 'count': count}));

  /// Tekrar zamanı gelmiş kartlar.
  Future<List<Flashcard>> due({int? courseId, int limit = 20}) async =>
      listOf(await _data('cards.due', {'courseId': courseId, 'limit': limit}), Flashcard.fromJson);

  /// Kartı değerlendirir; sunucu SM-2 ile bir sonraki tekrar zamanını hesaplar.
  Future<ReviewOutcome> review(int cardId, CardGrade grade) async => ReviewOutcome.fromJson(
      await _data('cards.review', {'cardId': cardId, 'grade': grade.value}) as Map<String, dynamic>);
}
