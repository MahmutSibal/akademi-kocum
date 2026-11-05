import 'json_utils.dart';

const answerLetters = ['A', 'B', 'C', 'D'];

/// /generate-quiz yanıtı. Doğru cevaplar ve açıklamalar sunucudan GELMEZ.
class Quiz {
  const Quiz({
    required this.quizId,
    required this.noteId,
    required this.questions,
    this.courseId,
    this.title,
    this.focusTopic,
    this.difficulty,
    this.difficultyReason,
  });

  /// kolay | orta | zor (uyarlanabilir zorlukta sunucu seçer)
  final String? difficulty;
  final String? difficultyReason;

  final int quizId;
  final int noteId;
  final int? courseId;
  final String? title;

  /// Konuya odaklı testlerde odak konu (ör. yanlış yapılan konu).
  final String? focusTopic;
  final List<QuizQuestion> questions;

  factory Quiz.fromJson(Map<String, dynamic> json) => Quiz(
        quizId: json['quizId'] as int,
        noteId: json['noteId'] as int,
        courseId: json['courseId'] as int?,
        title: json['title'] as String?,
        focusTopic: json['focusTopic'] as String?,
        difficulty: json['difficulty'] as String?,
        difficultyReason: json['difficultyReason'] as String?,
        questions: listOf(json['questions'], QuizQuestion.fromJson),
      );

  Map<String, dynamic> toJson() => {
        'quizId': quizId,
        'noteId': noteId,
        'courseId': courseId,
        'title': title,
        'focusTopic': focusTopic,
        'difficulty': difficulty,
        'difficultyReason': difficultyReason,
        'questions': questions.map((q) => q.toJson()).toList(),
      };
}

class QuizQuestion {
  const QuizQuestion({required this.questionIndex, required this.question, required this.options, this.topic});

  final int questionIndex;
  final String question;
  final List<String> options;
  final String? topic;

  factory QuizQuestion.fromJson(Map<String, dynamic> json) => QuizQuestion(
        questionIndex: json['questionIndex'] as int,
        question: json['question'] as String,
        options: stringList(json['options']),
        topic: json['topic'] as String?,
      );

  Map<String, dynamic> toJson() =>
      {'questionIndex': questionIndex, 'question': question, 'options': options, 'topic': topic};
}

/// /evaluate isteğindeki tek cevap. selected: 'A'-'D' veya boş bırakıldıysa null.
class QuizAnswer {
  const QuizAnswer({required this.questionIndex, this.selected});

  final int questionIndex;
  final String? selected;

  Map<String, dynamic> toJson() => {'questionIndex': questionIndex, 'selected': selected};
}
