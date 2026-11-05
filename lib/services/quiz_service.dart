import '../core/api_client.dart';
import '../models/quiz.dart';
import '../models/quiz_result.dart';
import 'data_service.dart';

class QuizService {
  QuizService(this._api, this._data);
  final ApiClient _api;
  final DataService _data;

  /// focusTopic verilirse tüm sorular o konudan üretilir.
  /// difficulty: 'otomatik' (son testlerdeki başarıya göre), 'kolay', 'orta', 'zor'.
  Future<Quiz> generate({
    required int userId,
    required int noteId,
    int questionCount = 5,
    String? focusTopic,
    String difficulty = 'otomatik',
  }) async =>
      Quiz.fromJson(await _api.post('generate-quiz', {
        'userId': userId,
        'noteId': noteId,
        'questionCount': questionCount,
        'difficulty': difficulty,
        'focusTopic': ?focusTopic,
      }));

  Future<QuizResult> evaluate({required int userId, required int quizId, required List<QuizAnswer> answers}) async =>
      QuizResult.fromJson(await _api.post('evaluate', {
        'userId': userId,
        'quizId': quizId,
        'answers': answers.map((a) => a.toJson()).toList(),
      }));

  Future<QuizResult> result(int resultId) async =>
      QuizResult.fromJson(await _data('results.get', {'resultId': resultId}) as Map<String, dynamic>);
}
