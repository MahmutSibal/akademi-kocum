import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/insights.dart';
import '../services/insights_service.dart';
import '../widgets/state_views.dart';

/// Test sonuçlarına göre 7 günlük çalışma programı (Ollama).
class StudyPlanScreen extends StatefulWidget {
  const StudyPlanScreen({super.key});

  @override
  State<StudyPlanScreen> createState() => _StudyPlanScreenState();
}

class _StudyPlanScreenState extends State<StudyPlanScreen> {
  double _hours = 2;
  bool _busy = false;
  StudyPlan? _plan;

  Future<void> _generate() async {
    setState(() => _busy = true);
    try {
      final plan = await context.read<InsightsService>().studyPlan(hoursPerDay: _hours);
      if (mounted) setState(() => _plan = plan);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final plan = _plan;
    return BusyOverlay(
      busy: _busy,
      message: 'Zayıf konularına göre haftalık program hazırlanıyor...',
      child: Scaffold(
        appBar: AppBar(title: const Text('Haftalık program')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Günde ne kadar çalışabilirsin?', style: theme.textTheme.titleMedium),
                Slider(
                  value: _hours,
                  min: 0.5,
                  max: 6,
                  divisions: 11,
                  label: '${_hours.toStringAsFixed(1)} saat',
                  onChanged: (v) => setState(() => _hours = v),
                ),
                Text('${_hours.toStringAsFixed(1)} saat / gün', textAlign: TextAlign.center),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: _busy ? null : _generate,
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(plan == null ? 'Program oluştur' : 'Yeniden oluştur'),
                ),
              ]),
            ),
          ),
          if (plan == null)
            const EmptyView(
              icon: Icons.calendar_month_outlined,
              title: 'Kişisel çalışma programın',
              message: 'Notların ve test sonuçlarındaki zayıf konulara göre 7 günlük bir plan hazırlanır.',
            )
          else ...[
            if (plan.overview.isNotEmpty)
              Card(
                color: theme.colorScheme.secondaryContainer,
                child: Padding(padding: const EdgeInsets.all(16), child: Text(plan.overview)),
              ),
            for (final d in plan.days)
              Card(
                child: ExpansionTile(
                  initiallyExpanded: d == plan.days.first,
                  title: Text('${d.day} · ${d.date}'),
                  subtitle: Text('${d.focus}  (${d.totalMinutes} dk)'),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  children: [
                    for (final t in d.tasks)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.check_box_outline_blank),
                        title: Text(t.title),
                        subtitle: t.course.isEmpty ? null : Text(t.course),
                        trailing: Text('${t.minutes} dk'),
                      ),
                  ],
                ),
              ),
            if (plan.tips.isNotEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('İpuçları', style: theme.textTheme.titleSmall),
                    for (final tip in plan.tips) Text('• $tip'),
                  ]),
                ),
              ),
          ],
        ]),
      ),
    );
  }
}
