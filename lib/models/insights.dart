import 'json_utils.dart';
import 'note.dart';

/// Ana sayfa özeti (data: dashboard).
class Dashboard {
  const Dashboard({
    this.dueCards = 0,
    this.totalCards = 0,
    this.courseCount = 0,
    this.noteCount = 0,
    this.quizCount = 0,
    this.successRate,
    this.recentNotes = const [],
    this.recentResults = const [],
  });

  /// Tekrar zamanı gelmiş kart sayısı (SM-2).
  final int dueCards;
  final int totalCards;
  final int courseCount;
  final int noteCount;
  final int quizCount;
  final double? successRate;
  final List<NoteSummary> recentNotes;
  final List<ResultSummary> recentResults;

  factory Dashboard.fromJson(Map<String, dynamic> json) => Dashboard(
        dueCards: toInt(json['dueCards']),
        totalCards: toInt(json['totalCards']),
        courseCount: toInt(json['courseCount']),
        noteCount: toInt(json['noteCount']),
        quizCount: toInt(json['quizCount']),
        successRate: toDouble(json['successRate']),
        recentNotes: listOf(json['recentNotes'], NoteSummary.fromJson),
        recentResults: listOf(json['recentResults'], ResultSummary.fromJson),
      );

  Map<String, dynamic> toJson() => {
        'dueCards': dueCards,
        'totalCards': totalCards,
        'courseCount': courseCount,
        'noteCount': noteCount,
        'quizCount': quizCount,
        'successRate': successRate,
        'recentNotes': recentNotes.map((n) => n.toJson()).toList(),
        'recentResults': recentResults.map((r) => r.toJson()).toList(),
      };
}

class ResultSummary {
  const ResultSummary({
    required this.id,
    required this.quizId,
    required this.score,
    required this.total,
    this.noteTitle,
    this.courseName,
    this.createdAt,
  });

  final int id;
  final int quizId;
  final int score;
  final int total;
  final String? noteTitle;
  final String? courseName;
  final DateTime? createdAt;

  int get percentage => total == 0 ? 0 : (100 * score / total).round();

  factory ResultSummary.fromJson(Map<String, dynamic> json) => ResultSummary(
        id: json['id'] as int,
        quizId: json['quizId'] as int,
        score: toInt(json['score']),
        total: toInt(json['total']),
        noteTitle: json['noteTitle'] as String?,
        courseName: json['courseName'] as String?,
        createdAt: parseUtc(json['createdAt']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'quizId': quizId,
        'score': score,
        'total': total,
        'noteTitle': noteTitle,
        'courseName': courseName,
        'createdAt': createdAt?.toUtc().toIso8601String(),
      };
}

/// Ders bazlı başarı istatistikleri (data: stats -> SQL view'ları).
class Stats {
  const Stats({this.courses = const [], this.weakTopics = const []});

  final List<CourseStat> courses;
  final List<TopicStat> weakTopics;

  factory Stats.fromJson(Map<String, dynamic> json) => Stats(
        courses: listOf(json['courses'], CourseStat.fromJson),
        weakTopics: listOf(json['weakTopics'], TopicStat.fromJson),
      );
}

class CourseStat {
  const CourseStat({
    required this.courseId,
    required this.courseName,
    this.noteCount = 0,
    this.quizAttempts = 0,
    this.totalCorrect = 0,
    this.totalQuestions = 0,
    this.successRate,
  });

  final int courseId;
  final String courseName;
  final int noteCount;
  final int quizAttempts;
  final int totalCorrect;
  final int totalQuestions;
  final double? successRate;

  factory CourseStat.fromJson(Map<String, dynamic> json) => CourseStat(
        courseId: json['courseId'] as int,
        courseName: json['courseName'] as String,
        noteCount: toInt(json['noteCount']),
        quizAttempts: toInt(json['quizAttempts']),
        totalCorrect: toInt(json['totalCorrect']),
        totalQuestions: toInt(json['totalQuestions']),
        successRate: toDouble(json['successRate']),
      );
}

class TopicStat {
  const TopicStat({required this.topic, this.courseName, this.answered = 0, this.wrong = 0, this.successRate});

  final String topic;
  final String? courseName;
  final int answered;
  final int wrong;
  final double? successRate;

  factory TopicStat.fromJson(Map<String, dynamic> json) => TopicStat(
        topic: json['topic'] as String,
        courseName: json['courseName'] as String?,
        answered: toInt(json['answered']),
        wrong: toInt(json['wrong']),
        successRate: toDouble(json['successRate']),
      );
}

/// /study-plan yanıtı.
class StudyPlan {
  const StudyPlan({required this.overview, required this.days, this.tips = const []});

  final String overview;
  final List<PlanDay> days;
  final List<String> tips;

  factory StudyPlan.fromJson(Map<String, dynamic> json) => StudyPlan(
        overview: json['overview'] as String? ?? '',
        days: listOf(json['days'], PlanDay.fromJson),
        tips: stringList(json['tips']),
      );
}

class PlanDay {
  const PlanDay({required this.day, required this.date, this.focus = '', this.tasks = const [], this.totalMinutes = 0});

  final String day;
  final String date;
  final String focus;
  final List<PlanTask> tasks;
  final int totalMinutes;

  factory PlanDay.fromJson(Map<String, dynamic> json) => PlanDay(
        day: json['day'] as String,
        date: json['date'] as String,
        focus: json['focus'] as String? ?? '',
        tasks: listOf(json['tasks'], PlanTask.fromJson),
        totalMinutes: toInt(json['totalMinutes']),
      );
}

class PlanTask {
  const PlanTask({required this.title, this.course = '', this.minutes = 0});

  final String title;
  final String course;
  final int minutes;

  factory PlanTask.fromJson(Map<String, dynamic> json) => PlanTask(
        title: json['title'] as String,
        course: json['course'] as String? ?? '',
        minutes: toInt(json['minutes']),
      );
}
