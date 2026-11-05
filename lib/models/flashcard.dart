import 'json_utils.dart';

/// Aralıklı tekrar kartı (SM-2).
class Flashcard {
  const Flashcard({
    required this.id,
    required this.front,
    required this.back,
    this.noteId,
    this.noteTitle,
    this.topic,
    this.repetitions = 0,
    this.intervalDays = 0,
    this.dueAt,
  });

  final int id;
  final String front;
  final String back;
  final int? noteId;
  final String? noteTitle;
  final String? topic;
  final int repetitions;
  final int intervalDays;
  final DateTime? dueAt;

  factory Flashcard.fromJson(Map<String, dynamic> json) => Flashcard(
        id: json['id'] as int,
        front: json['front'] as String,
        back: json['back'] as String,
        noteId: json['noteId'] as int?,
        noteTitle: json['noteTitle'] as String?,
        topic: json['topic'] as String?,
        repetitions: toInt(json['repetitions']),
        intervalDays: toInt(json['intervalDays']),
        dueAt: parseUtc(json['dueAt']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'front': front,
        'back': back,
        'noteId': noteId,
        'noteTitle': noteTitle,
        'topic': topic,
        'repetitions': repetitions,
        'intervalDays': intervalDays,
        'dueAt': dueAt?.toUtc().toIso8601String(),
      };
}

/// Kart değerlendirme notu (SM-2 ölçeği 0-5).
enum CardGrade {
  again(1, 'Tekrar', 'Bilemedim'),
  hard(3, 'Zor', 'Zorlandım'),
  good(4, 'İyi', 'Bildim'),
  easy(5, 'Kolay', 'Çok kolaydı');

  const CardGrade(this.value, this.label, this.hint);
  final int value;
  final String label;
  final String hint;
}

/// /flashcards (üretim) yanıtı.
class FlashcardBatch {
  const FlashcardBatch({required this.created, required this.dueCards, this.noteTitle});

  final int created;
  final int dueCards;
  final String? noteTitle;

  factory FlashcardBatch.fromJson(Map<String, dynamic> json) => FlashcardBatch(
        created: toInt(json['created']),
        dueCards: toInt(json['dueCards']),
        noteTitle: json['noteTitle'] as String?,
      );
}

/// cards.review yanıtı: bir sonraki tekrar zamanı.
class ReviewOutcome {
  const ReviewOutcome({required this.intervalDays, this.dueAt});

  final int intervalDays;
  final DateTime? dueAt;

  factory ReviewOutcome.fromJson(Map<String, dynamic> json) =>
      ReviewOutcome(intervalDays: toInt(json['intervalDays']), dueAt: parseUtc(json['dueAt']));
}
