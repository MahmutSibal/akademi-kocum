import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/view_state.dart';
import '../models/flashcard.dart';
import '../services/flashcard_service.dart';
import '../widgets/state_views.dart';

/// Aralıklı tekrar oturumu: kart çevrilir, öğrenci ne kadar bildiğini işaretler,
/// sunucu (SM-2) bir sonraki tekrar zamanını hesaplar.
class FlashcardReviewScreen extends StatefulWidget {
  const FlashcardReviewScreen({super.key, this.courseId});
  final int? courseId;

  @override
  State<FlashcardReviewScreen> createState() => _FlashcardReviewScreenState();
}

class _FlashcardReviewScreenState extends State<FlashcardReviewScreen> {
  ViewState<List<Flashcard>> _state = const Loading();
  final List<Flashcard> _queue = [];
  int _reviewed = 0;
  int _known = 0;
  bool _flipped = false;
  bool _sending = false;
  String? _lastInfo;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = const Loading());
    try {
      final cards = await context.read<FlashcardService>().due(courseId: widget.courseId, limit: 30);
      if (!mounted) return;
      _queue
        ..clear()
        ..addAll(cards);
      setState(() => _state = Success(cards));
    } catch (e) {
      if (mounted) setState(() => _state = Failure(errorMessage(e)));
    }
  }

  Future<void> _grade(CardGrade grade) async {
    if (_queue.isEmpty || _sending) return;
    final card = _queue.first;
    setState(() => _sending = true);
    try {
      final outcome = await context.read<FlashcardService>().review(card.id, grade);
      if (!mounted) return;
      setState(() {
        _queue.removeAt(0);
        _reviewed++;
        if (grade.value >= 3) _known++;
        // Bilinemeyen kart bu oturumda tekrar sorulur
        if (grade == CardGrade.again) _queue.insert(math.min(3, _queue.length), card);
        _lastInfo = grade == CardGrade.again
            ? 'Bu kartı birazdan tekrar soracağım.'
            : 'Sonraki tekrar: ${outcome.intervalDays} gün sonra';
        _flipped = false;
        _sending = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _sending = false);
        showErrorSnack(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Bugün tekrar')),
        body: StateView<List<Flashcard>>(
          state: _state,
          onRetry: _load,
          loadingMessage: 'Kartlar yükleniyor...',
          builder: (context, cards) => cards.isEmpty
              ? const EmptyView(
                  icon: Icons.task_alt,
                  title: 'Bugün tekrar edilecek kart yok',
                  message: 'Bir notun detayından "Kart oluştur" ile yeni kartlar üretebilirsin.',
                )
              : _queue.isEmpty
                  ? _summary(context)
                  : _cardView(context, cards.length),
        ),
      );

  Widget _summary(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.celebration_outlined, size: 72, color: theme.colorScheme.primary),
          const SizedBox(height: 16),
          Text('Bugünlük bitti!', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text('$_reviewed değerlendirme, $_known tanesinde bildin.', textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text('Kartlar ne kadar iyi bildiğine göre aralıklı olarak tekrar karşına çıkacak.',
              textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
          const SizedBox(height: 24),
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Tamam')),
        ]),
      ),
    );
  }

  Widget _cardView(BuildContext context, int total) {
    final theme = Theme.of(context);
    final card = _queue.first;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Text('Kalan: ${_queue.length}', style: theme.textTheme.labelLarge),
            const Spacer(),
            if (card.noteTitle != null)
              Flexible(child: Text(card.noteTitle!, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall)),
          ]),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: total == 0 ? 0 : (_reviewed / (_reviewed + _queue.length)).clamp(0, 1).toDouble()),
          const SizedBox(height: 16),
          Expanded(
            child: GestureDetector(
              onTap: () => setState(() => _flipped = !_flipped),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                transitionBuilder: (child, anim) => ScaleTransition(scale: Tween(begin: 0.95, end: 1.0).animate(anim), child: FadeTransition(opacity: anim, child: child)),
                child: Card(
                  key: ValueKey('${card.id}-$_flipped'),
                  color: _flipped ? theme.colorScheme.secondaryContainer : theme.colorScheme.primaryContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      if (card.topic != null)
                        Chip(label: Text(card.topic!), visualDensity: VisualDensity.compact),
                      const SizedBox(height: 12),
                      Text(_flipped ? 'CEVAP' : 'SORU', style: theme.textTheme.labelMedium),
                      const SizedBox(height: 12),
                      Text(
                        _flipped ? card.back : card.front,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.titleLarge,
                      ),
                      const SizedBox(height: 24),
                      if (!_flipped) Text('Cevabı görmek için dokun', style: theme.textTheme.bodySmall),
                    ]),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_lastInfo != null) Text(_lastInfo!, textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
          const SizedBox(height: 8),
          if (!_flipped)
            FilledButton.icon(
              onPressed: () => setState(() => _flipped = true),
              icon: const Icon(Icons.flip),
              label: const Text('Cevabı göster'),
            )
          else
            Row(children: [
              for (final g in CardGrade.values)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: FilledButton.tonal(
                      onPressed: _sending ? null : () => _grade(g),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(56),
                        padding: EdgeInsets.zero,
                        backgroundColor: switch (g) {
                          CardGrade.again => theme.colorScheme.errorContainer,
                          CardGrade.hard => Colors.orange.withValues(alpha: 0.25),
                          CardGrade.good => Colors.green.withValues(alpha: 0.25),
                          CardGrade.easy => Colors.blue.withValues(alpha: 0.25),
                        },
                      ),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(g.label, style: const TextStyle(fontWeight: FontWeight.bold)),
                        Text(g.hint, style: theme.textTheme.labelSmall),
                      ]),
                    ),
                  ),
                ),
            ]),
        ]),
      ),
    );
  }
}
