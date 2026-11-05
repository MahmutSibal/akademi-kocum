import 'json_utils.dart';

/// /evaluate yanıtı ve geçmiş sonuç detayı (data: results.get).
class QuizResult {
  const QuizResult({
    required this.resultId,
    required this.quizId,
    required this.score,
    required this.total,
    required this.results,
    required this.recommendation,
    this.noteId,
    this.detail,
    this.noteTitle,
    this.courseName,
    this.createdAt,
  });

  final int resultId;
  final int quizId;

  /// Testin üretildiği not (aynı nottan konuya odaklı yeni test için).
  final int? noteId;
  final int score;
  final int total;
  final List<QuestionResult> results;
  final String recommendation;
  final Recommendation? detail;
  final String? noteTitle;
  final String? courseName;
  final DateTime? createdAt;

  int get percentage => total == 0 ? 0 : (100 * score / total).round();
  int get wrongCount => total - score;
  List<QuestionResult> get wrongResults => results.where((r) => !r.isCorrect).toList();

  factory QuizResult.fromJson(Map<String, dynamic> json) => QuizResult(
        resultId: json['resultId'] as int,
        quizId: json['quizId'] as int,
        noteId: json['noteId'] as int?,
        score: toInt(json['score']),
        total: toInt(json['total']),
        results: listOf(json['results'], QuestionResult.fromJson),
        recommendation: json['recommendation'] as String? ?? '',
        detail: json['recommendationDetail'] is Map<String, dynamic>
            ? Recommendation.fromJson(json['recommendationDetail'] as Map<String, dynamic>)
            : null,
        noteTitle: json['noteTitle'] as String?,
        courseName: json['courseName'] as String?,
        createdAt: parseUtc(json['createdAt']),
      );

  Map<String, dynamic> toJson() => {
        'resultId': resultId,
        'quizId': quizId,
        'noteId': noteId,
        'score': score,
        'total': total,
        'results': results.map((r) => r.toJson()).toList(),
        'recommendation': recommendation,
        'recommendationDetail': detail?.toJson(),
        'noteTitle': noteTitle,
        'courseName': courseName,
        'createdAt': createdAt?.toUtc().toIso8601String(),
      };
}

class QuestionResult {
  const QuestionResult({
    required this.questionIndex,
    required this.question,
    required this.options,
    required this.correctAnswer,
    required this.isCorrect,
    this.selected,
    this.explanation,
    this.topic,
  });

  final int questionIndex;
  final String question;
  final List<String> options;
  final String? selected;
  final String correctAnswer;
  final bool isCorrect;
  final String? explanation;
  final String? topic;

  factory QuestionResult.fromJson(Map<String, dynamic> json) => QuestionResult(
        questionIndex: json['questionIndex'] as int,
        question: json['question'] as String,
        options: stringList(json['options']),
        selected: json['selected'] as String?,
        correctAnswer: json['correctAnswer'] as String,
        // SQL BIT -> true/false ya da 1/0 gelebilir
        isCorrect: json['isCorrect'] == true || json['isCorrect'] == 1,
        explanation: json['explanation'] as String?,
        topic: json['topic'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'questionIndex': questionIndex,
        'question': question,
        'options': options,
        'selected': selected,
        'correctAnswer': correctAnswer,
        'isCorrect': isCorrect,
        'explanation': explanation,
        'topic': topic,
      };
}

/// Ollama'nın ürettiği yapılandırılmış çalışma önerisi.
class Recommendation {
  const Recommendation({
    required this.summary,
    this.focusTopics = const [],
    this.studyPlan = const [],
    this.motivation,
  });

  final String summary;
  final List<FocusTopic> focusTopics;
  final List<String> studyPlan;
  final String? motivation;

  factory Recommendation.fromJson(Map<String, dynamic> json) => Recommendation(
        summary: json['summary'] as String? ?? '',
        focusTopics: listOf(json['focusTopics'], FocusTopic.fromJson),
        studyPlan: stringList(json['studyPlan']),
        motivation: json['motivation'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'summary': summary,
        'focusTopics': focusTopics.map((f) => f.toJson()).toList(),
        'studyPlan': studyPlan,
        'motivation': motivation,
      };
}

class FocusTopic {
  const FocusTopic({required this.topic, this.reason, this.action});

  final String topic;
  final String? reason;
  final String? action;

  factory FocusTopic.fromJson(Map<String, dynamic> json) => FocusTopic(
        topic: json['topic'] as String? ?? '',
        reason: json['reason'] as String?,
        action: json['action'] as String?,
      );

  Map<String, dynamic> toJson() => {'topic': topic, 'reason': reason, 'action': action};
}
