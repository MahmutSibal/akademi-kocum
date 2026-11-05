import 'json_utils.dart';

class ChatMessage {
  const ChatMessage({required this.role, required this.content, this.id, this.createdAt, this.sources = const []});

  final int? id;

  /// 'user' | 'assistant'
  final String role;
  final String content;
  final DateTime? createdAt;

  /// Asistan yanıtının dayandığı not parçaları (RAG).
  final List<ChatSource> sources;

  bool get isUser => role == 'user';

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as int?,
        role: json['role'] as String,
        content: json['content'] as String,
        createdAt: parseUtc(json['createdAt']),
        sources: listOf(json['sources'], ChatSource.fromJson),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'role': role,
        'content': content,
        'createdAt': createdAt?.toUtc().toIso8601String(),
        'sources': sources.map((s) => s.toJson()).toList(),
      };
}

/// Yanıttaki [n] atfının işaret ettiği not parçası.
class ChatSource {
  const ChatSource({required this.index, required this.title, this.noteId, this.excerpt, this.cited = true});

  final int index;
  final String title;
  final int? noteId;
  final String? excerpt;

  /// true: yanıtta [n] ile atıf yapıldı; false: bağlam olarak verildi ama atıf yapılmadı.
  final bool cited;

  factory ChatSource.fromJson(Map<String, dynamic> json) => ChatSource(
        index: toInt(json['index'], 1),
        title: json['title'] as String? ?? 'Not',
        noteId: json['noteId'] as int?,
        excerpt: json['excerpt'] as String?,
        cited: json['cited'] != false,
      );

  Map<String, dynamic> toJson() => {'index': index, 'title': title, 'noteId': noteId, 'excerpt': excerpt, 'cited': cited};
}

/// /ask yanıtı.
class AskResult {
  const AskResult({required this.answer, this.messageId, this.usedNotes = 0, this.sources = const []});

  final String answer;
  final int? messageId;

  /// Yanıt için bağlam olarak kullanılan not parçası sayısı (RAG).
  final int usedNotes;
  final List<ChatSource> sources;

  factory AskResult.fromJson(Map<String, dynamic> json) => AskResult(
        answer: json['answer'] as String,
        messageId: json['messageId'] as int?,
        usedNotes: toInt(json['usedNotes']),
        sources: listOf(json['sources'], ChatSource.fromJson),
      );
}
