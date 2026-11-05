import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/view_state.dart';
import '../models/course.dart';
import '../models/note.dart';
import '../services/course_service.dart';
import '../services/note_service.dart';
import '../widgets/state_views.dart';
import 'chat_screen.dart';
import 'note_detail_screen.dart';
import 'note_editor_screen.dart';

class CourseScreen extends StatefulWidget {
  const CourseScreen({super.key, required this.course});
  final Course course;

  @override
  State<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends State<CourseScreen> {
  ViewState<List<NoteSummary>> _state = const Loading();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final notes = await context.read<NoteService>().list(courseId: widget.course.id);
      if (mounted) setState(() => _state = Success(notes));
    } catch (e) {
      if (mounted) setState(() => _state = Failure(errorMessage(e)));
    }
  }

  Future<void> _open(Widget screen) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    _load();
  }

  Future<void> _delete() async {
    final ok = await confirmDialog(context, 'Dersi sil',
        '"${widget.course.name}" dersi; tüm notları, testleri ve sohbet geçmişiyle birlikte silinecek.',
        ok: 'Sil');
    if (!ok || !mounted) return;
    try {
      await context.read<CourseService>().delete(widget.course.id);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final course = widget.course;
    return Scaffold(
      appBar: AppBar(
        title: Text(course.name),
        actions: [
          IconButton(
            tooltip: 'Bu ders hakkında sor',
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: () => _open(ChatScreen(course: course)),
          ),
          PopupMenuButton<String>(
            onSelected: (_) => _delete(),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'delete', child: ListTile(leading: Icon(Icons.delete_outline), title: Text('Dersi sil'))),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open(NoteEditorScreen(course: course)),
        icon: const Icon(Icons.note_add_outlined),
        label: const Text('Not ekle'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: StateView<List<NoteSummary>>(
          state: _state,
          onRetry: _load,
          builder: (context, notes) => notes.isEmpty
              ? ListView(children: const [
                  SizedBox(height: 80),
                  EmptyView(
                    icon: Icons.description_outlined,
                    title: 'Bu derste henüz not yok',
                    message: 'Ders notunu yapıştır veya TXT/PDF yükle; özetini çıkarıp test hazırlayalım.',
                  ),
                ])
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                  itemCount: notes.length,
                  itemBuilder: (context, i) {
                    final n = notes[i];
                    return Card(
                      child: ListTile(
                        title: Text(n.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                          '${formatDate(n.createdAt)} · ${n.quizCount} test\n${n.summaryPreview ?? ''}',
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        isThreeLine: true,
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _open(NoteDetailScreen(noteId: n.id)),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
