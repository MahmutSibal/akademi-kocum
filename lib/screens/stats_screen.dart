import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/view_state.dart';
import '../models/insights.dart';
import '../services/insights_service.dart';
import '../widgets/state_views.dart';

/// Ders bazlı başarı istatistikleri (SQL view'larından).
class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  ViewState<Stats> _state = const Loading();
  bool _sending = false;

  Future<void> _sendReport() async {
    if (!await confirmDialog(context, 'Haftalık rapor', 'Son 7 günün özeti kayıtlı e-posta adresine gönderilsin mi?', ok: 'Gönder')) return;
    if (!mounted) return;
    setState(() => _sending = true);
    try {
      final to = await context.read<InsightsService>().sendWeeklyReport();
      if (mounted) showInfoSnack(context, 'Rapor gönderildi${to == null ? '' : ': $to'}');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await context.read<InsightsService>().stats();
      if (mounted) setState(() => _state = Success(s));
    } catch (e) {
      if (mounted) setState(() => _state = Failure(errorMessage(e)));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('İstatistikler'), actions: [
          IconButton(
            tooltip: 'Haftalık raporu e-postama gönder',
            onPressed: _sending ? null : _sendReport,
            icon: _sending
                ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.forward_to_inbox_outlined),
          ),
        ]),
        body: RefreshIndicator(
          onRefresh: _load,
          child: StateView<Stats>(state: _state, onRetry: _load, builder: _build),
        ),
      );

  Widget _build(BuildContext context, Stats s) {
    final theme = Theme.of(context);
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Ders bazlı başarı', style: theme.textTheme.titleMedium),
      const SizedBox(height: 8),
      if (s.courses.isEmpty) const Card(child: ListTile(title: Text('Henüz ders yok.'))),
      for (final c in s.courses)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(c.courseName, style: theme.textTheme.titleSmall)),
                Text(c.successRate == null ? 'Test yok' : '%${c.successRate!.toStringAsFixed(1)}',
                    style: theme.textTheme.titleSmall?.copyWith(color: scoreColor(context, c.successRate))),
              ]),
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: (c.successRate ?? 0) / 100,
                minHeight: 8,
                borderRadius: BorderRadius.circular(4),
                color: scoreColor(context, c.successRate),
              ),
              const SizedBox(height: 6),
              Text('${c.noteCount} not · ${c.quizAttempts} test · ${c.totalCorrect}/${c.totalQuestions} doğru',
                  style: theme.textTheme.bodySmall),
            ]),
          ),
        ),
      const SizedBox(height: 16),
      Text('Geliştirilmesi gereken konular', style: theme.textTheme.titleMedium),
      const SizedBox(height: 8),
      if (s.weakTopics.isEmpty) const Card(child: ListTile(title: Text('Test çözdükçe zayıf konuların burada görünecek.'))),
      for (final t in s.weakTopics)
        Card(
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: scoreColor(context, t.successRate),
              foregroundColor: Colors.white,
              child: Text('%${(t.successRate ?? 0).round()}', style: const TextStyle(fontSize: 11)),
            ),
            title: Text(t.topic),
            subtitle: Text('${t.courseName ?? ''} · ${t.answered} soru, ${t.wrong} yanlış'),
          ),
        ),
    ]);
  }
}
