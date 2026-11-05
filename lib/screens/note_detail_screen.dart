import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/view_state.dart';
import '../models/note.dart';
import '../services/flashcard_service.dart';
import '../services/note_service.dart';
import '../services/quiz_service.dart';
import '../state/session.dart';
import '../widgets/state_views.dart';
import 'flashcard_review_screen.dart';
import 'quiz_screen.dart';

/// Not özeti + bu nottan test oluşturma.
class NoteDetailScreen extends StatefulWidget {
  const NoteDetailScreen({super.key, required this.noteId});
  final int noteId;

  @override
  State<NoteDetailScreen> createState() => _NoteDetailScreenState();
}

class _NoteDetailScreenState extends State<NoteDetailScreen> {
  ViewState<Note> _state = const Loading();
  int _questionCount = 5;
  String _difficulty = 'otomatik';
  bool _generating = false;
  bool _makingCards = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final note = await context.read<NoteService>().get(widget.noteId);
      if (mounted) setState(() => _state = Success(note));
    } catch (e) {
      if (mounted) setState(() => _state = Failure(errorMessage(e)));
    }
  }

  Future<void> _generateQuiz() async {
    setState(() => _generating = true);
    try {
      final quiz = await context.read<QuizService>().generate(
            userId: context.read<Session>().userId,
            noteId: widget.noteId,
            questionCount: _questionCount,
            difficulty: _difficulty,
          );
      if (!mounted) return;
      setState(() => _generating = false);
      await Navigator.push(context, MaterialPageRoute(builder: (_) => QuizScreen(quiz: quiz)));
      _load();
    } catch (e) {
      if (mounted) {
        setState(() => _generating = false);
        showErrorSnack(context, e);
      }
    }
  }

  Future<void> _makeCards() async {
    setState(() => _makingCards = true);
    try {
      final batch = await context.read<FlashcardService>().generate(noteId: widget.noteId);
      if (!mounted) return;
      setState(() => _makingCards = false);
      showInfoSnack(context, '${batch.created} kart oluşturuldu. Tekrar sırası başlıyor!');
      await Navigator.push(context, MaterialPageRoute(builder: (_) => const FlashcardReviewScreen()));
    } catch (e) {
      if (mounted) {
        setState(() => _makingCards = false);
        showErrorSnack(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return BusyOverlay(
      busy: _generating || _makingCards,
      message: _makingCards
          ? 'Nottan ezber kartları hazırlanıyor...'
          : '$_questionCount soruluk test hazırlanıyor...\nModel JSON üretip doğrulanıyor, bu 1-2 dakika sürebilir.',
      child: Scaffold(
        appBar: AppBar(title: const Text('Not özeti')),
        body: StateView<Note>(
          state: _state,
          onRetry: _load,
          builder: (context, note) => _buildNote(context, note),
        ),
      ),
    );
  }

  Widget _buildNote(BuildContext context, Note note) {
    final theme = Theme.of(context);
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(note.title, style: theme.textTheme.headlineSmall),
      const SizedBox(height: 4),
      Text('${note.courseName ?? ''} · ${formatDate(note.createdAt)}', style: theme.textTheme.bodySmall),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.auto_awesome, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Text('Yapay zekâ özeti', style: theme.textTheme.titleMedium),
            ]),
            const SizedBox(height: 12),
            SelectableText(note.summary ?? 'Özet yok.', style: theme.textTheme.bodyLarge),
          ]),
        ),
      ),
      Card(
        child: ExpansionTile(
          leading: const Icon(Icons.article_outlined),
          title: const Text('Orijinal not'),
          subtitle: Text('${note.content.length} karakter'),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [SelectableText(note.content)],
        ),
      ),
      const SizedBox(height: 8),
      Card(
        color: theme.colorScheme.secondaryContainer,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Bu nottan test oluştur', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(children: [
              const Text('Soru sayısı:'),
              Expanded(
                child: Slider(
                  value: _questionCount.toDouble(),
                  min: 5,
                  max: 10,
                  divisions: 5,
                  label: '$_questionCount',
                  onChanged: (v) => setState(() => _questionCount = v.round()),
                ),
              ),
              Text('$_questionCount', style: theme.textTheme.titleMedium),
            ]),
            const Text('Zorluk:'),
            const SizedBox(height: 6),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'otomatik', label: Text('Otomatik'), icon: Icon(Icons.auto_awesome, size: 16)),
                ButtonSegment(value: 'kolay', label: Text('Kolay')),
                ButtonSegment(value: 'orta', label: Text('Orta')),
                ButtonSegment(value: 'zor', label: Text('Zor')),
              ],
              selected: {_difficulty},
              onSelectionChanged: (s) => setState(() => _difficulty = s.first),
            ),
            if (_difficulty == 'otomatik')
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Zorluk, bu dersteki son testlerindeki başarına göre ayarlanır.', style: theme.textTheme.bodySmall),
              ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _generating ? null : _generateQuiz,
              icon: const Icon(Icons.quiz_outlined),
              label: const Text('Test oluştur'),
            ),
          ]),
        ),
      ),
      Card(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          leading: Icon(Icons.style_outlined, color: theme.colorScheme.primary),
          title: const Text('Ezber kartı oluştur'),
          subtitle: const Text('Nottan 10 soru-cevap kartı; aralıklı tekrarla kalıcı öğrenme'),
          trailing: const Icon(Icons.chevron_right),
          onTap: _makingCards ? null : _makeCards,
        ),
      ),
      if (note.quizzes.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text('Bu nottan ${note.quizzes.length} test oluşturuldu.', style: theme.textTheme.bodySmall),
      ],
    ]);
  }
}
