import 'json_utils.dart';

/// Listelerde kullanılan kısa not bilgisi.
class NoteSummary {
  const NoteSummary({
    required this.id,
    required this.courseId,
    required this.title,
    this.courseName,
    this.summaryPreview,
    this.createdAt,
    this.quizCount = 0,
  });

  final int id;
  final int courseId;
  final String title;
  final String? courseName;
  final String? summaryPreview;
  final DateTime? createdAt;
  final int quizCount;

  factory NoteSummary.fromJson(Map<String, dynamic> json) => NoteSummary(
        id: json['id'] as int,
        courseId: json['courseId'] as int,
        title: json['title'] as String,
        courseName: json['courseName'] as String?,
        summaryPreview: json['summaryPreview'] as String?,
        createdAt: parseUtc(json['createdAt']),
        quizCount: toInt(json['quizCount']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'courseId': courseId,
        'title': title,
        'courseName': courseName,
        'summaryPreview': summaryPreview,
        'createdAt': createdAt?.toUtc().toIso8601String(),
        'quizCount': quizCount,
      };
}

/// Not detayı (içerik + özet + bu nottan üretilmiş testler).
class Note {
  const Note({
    required this.id,
    required this.courseId,
    required this.title,
    required this.content,
    this.courseName,
    this.summary,
    this.createdAt,
    this.quizzes = const [],
  });

  final int id;
  final int courseId;
  final String title;
  final String content;
  final String? courseName;
  final String? summary;
  final DateTime? createdAt;
  final List<QuizRef> quizzes;

  factory Note.fromJson(Map<String, dynamic> json) => Note(
        id: json['id'] as int,
        courseId: json['courseId'] as int,
        title: json['title'] as String,
        content: json['content'] as String? ?? '',
        courseName: json['courseName'] as String?,
        summary: json['summary'] as String?,
        createdAt: parseUtc(json['createdAt']),
        quizzes: listOf(json['quizzes'], QuizRef.fromJson),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'courseId': courseId,
        'title': title,
        'content': content,
        'courseName': courseName,
        'summary': summary,
        'createdAt': createdAt?.toUtc().toIso8601String(),
        'quizzes': quizzes.map((q) => q.toJson()).toList(),
      };
}

class QuizRef {
  const QuizRef({required this.quizId, required this.questionCount, this.createdAt});

  final int quizId;
  final int questionCount;
  final DateTime? createdAt;

  factory QuizRef.fromJson(Map<String, dynamic> json) => QuizRef(
        quizId: json['quizId'] as int,
        questionCount: toInt(json['questionCount']),
        createdAt: parseUtc(json['createdAt']),
      );

  Map<String, dynamic> toJson() =>
      {'quizId': quizId, 'questionCount': questionCount, 'createdAt': createdAt?.toUtc().toIso8601String()};
}

/// /summarize isteği.
class SummarizeRequest {
  const SummarizeRequest({required this.userId, required this.courseId, required this.title, required this.content});

  final int userId;
  final int courseId;
  final String title;
  final String content;

  Map<String, dynamic> toJson() => {'userId': userId, 'courseId': courseId, 'title': title, 'content': content};
}

/// /summarize yanıtı.
class SummarizeResult {
  const SummarizeResult({required this.noteId, required this.courseId, required this.title, required this.summary});

  final int noteId;
  final int courseId;
  final String title;
  final String summary;

  factory SummarizeResult.fromJson(Map<String, dynamic> json) => SummarizeResult(
        noteId: json['noteId'] as int,
        courseId: json['courseId'] as int,
        title: json['title'] as String,
        summary: json['summary'] as String,
      );
}

/// /extract-pdf yanıtı.
class PdfText {
  const PdfText({required this.text, this.pages, this.fileName});

  final String text;
  final int? pages;
  final String? fileName;

  factory PdfText.fromJson(Map<String, dynamic> json) => PdfText(
        text: json['text'] as String,
        pages: json['pages'] as int?,
        fileName: json['fileName'] as String?,
      );
}
