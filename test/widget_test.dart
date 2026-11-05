import 'package:akademi_kocum/models/quiz.dart';
import 'package:akademi_kocum/models/quiz_result.dart';
import 'package:akademi_kocum/models/json_utils.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Quiz.fromJson cevapsız soruları okur', () {
    final quiz = Quiz.fromJson({
      'quizId': 7,
      'noteId': 3,
      'questions': [
        {'questionIndex': 0, 'question': 'Flutter hangi dili kullanır?', 'options': ['Java', 'Dart', 'Python', 'C#'], 'topic': 'Flutter temelleri'},
      ],
    });
    expect(quiz.questions.single.options, hasLength(4));
    expect(quiz.questions.single.toJson().containsKey('correctAnswer'), isFalse);
  });

  test('QuizResult yüzdeyi ve SQL BIT değerini doğru çevirir', () {
    final r = QuizResult.fromJson({
      'resultId': 1,
      'quizId': 7,
      'score': 3,
      'total': 5,
      'recommendation': 'Tekrar et',
      'results': [
        {'questionIndex': 0, 'question': 'S', 'options': ['a', 'b', 'c', 'd'], 'selected': 'A', 'correctAnswer': 'B', 'isCorrect': 0},
      ],
    });
    expect(r.percentage, 60);
    expect(r.wrongCount, 2);
    expect(r.results.single.isCorrect, isFalse);
  });

  test('parseUtc saat dilimsiz SQL tarihini UTC kabul eder', () {
    expect(parseUtc('2026-11-04T10:00:00.000')!.toUtc().hour, 10);
    expect(parseUtc(null), isNull);
  });

  test('QuizAnswer boş cevabı null gönderir', () {
    expect(const QuizAnswer(questionIndex: 2).toJson(), {'questionIndex': 2, 'selected': null});
  });
}
