import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/quiz.dart';
import '../services/quiz_service.dart';
import '../state/session.dart';
import '../widgets/state_views.dart';
import 'quiz_result_screen.dart';

/// Test çözme. Doğru cevaplar istemcide yoktur; test bitene kadar gösterilmez.
class QuizScreen extends StatefulWidget {
  const QuizScreen({super.key, required this.quiz});
  final Quiz quiz;

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  final _pages = PageController();
  final Map<int, String> _selected = {}; // questionIndex -> 'A'..'D'
  int _page = 0;
  bool _submitting = false;

  List<QuizQuestion> get _questions => widget.quiz.questions;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _go(int page) => _pages.animateToPage(page, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);

  Future<bool> _confirmLeave() async =>
      _selected.isEmpty || await confirmDialog(context, 'Testten çık', 'Cevapların kaydedilmeyecek. Çıkmak istiyor musun?', ok: 'Çık');

  Future<void> _submit() async {
    final empty = _questions.length - _selected.length;
    if (empty > 0 &&
        !await confirmDialog(context, 'Testi bitir', '$empty soru boş. Yine de testi bitirmek istiyor musun?', ok: 'Bitir')) {
      return;
    }
    if (!mounted) return;
    setState(() => _submitting = true);
    try {
      final result = await context.read<QuizService>().evaluate(
            userId: context.read<Session>().userId,
            quizId: widget.quiz.quizId,
            answers: [for (final q in _questions) QuizAnswer(questionIndex: q.questionIndex, selected: _selected[q.questionIndex])],
          );
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => QuizResultScreen(result: result)));
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        showErrorSnack(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final last = _page == _questions.length - 1;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _submitting) return;
        final navigator = Navigator.of(context);
        if (await _confirmLeave()) navigator.pop();
      },
      child: BusyOverlay(
        busy: _submitting,
        message: 'Cevapların değerlendiriliyor ve sana özel çalışma önerisi hazırlanıyor...',
        child: Scaffold(
          appBar: AppBar(
            title: Text(widget.quiz.focusTopic == null ? (widget.quiz.title ?? 'Test') : 'Konu testi: ${widget.quiz.focusTopic}'),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(4),
              child: LinearProgressIndicator(value: _selected.length / _questions.length),
            ),
          ),
          body: Column(children: [
            if (widget.quiz.difficulty != null)
              Container(
                width: double.infinity,
                color: theme.colorScheme.secondaryContainer,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  'Zorluk: ${_difficultyLabel(widget.quiz.difficulty!)}'
                  '${widget.quiz.difficultyReason == null ? '' : ' · ${widget.quiz.difficultyReason}'}',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSecondaryContainer),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (var i = 0; i < _questions.length; i++)
                    ChoiceChip(
                      label: Text('${i + 1}'),
                      selected: _page == i,
                      avatar: _selected.containsKey(_questions[i].questionIndex) ? const Icon(Icons.check, size: 16) : null,
                      onSelected: (_) => _go(i),
                    ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pages,
                itemCount: _questions.length,
                onPageChanged: (p) => setState(() => _page = p),
                itemBuilder: (context, i) => _QuestionPage(
                  number: i + 1,
                  total: _questions.length,
                  question: _questions[i],
                  selected: _selected[_questions[i].questionIndex],
                  onSelect: (letter) => setState(() => _selected[_questions[i].questionIndex] = letter),
                ),
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(children: [
                  OutlinedButton.icon(
                    onPressed: _page == 0 ? null : () => _go(_page - 1),
                    icon: const Icon(Icons.chevron_left),
                    label: const Text('Önceki'),
                  ),
                  const Spacer(),
                  Text('${_selected.length}/${_questions.length} cevaplandı', style: theme.textTheme.bodySmall),
                  const Spacer(),
                  last
                      ? FilledButton.icon(onPressed: _submit, icon: const Icon(Icons.flag), label: const Text('Bitir'))
                      : FilledButton.icon(
                          onPressed: () => _go(_page + 1),
                          icon: const Icon(Icons.chevron_right),
                          label: const Text('Sonraki'),
                        ),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

String _difficultyLabel(String d) => switch (d) {
      'kolay' => '🟢 Kolay',
      'orta' => '🟡 Orta',
      'zor' => '🔴 Zor',
      _ => d,
    };

class _QuestionPage extends StatelessWidget {
  const _QuestionPage({
    required this.number,
    required this.total,
    required this.question,
    required this.selected,
    required this.onSelect,
  });

  final int number;
  final int total;
  final QuizQuestion question;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Soru $number / $total', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
      if (question.topic != null) Text(question.topic!, style: theme.textTheme.bodySmall),
      const SizedBox(height: 8),
      Text(question.question, style: theme.textTheme.titleLarge),
      const SizedBox(height: 16),
      for (var i = 0; i < question.options.length; i++)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _OptionTile(
            letter: answerLetters[i],
            text: question.options[i],
            selected: selected == answerLetters[i],
            onTap: () => onSelect(answerLetters[i]),
          ),
        ),
    ]);
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.letter, required this.text, required this.selected, required this.onTap});
  final String letter;
  final String text;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? scheme.primaryContainer : scheme.surfaceContainerLow,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: selected ? scheme.primary : scheme.outlineVariant, width: selected ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: selected ? scheme.primary : scheme.surfaceContainerHighest,
              foregroundColor: selected ? scheme.onPrimary : scheme.onSurface,
              child: Text(letter),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyLarge)),
          ]),
        ),
      ),
    );
  }
}
