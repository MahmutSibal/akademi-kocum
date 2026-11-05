import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/app_config.dart';
import '../widgets/state_views.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url = TextEditingController(text: context.read<AppConfig>().baseUrl);
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    await context.read<AppConfig>().setBaseUrl(_url.text);
    if (!mounted) return;
    showInfoSnack(context, 'Sunucu adresi kaydedildi.');
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sunucu ayarları')),
      body: Form(
        key: _formKey,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          TextFormField(
            controller: _url,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'n8n API adresi',
              hintText: 'http://10.0.2.2:5678',
              prefixIcon: Icon(Icons.dns_outlined),
            ),
            validator: (v) {
              final uri = Uri.tryParse(v?.trim() ?? '');
              if (uri == null || !uri.hasScheme || uri.host.isEmpty) return 'Geçerli bir adres girin (http://...).';
              return null;
            },
          ),
          const SizedBox(height: 12),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                '• Android emülatör: http://10.0.2.2:5678\n'
                '• Gerçek cihaz: http://<bilgisayarın-yerel-IP\'si>:5678 (aynı Wi-Fi)\n'
                '• Windows / web: http://localhost:5678',
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(children: [
            TextButton(
              onPressed: () => _url.text = AppConfig.defaultBaseUrl,
              child: const Text('Varsayılana dön'),
            ),
            const Spacer(),
            FilledButton.icon(onPressed: _save, icon: const Icon(Icons.save_outlined), label: const Text('Kaydet')),
          ]),
        ]),
      ),
    );
  }
}
