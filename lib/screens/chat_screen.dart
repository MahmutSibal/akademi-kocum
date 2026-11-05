import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/view_state.dart';
import '../models/chat_message.dart';
import '../models/course.dart';
import '../services/chat_service.dart';
import '../state/session.dart';
import '../widgets/state_views.dart';
import 'note_detail_screen.dart';

/// Soru-cevap. course null ise dersten bağımsız genel sohbet.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, this.course});
  final Course? course;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  ViewState<List<ChatMessage>> _state = const Loading();
  bool _sending = false;
  String? _sendError;
  String? _lastQuestion;

  int? get _courseId => widget.course?.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _state = const Loading());
    try {
      final messages = await context.read<ChatService>().history(courseId: _courseId);
      if (!mounted) return;
      setState(() => _state = Success(messages));
      _scrollToEnd();
    } catch (e) {
      if (mounted) setState(() => _state = Failure(errorMessage(e)));
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  List<ChatMessage> get _messages => switch (_state) { Success(:final data) => data, _ => <ChatMessage>[] };

  Future<void> _send([String? retryText]) async {
    final text = (retryText ?? _input.text).trim();
    if (text.isEmpty || _sending) return;
    if (_state is! Success) _state = Success(<ChatMessage>[]);
    final messages = _messages;
    setState(() {
      _sending = true;
      _sendError = null;
      _lastQuestion = text;
      if (retryText == null) {
        messages.add(ChatMessage(role: 'user', content: text, createdAt: DateTime.now()));
        _input.clear();
      }
    });
    _scrollToEnd();
    try {
      final res = await context.read<ChatService>().ask(
            userId: context.read<Session>().userId,
            courseId: _courseId,
            question: text,
          );
      if (!mounted) return;
      setState(() => messages.add(ChatMessage(role: 'assistant', content: res.answer, sources: res.sources, createdAt: DateTime.now())));
      _scrollToEnd();
    } catch (e) {
      if (mounted) setState(() => _sendError = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _clear() async {
    if (!await confirmDialog(context, 'Geçmişi temizle', 'Bu sohbetteki tüm mesajlar silinecek.', ok: 'Temizle')) return;
    if (!mounted) return;
    try {
      await context.read<ChatService>().clear(courseId: _courseId);
      if (mounted) setState(() => _state = Success(<ChatMessage>[]));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Asistan'),
          Text(widget.course?.name ?? 'Genel sohbet', style: theme.textTheme.bodySmall),
        ]),
        actions: [IconButton(tooltip: 'Geçmişi temizle', icon: const Icon(Icons.delete_sweep_outlined), onPressed: _clear)],
      ),
      body: Column(children: [
        Expanded(
          child: StateView<List<ChatMessage>>(
            state: _state,
            onRetry: _load,
            loadingMessage: 'Sohbet geçmişi yükleniyor...',
            builder: (context, messages) => messages.isEmpty && !_sending
                ? EmptyView(
                    icon: Icons.forum_outlined,
                    title: 'Bir soru sor',
                    message: widget.course == null
                        ? 'Örn: "Big-O notasyonu nedir?"'
                        : 'Asistan, ${widget.course!.name} notlarındaki ilgili bölümleri de kullanarak yanıtlar.',
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: messages.length + (_sending || _sendError != null ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i == messages.length) return _sending ? const _TypingBubble() : _errorBubble(theme);
                      return _Bubble(message: messages[i]);
                    },
                  ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: 2000,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(hintText: 'Sorunu yaz...', counterText: '', isDense: true),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _sending ? null : _send,
                icon: const Icon(Icons.send),
                tooltip: 'Gönder',
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _errorBubble(ThemeData theme) => Card(
        color: theme.colorScheme.errorContainer,
        child: ListTile(
          leading: Icon(Icons.error_outline, color: theme.colorScheme.onErrorContainer),
          title: Text(_sendError ?? '', style: TextStyle(color: theme.colorScheme.onErrorContainer)),
          trailing: TextButton(onPressed: () => _send(_lastQuestion), child: const Text('Tekrar dene')),
        ),
      );
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final user = message.isUser;
    return Align(
      alignment: user ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: user ? scheme.primary : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(user ? 16 : 4),
            bottomRight: Radius.circular(user ? 4 : 16),
          ),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SelectableText(message.content, style: TextStyle(color: user ? scheme.onPrimary : scheme.onSurface)),
          if (!user && message.sources.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              message.sources.any((s) => s.cited) ? 'Kaynaklar' : 'Yararlanılan notlar',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 4),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final s in message.sources)
                ActionChip(
                  visualDensity: VisualDensity.compact,
                  avatar: CircleAvatar(child: Text('${s.index}', style: const TextStyle(fontSize: 11))),
                  label: Text(s.title, overflow: TextOverflow.ellipsis),
                  onPressed: () => _showSource(context, s),
                ),
            ]),
          ],
        ]),
      ),
    );
  }

  /// Kaynağa dokununca yanıtın dayandığı not bölümü gösterilir.
  void _showSource(BuildContext context, ChatSource s) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('[${s.index}] ${s.title}', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: 12),
            Flexible(child: SingleChildScrollView(child: SelectableText('“${s.excerpt ?? ''}…”'))),
            if (s.noteId != null) ...[
              const SizedBox(height: 16),
              FilledButton.tonalIcon(
                onPressed: () {
                  Navigator.pop(ctx);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => NoteDetailScreen(noteId: s.noteId!)));
                },
                icon: const Icon(Icons.article_outlined),
                label: const Text('Notu aç'),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [
            SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 10),
            Text('Asistan düşünüyor...'),
          ]),
        ),
      );
}
