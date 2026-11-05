import 'json_utils.dart';

class Course {
  const Course({
    required this.id,
    required this.name,
    this.description,
    this.createdAt,
    this.noteCount = 0,
    this.quizAttempts = 0,
    this.successRate,
  });

  final int id;
  final String name;
  final String? description;
  final DateTime? createdAt;
  final int noteCount;
  final int quizAttempts;

  /// 0-100 arası, henüz test çözülmediyse null.
  final double? successRate;

  factory Course.fromJson(Map<String, dynamic> json) => Course(
        id: json['id'] as int,
        name: json['name'] as String,
        description: json['description'] as String?,
        createdAt: parseUtc(json['createdAt']),
        noteCount: toInt(json['noteCount']),
        quizAttempts: toInt(json['quizAttempts']),
        successRate: toDouble(json['successRate']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'createdAt': createdAt?.toUtc().toIso8601String(),
        'noteCount': noteCount,
        'quizAttempts': quizAttempts,
        'successRate': successRate,
      };
}
