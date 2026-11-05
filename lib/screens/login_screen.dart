import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import 'settings_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _registerMode = false;
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  static final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');
  static const minPasswordLength = 6;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    final session = context.read<Session>();
    try {
      if (_registerMode) {
        await session.register(_name.text.trim(), _email.text.trim(), _password.text);
      } else {
        await session.login(_email.text.trim(), _password.text);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent, actions: [
        IconButton(
          tooltip: 'Sunucu ayarları',
          icon: const Icon(Icons.settings_outlined),
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
        ),
      ]),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Container(
                    height: 112,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [theme.colorScheme.primary, theme.colorScheme.tertiary]),
                      borderRadius: BorderRadius.circular(32),
                    ),
                    child: const Icon(Icons.auto_awesome_rounded, size: 58, color: Colors.white),
                  ),
                  const SizedBox(height: 24),
                  Text('Akademi Koçum', textAlign: TextAlign.center, style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(_registerMode ? 'Kendi öğrenme alanını oluştur' : 'Daha akıllı çalış, daha hızlı öğren',
                      textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 28),
                  if (_registerMode) ...[
                    TextFormField(
                      // Sabit anahtarlar: alan eklenip çıkınca hata mesajları başka alana kaymasın
                      key: const ValueKey('name'),
                      controller: _name,
                      textInputAction: TextInputAction.next,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Ad Soyad', prefixIcon: Icon(Icons.person_outline)),
                      validator: (v) => (v == null || v.trim().length < 2) ? 'Adınızı girin (en az 2 karakter).' : null,
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextFormField(
                    key: const ValueKey('email'),
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'E-posta', prefixIcon: Icon(Icons.alternate_email)),
                    validator: (v) {
                      final value = v?.trim() ?? '';
                      if (value.isEmpty) return 'E-posta boş bırakılamaz.';
                      if (!_emailPattern.hasMatch(value)) return 'Geçerli bir e-posta adresi girin.';
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    key: const ValueKey('password'),
                    controller: _password,
                    obscureText: _obscure,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _submit(),
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Şifre',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Şifre boş bırakılamaz.';
                      if (v.length < minPasswordLength) return 'Şifre en az $minPasswordLength karakter olmalı.';
                      return null;
                    },
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Card(
                      color: theme.colorScheme.errorContainer,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(children: [
                          Icon(Icons.error_outline, color: theme.colorScheme.onErrorContainer),
                          const SizedBox(width: 8),
                          Expanded(child: Text(_error!, style: TextStyle(color: theme.colorScheme.onErrorContainer))),
                        ]),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    child: _busy
                        ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                        : Text(_registerMode ? 'Kayıt ol' : 'Giriş yap'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () {
                            // Önceki moddaki doğrulama hatalarını temizle (metinler korunur)
                            final name = _name.text, email = _email.text, password = _password.text;
                            _formKey.currentState?.reset();
                            setState(() {
                              _registerMode = !_registerMode;
                              _error = null;
                              _name.text = name;
                              _email.text = email;
                              _password.text = password;
                            });
                          },
                    child: Text(_registerMode ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
