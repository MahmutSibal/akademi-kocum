import 'package:flutter/material.dart';

import '../models/quiz.dart';
import '../models/quiz_result.dart';

/// Yanlış yapılan soruları tekrar çözme. Test zaten değerlendirildiği için
/// doğru cevaplar bilinir; her seçimden hemen sonra geri bildirim verilir.
class PracticeScreen extends StatefulWidget {
  const PracticeScreen({super.key, required this.questions});
  final List<QuestionResult> questions;

  @override
  State<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends State<PracticeScreen> {
  int _index = 0;
  int _correct = 0;
  String? _picked;

  QuestionResult get _q => widget.questions[_index];
  bool get _done => _index >= widget.questions.length;

  void _pick(String letter) {
    if (_picked != null) return;
    setState(() {
      _picked = letter;
      if (letter == _q.correctAnswer) _correct++;
    });
  }

  void _next() => setState(() {
        _index++;
        _picked = null;
      });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = widget.questions.length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Yanlışları tekrar çöz'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(value: total == 0 ? 1 : _index / total),
        ),
      ),
      body: _done ? _summary(theme, total) : _question(theme, total),
    );
  }

  Widget _summary(ThemeData theme, int total) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(_correct == total ? Icons.emoji_events : Icons.trending_up, size: 72, color: theme.colorScheme.primary),
            const SizedBox(height: 16),
            Text('$total sorudan $_correct tanesini bu sefer doğru yaptın', style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              _correct == total ? 'Harika, eksiklerini kapattın!' : 'Kalan konuları "Bu konudan test" ile tekrar çalışabilirsin.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Sonuca dön')),
          ]),
        ),
      );

  Widget _question(ThemeData theme, int total) {
    final q = _q;
    final answered = _picked != null;
    final good = Colors.green.shade600;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Soru ${_index + 1} / $total', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
      if (q.topic != null) Text(q.topic!, style: theme.textTheme.bodySmall),
      const SizedBox(height: 8),
      Text(q.question, style: theme.textTheme.titleLarge),
      const SizedBox(height: 16),
      for (var i = 0; i < q.options.length; i++)
        Builder(builder: (context) {
          final letter = answerLetters[i];
          final isCorrect = letter == q.correctAnswer;
          final isPicked = letter == _picked;
          final color = !answered
              ? null
              : isCorrect
                  ? good
                  : isPicked
                      ? theme.colorScheme.error
                      : null;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: OutlinedButton(
              onPressed: answered ? null : () => _pick(letter),
              style: OutlinedButton.styleFrom(
                alignment: Alignment.centerLeft,
                padding: const EdgeInsets.all(14),
                side: BorderSide(color: color ?? theme.colorScheme.outlineVariant, width: color == null ? 1 : 2),
                foregroundColor: color ?? theme.colorScheme.onSurface,
                disabledForegroundColor: color ?? theme.colorScheme.onSurface,
              ),
              child: Row(children: [
                Text('$letter)  ', style: const TextStyle(fontWeight: FontWeight.bold)),
                Expanded(child: Text(q.options[i])),
                if (answered && isCorrect) Icon(Icons.check_circle, color: good),
                if (answered && isPicked && !isCorrect) Icon(Icons.cancel, color: theme.colorScheme.error),
              ]),
            ),
          );
        }),
      if (answered) ...[
        const SizedBox(height: 8),
        Card(
          color: _picked == q.correctAnswer ? Colors.green.withValues(alpha: 0.12) : theme.colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_picked == q.correctAnswer ? 'Doğru! 🎉' : 'Yanlış — doğru cevap ${q.correctAnswer}', style: theme.textTheme.titleMedium),
              if (q.explanation != null) ...[const SizedBox(height: 6), Text(q.explanation!)],
            ]),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _next,
          child: Text(_index == total - 1 ? 'Bitir' : 'Sonraki soru'),
        ),
      ],
    ]);
  }
}
