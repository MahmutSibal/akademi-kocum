import 'package:flutter/material.dart';

import '../core/view_state.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message});
  final String? message;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const CircularProgressIndicator(),
            if (message != null) ...[
              const SizedBox(height: 16),
              Text(message!, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ]),
        ),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.error_outline, size: 48, color: scheme.error),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 16),
            FilledButton.tonalIcon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Tekrar dene')),
          ],
        ]),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, this.message, this.action});
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 56, color: theme.colorScheme.primary.withValues(alpha: 0.6)),
          const SizedBox(height: 12),
          Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(message!, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: 16), action!],
        ]),
      ),
    );
  }
}

/// ViewState'e göre yükleniyor / hata / içerik gösterir.
class StateView<T> extends StatelessWidget {
  const StateView({super.key, required this.state, required this.builder, this.onRetry, this.loadingMessage});

  final ViewState<T> state;
  final Widget Function(BuildContext context, T data) builder;
  final VoidCallback? onRetry;
  final String? loadingMessage;

  @override
  Widget build(BuildContext context) => switch (state) {
        Loading<T>() => LoadingView(message: loadingMessage),
        Failure<T>(:final message) => ErrorView(message: message, onRetry: onRetry),
        Success<T>(:final data) => builder(context, data),
      };
}

/// Uzun süren LLM işlemleri sırasında ekranı kilitleyip ilerleme mesajı gösterir.
class BusyOverlay extends StatelessWidget {
  const BusyOverlay({super.key, required this.busy, required this.child, this.message});
  final bool busy;
  final Widget child;
  final String? message;

  @override
  Widget build(BuildContext context) => Stack(children: [
        child,
        if (busy)
          Positioned.fill(
            child: ColoredBox(
              color: Colors.black45,
              child: Center(
                child: Card(
                  margin: const EdgeInsets.all(32),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const CircularProgressIndicator(),
                      if (message != null) ...[
                        const SizedBox(height: 16),
                        Text(message!, textAlign: TextAlign.center),
                      ],
                    ]),
                  ),
                ),
              ),
            ),
          ),
      ]);
}

void showErrorSnack(BuildContext context, Object error) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(errorMessage(error)),
      backgroundColor: Theme.of(context).colorScheme.error,
      behavior: SnackBarBehavior.floating,
    ));
}

void showInfoSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));
}

Future<bool> confirmDialog(BuildContext context, String title, String message, {String ok = 'Evet'}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ok)),
      ],
    ),
  );
  return result ?? false;
}

String formatDate(DateTime? d) {
  if (d == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}.${two(d.month)}.${d.year} ${two(d.hour)}:${two(d.minute)}';
}

Color scoreColor(BuildContext context, num? percent) {
  if (percent == null) return Theme.of(context).colorScheme.outline;
  if (percent >= 80) return Colors.green.shade600;
  if (percent >= 50) return Colors.orange.shade700;
  return Theme.of(context).colorScheme.error;
}
