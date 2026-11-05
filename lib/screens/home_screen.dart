import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/view_state.dart';
import '../models/course.dart';
import '../models/insights.dart';
import '../services/course_service.dart';
import '../services/insights_service.dart';
import '../state/session.dart';
import '../widgets/state_views.dart';
import 'chat_screen.dart';
import 'course_screen.dart';
import 'flashcard_review_screen.dart';
import 'note_detail_screen.dart';
import 'quiz_result_screen.dart';
import 'settings_screen.dart';
import 'stats_screen.dart';
import 'study_plan_screen.dart';

typedef _HomeData = ({Dashboard dashboard, List<Course> courses});

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  ViewState<_HomeData> _state = const Loading();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_state is! Success) setState(() => _state = const Loading());
    try {
      final results = await Future.wait([
        context.read<InsightsService>().dashboard(),
        context.read<CourseService>().list(),
      ]);
      if (mounted) setState(() => _state = Success((dashboard: results[0] as Dashboard, courses: results[1] as List<Course>)));
    } catch (e) {
      if (mounted) setState(() => _state = Failure(errorMessage(e)));
    }
  }

  Future<void> _open(Widget screen) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    _load(); // geri dönünce son işlemleri tazele
  }

  Future<void> _addCourse() async {
    final created = await showDialog<Course>(context: context, builder: (_) => const _NewCourseDialog());
    if (created != null && mounted) {
      showInfoSnack(context, '"${created.name}" dersi eklendi.');
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Akademi Koçum', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(tooltip: 'İstatistikler', icon: const Icon(Icons.insights_outlined), onPressed: () => _open(const StatsScreen())),
          IconButton(tooltip: 'Haftalık program', icon: const Icon(Icons.calendar_month_outlined), onPressed: () => _open(const StudyPlanScreen())),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'settings') _open(const SettingsScreen());
              if (v == 'logout' && await confirmDialog(context, 'Çıkış yap', 'Oturumu kapatmak istiyor musun?')) {
                await session.logout();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'settings', child: ListTile(leading: Icon(Icons.settings_outlined), title: Text('Sunucu ayarları'))),
              PopupMenuItem(value: 'logout', child: ListTile(leading: Icon(Icons.logout), title: Text('Çıkış yap'))),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addCourse,
        icon: const Icon(Icons.add),
        label: const Text('Ders ekle'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: StateView<_HomeData>(
          state: _state,
          onRetry: _load,
          loadingMessage: 'Yükleniyor...',
          builder: (context, data) => _buildContent(context, session, data),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, Session session, _HomeData data) {
    final theme = Theme.of(context);
    final d = data.dashboard;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 110), children: [
      Text('Merhaba, ${session.user!.name.split(' ').first} 👋', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 4),
      Text('Bugün öğrenmeye devam etmeye hazır mısın?', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      const SizedBox(height: 12),
      Row(children: [
        _StatTile(icon: Icons.menu_book_outlined, label: 'Ders', value: '${d.courseCount}'),
        _StatTile(icon: Icons.description_outlined, label: 'Not', value: '${d.noteCount}'),
        _StatTile(icon: Icons.quiz_outlined, label: 'Test', value: '${d.quizCount}'),
        _StatTile(
          icon: Icons.emoji_events_outlined,
          label: 'Başarı',
          value: d.successRate == null ? '—' : '%${d.successRate!.round()}',
          color: scoreColor(context, d.successRate),
        ),
      ]),
      const SizedBox(height: 12),
      Card(
        margin: const EdgeInsets.symmetric(vertical: 8),
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [theme.colorScheme.primary, theme.colorScheme.tertiary]),
          ),
          child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          leading: const CircleAvatar(
            backgroundColor: Colors.white24,
            child: Icon(Icons.smart_toy_outlined, color: Colors.white),
          ),
          title: const Text('Akademi asistanına sor', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          subtitle: const Text('Notların ve derslerin hakkında konuş', style: TextStyle(color: Colors.white70)),
          trailing: const Icon(Icons.arrow_forward_rounded, color: Colors.white),
          onTap: () => _open(const ChatScreen()),
          ),
        ),
      ),
      if (d.totalCards > 0)
        Card(
          color: d.dueCards > 0 ? theme.colorScheme.tertiaryContainer : null,
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: CircleAvatar(
              backgroundColor: theme.colorScheme.tertiary,
              foregroundColor: theme.colorScheme.onTertiary,
              child: Text('${d.dueCards}', style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
            title: Text(d.dueCards > 0 ? 'Bugün tekrar: ${d.dueCards} kart' : 'Bugünkü tekrarlar tamam ✓',
                style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('Aralıklı tekrar · toplam ${d.totalCards} kart'),
            trailing: const Icon(Icons.style_outlined),
            onTap: () => _open(const FlashcardReviewScreen()),
          ),
        ),
      _SectionTitle('Derslerim'),
      if (data.courses.isEmpty)
        const Card(child: ListTile(title: Text('Henüz ders yok. "Ders ekle" ile başla.')))
      else
        ...data.courses.map((c) => Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: theme.colorScheme.secondaryContainer,
                  child: Text(c.name.characters.first.toUpperCase(), style: TextStyle(color: theme.colorScheme.onSecondaryContainer, fontWeight: FontWeight.bold)),
                ),
                title: Text(c.name),
                subtitle: Text('${c.noteCount} not · ${c.quizAttempts} test'
                    '${c.successRate == null ? '' : ' · %${c.successRate!.round()} başarı'}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _open(CourseScreen(course: c)),
              ),
            )),
      _SectionTitle('Son özetler'),
      if (d.recentNotes.isEmpty)
        const Card(child: ListTile(title: Text('Bir derse not ekleyip özetini al.')))
      else
        ...d.recentNotes.map((n) => Card(
              child: ListTile(
                leading: const Icon(Icons.summarize_outlined),
                title: Text(n.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('${n.courseName ?? ''} · ${formatDate(n.createdAt)}\n${n.summaryPreview ?? ''}',
                    maxLines: 3, overflow: TextOverflow.ellipsis),
                isThreeLine: true,
                onTap: () => _open(NoteDetailScreen(noteId: n.id)),
              ),
            )),
      _SectionTitle('Son testler'),
      if (d.recentResults.isEmpty)
        const Card(child: ListTile(title: Text('Bir nottan test oluşturup çöz.')))
      else
        ...d.recentResults.map((r) => Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: scoreColor(context, r.percentage),
                  foregroundColor: Colors.white,
                  child: Text('%${r.percentage}', style: const TextStyle(fontSize: 12)),
                ),
                title: Text(r.noteTitle ?? 'Test', maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('${r.courseName ?? ''} · ${r.score}/${r.total} · ${formatDate(r.createdAt)}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _open(QuizResultScreen.load(resultId: r.id)),
              ),
            )),
    ]);
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.icon, required this.label, required this.value, this.color});
  final IconData icon;
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Card(
        color: theme.colorScheme.surface,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
          child: Column(children: [
            Icon(icon, color: color ?? theme.colorScheme.primary, size: 22),
            const SizedBox(height: 4),
            Text(value, style: theme.textTheme.titleLarge?.copyWith(color: color, fontWeight: FontWeight.w800)),
            Text(label, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ]),
        ),
      ),
    );
  }
}

class _NewCourseDialog extends StatefulWidget {
  const _NewCourseDialog();

  @override
  State<_NewCourseDialog> createState() => _NewCourseDialogState();
}

class _NewCourseDialogState extends State<_NewCourseDialog> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _desc = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final course = await context.read<CourseService>().create(_name.text.trim(), description: _desc.text.trim());
      if (mounted) Navigator.pop(context, course);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showErrorSnack(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Yeni ders'),
        content: Form(
          key: _formKey,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Ders adı', hintText: 'ör. Veri Yapıları'),
              validator: (v) => (v == null || v.trim().length < 2) ? 'Ders adı en az 2 karakter olmalı.' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _desc,
              decoration: const InputDecoration(labelText: 'Açıklama (isteğe bağlı)'),
              maxLines: 2,
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: _busy ? null : () => Navigator.pop(context), child: const Text('Vazgeç')),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Ekle'),
          ),
        ],
      );
}
