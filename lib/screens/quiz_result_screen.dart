import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/view_state.dart';
import '../models/quiz.dart';
import '../models/quiz_result.dart';
import '../services/quiz_service.dart';
import '../state/session.dart';
import '../widgets/state_views.dart';
import 'practice_screen.dart';
import 'quiz_screen.dart';

/// Test sonucu: puan, kişiselleştirilmiş öneri, soru soru açıklamalar.
class QuizResultScreen extends StatefulWidget {
  const QuizResultScreen({super.key, required QuizResult this.result}) : resultId = null;

  /// Geçmiş bir sonucu sunucudan yükler.
  const QuizResultScreen.load({super.key, required int this.resultId}) : result = null;

  final QuizResult? result;
  final int? resultId;

  @override
  State<QuizResultScreen> createState() => _QuizResultScreenState();
}

class _QuizResultScreenState extends State<QuizResultScreen> {
  late ViewState<QuizResult> _state = widget.result != null ? Success(widget.result!) : const Loading();
  String? _generatingTopic;

  @override
  void initState() {
    super.initState();
    if (widget.result == null) _load();
  }

  Future<void> _load() async {
    setState(() => _state = const Loading());
    try {
      final r = await context.read<QuizService>().result(widget.resultId!);
      if (mounted) setState(() => _state = Success(r));
    } catch (e) {
      if (mounted) setState(() => _state = Failure(errorMessage(e)));
    }
  }

  /// Aynı nottan yalnızca bu konuya odaklı yeni bir test üretir.
  Future<void> _topicQuiz(QuizResult result, String topic) async {
    final noteId = result.noteId;
    if (noteId == null) return;
    setState(() => _generatingTopic = topic);
    try {
      final quiz = await context.read<QuizService>().generate(
            userId: context.read<Session>().userId,
            noteId: noteId,
            focusTopic: topic,
          );
      if (!mounted) return;
      setState(() => _generatingTopic = null);
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => QuizScreen(quiz: quiz)));
    } catch (e) {
      if (mounted) {
        setState(() => _generatingTopic = null);
        showErrorSnack(context, e);
      }
    }
  }

  void _practice(QuizResult result) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => PracticeScreen(questions: result.wrongResults)));

  @override
  Widget build(BuildContext context) => BusyOverlay(
        busy: _generatingTopic != null,
        message: '"$_generatingTopic" konusuna odaklı yeni test hazırlanıyor...',
        child: Scaffold(
          appBar: AppBar(title: const Text('Test sonucu')),
          body: StateView<QuizResult>(
            state: _state,
            onRetry: _load,
            builder: (context, r) => _ResultBody(
              result: r,
              onPractice: r.wrongCount > 0 ? () => _practice(r) : null,
              onTopicQuiz: r.noteId == null ? null : (topic) => _topicQuiz(r, topic),
            ),
          ),
        ),
      );
}

class _ResultBody extends StatelessWidget {
  const _ResultBody({required this.result, this.onPractice, this.onTopicQuiz});
  final QuizResult result;
  final VoidCallback? onPractice;
  final ValueChanged<String>? onTopicQuiz;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = scoreColor(context, result.percentage);
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(children: [
            SizedBox.square(
              dimension: 96,
              child: Stack(fit: StackFit.expand, children: [
                CircularProgressIndicator(
                  value: result.total == 0 ? 0 : result.score / result.total,
                  strokeWidth: 10,
                  color: color,
                  backgroundColor: color.withValues(alpha: 0.15),
                ),
                Center(child: Text('%${result.percentage}', style: theme.textTheme.headlineSmall?.copyWith(color: color))),
              ]),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${result.score} / ${result.total} doğru', style: theme.textTheme.titleLarge),
                if (result.wrongCount > 0) Text('${result.wrongCount} yanlış veya boş'),
                if (result.noteTitle != null) Text(result.noteTitle!, style: theme.textTheme.bodySmall),
              ]),
            ),
          ]),
        ),
      ),
      _RecommendationCard(result: result),
      if (onPractice != null || onTopicQuiz != null) _NextSteps(result: result, onPractice: onPractice, onTopicQuiz: onTopicQuiz),
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
        child: Text('Soru soru değerlendirme', style: theme.textTheme.titleMedium),
      ),
      for (final q in result.results) _QuestionReview(q: q),
      const SizedBox(height: 16),
      FilledButton.tonalIcon(
        onPressed: () => Navigator.pop(context),
        icon: const Icon(Icons.arrow_back),
        label: const Text('Nota dön'),
      ),
    ]);
  }
}

/// Sonraki adımlar: yanlışları tekrar çöz + eksik konudan yeni test.
class _NextSteps extends StatelessWidget {
  const _NextSteps({required this.result, this.onPractice, this.onTopicQuiz});
  final QuizResult result;
  final VoidCallback? onPractice;
  final ValueChanged<String>? onTopicQuiz;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final topics = {for (final r in result.wrongResults) if (r.topic != null && r.topic!.isNotEmpty) r.topic!}.toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Sonraki adım', style: theme.textTheme.titleMedium),
          if (onPractice != null) ...[
            const SizedBox(height: 12),
            FilledButton.tonalIcon(
              onPressed: onPractice,
              icon: const Icon(Icons.replay),
              label: Text('Yanlışları tekrar çöz (${result.wrongCount})'),
            ),
          ],
          if (onTopicQuiz != null && topics.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Eksik konudan yeni test oluştur:', style: theme.textTheme.bodyMedium),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in topics)
                ActionChip(
                  avatar: const Icon(Icons.quiz_outlined, size: 18),
                  label: Text(t),
                  onPressed: () => onTopicQuiz!(t),
                ),
            ]),
          ],
        ]),
      ),
    );
  }
}

class _RecommendationCard extends StatelessWidget {
  const _RecommendationCard({required this.result});
  final QuizResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final d = result.detail;
    return Card(
      color: theme.colorScheme.tertiaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.lightbulb_outline, color: theme.colorScheme.onTertiaryContainer),
            const SizedBox(width: 8),
            Text('Sana özel çalışma önerisi', style: theme.textTheme.titleMedium),
          ]),
          const SizedBox(height: 12),
          // Yapılandırılmış öneri yoksa (geçmiş sonuçlar) kayıtlı metin gösterilir
          if (d == null)
            SelectableText(result.recommendation)
          else ...[
            Text(d.summary, style: theme.textTheme.bodyLarge),
            for (final f in d.focusTopics) ...[
              const SizedBox(height: 10),
              Text('📌 ${f.topic}', style: theme.textTheme.titleSmall),
              if (f.reason != null && f.reason!.isNotEmpty) Text(f.reason!),
              if (f.action != null && f.action!.isNotEmpty) Text('→ ${f.action!}', style: const TextStyle(fontStyle: FontStyle.italic)),
            ],
            if (d.studyPlan.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('Çalışma planı', style: theme.textTheme.titleSmall),
              for (var i = 0; i < d.studyPlan.length; i++) Text('${i + 1}. ${d.studyPlan[i]}'),
            ],
            if (d.motivation != null && d.motivation!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(d.motivation!, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            ],
          ],
        ]),
      ),
    );
  }
}

class _QuestionReview extends StatelessWidget {
  const _QuestionReview({required this.q});
  final QuestionResult q;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ok = q.isCorrect;
    final good = Colors.green.shade600;
    final bad = theme.colorScheme.error;
    return Card(
      child: ExpansionTile(
        initiallyExpanded: !ok,
        leading: Icon(ok ? Icons.check_circle : Icons.cancel, color: ok ? good : bad),
        title: Text('${q.questionIndex + 1}. ${q.question}', maxLines: 2, overflow: TextOverflow.ellipsis),
        subtitle: q.topic == null ? null : Text(q.topic!),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(q.question, style: theme.textTheme.bodyLarge),
          const SizedBox(height: 8),
          for (var i = 0; i < q.options.length; i++)
            Builder(builder: (context) {
              final letter = answerLetters[i];
              final isCorrect = letter == q.correctAnswer;
              final isPicked = letter == q.selected;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(
                    isCorrect ? Icons.check : (isPicked ? Icons.close : Icons.circle_outlined),
                    size: 18,
                    color: isCorrect ? good : (isPicked ? bad : theme.colorScheme.outline),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '$letter) ${q.options[i]}${isPicked ? '  (senin cevabın)' : ''}',
                      style: TextStyle(
                        color: isCorrect ? good : (isPicked ? bad : null),
                        fontWeight: isCorrect || isPicked ? FontWeight.w600 : null,
                      ),
                    ),
                  ),
                ]),
              );
            }),
          if (q.selected == null) Text('Boş bırakıldı', style: TextStyle(color: bad)),
          if (q.explanation != null) ...[
            const SizedBox(height: 8),
            Text('Açıklama: ${q.explanation!}', style: theme.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}
