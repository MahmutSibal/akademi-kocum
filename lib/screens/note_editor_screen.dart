import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/course.dart';
import '../models/note.dart';
import '../services/note_service.dart';
import '../state/session.dart';
import '../widgets/state_views.dart';
import 'note_detail_screen.dart';

/// Ders notu girişi: metin yapıştır, TXT veya PDF yükle -> özetle.
class NoteEditorScreen extends StatefulWidget {
  const NoteEditorScreen({super.key, required this.course});
  final Course course;

  @override
  State<NoteEditorScreen> createState() => _NoteEditorScreenState();
}

class _NoteEditorScreenState extends State<NoteEditorScreen> {
  static const minChars = 50;
  static const maxChars = 100000;

  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _content = TextEditingController();
  String? _busyMessage;

  @override
  void initState() {
    super.initState();
    _content.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
    super.dispose();
  }

  String _titleFromFile(String name) => name.replaceAll(RegExp(r'\.(txt|pdf)$', caseSensitive: false), '');

  Future<void> _pickFile() async {
    final file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['txt', 'pdf']);
    if (file == null || !mounted) return;
    final isPdf = (file.extension ?? '').toLowerCase() == 'pdf';
    setState(() => _busyMessage = isPdf ? 'PDF metni çıkarılıyor...' : 'Dosya okunuyor...');
    try {
      final bytes = await file.readAsBytes();
      final String text;
      if (isPdf) {
        if (!mounted) return;
        text = (await context.read<NoteService>().extractPdf(bytes, file.name)).text;
      } else {
        text = utf8.decode(bytes, allowMalformed: true).replaceFirst('﻿', '');
      }
      _content.text = text;
      if (_title.text.trim().isEmpty) _title.text = _titleFromFile(file.name);
      if (mounted) showInfoSnack(context, '${file.name} yüklendi (${text.length} karakter).');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busyMessage = null);
    }
  }

  /// Defter veya tahta fotoğrafı -> yerel görsel model -> metin.
  Future<void> _pickPhoto() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const ListTile(
            title: Text('Defter fotoğrafından not'),
            subtitle: Text('El yazısı veya basılı notu yapay zekâ metne çevirir. Fotoğraf bilgisayarından dışarı çıkmaz.'),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Fotoğraf çek'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Galeriden seç'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ]),
      ),
    );
    if (source == null || !mounted) return;
    final photo = await ImagePicker().pickImage(source: source, maxWidth: 1800, imageQuality: 85);
    if (photo == null || !mounted) return;
    setState(() => _busyMessage = 'Fotoğraftaki not okunuyor...\nGörsel model ilk açılışta 1-2 dakika sürebilir.');
    try {
      final bytes = await photo.readAsBytes();
      if (!mounted) return;
      final result = await context.read<NoteService>().extractImage(bytes, photo.name);
      final current = _content.text.trim();
      _content.text = current.isEmpty ? result.text : '$current\n\n${result.text}';
      if (_title.text.trim().isEmpty) _title.text = result.text.split('\n').first.trim();
      if (mounted) showInfoSnack(context, 'Fotoğraftan ${result.text.length} karakter okundu. Kontrol edip özetleyebilirsin.');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busyMessage = null);
    }
  }

  Future<void> _summarize() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _busyMessage = 'Not özetleniyor...\nYerel model kullanıldığı için bu 30-90 saniye sürebilir.');
    try {
      final result = await context.read<NoteService>().summarize(SummarizeRequest(
            userId: context.read<Session>().userId,
            courseId: widget.course.id,
            title: _title.text.trim(),
            content: _content.text,
          ));
      if (!mounted) return;
      showInfoSnack(context, 'Not kaydedildi ve özetlendi.');
      setState(() => _busyMessage = null);
      // Detay kapanana kadar bekle; ders ekranı listeyi ancak o zaman (test sayısıyla) yenilesin
      await Navigator.push(context, MaterialPageRoute(builder: (_) => NoteDetailScreen(noteId: result.noteId)));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => _busyMessage = null);
        showErrorSnack(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final length = _content.text.trim().length;
    return BusyOverlay(
      busy: _busyMessage != null,
      message: _busyMessage,
      child: Scaffold(
        appBar: AppBar(title: Text('Not ekle · ${widget.course.name}')),
        body: Form(
          key: _formKey,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            TextFormField(
              controller: _title,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Başlık', hintText: 'ör. Hafta 3 - İkili Arama Ağaçları'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Başlık boş bırakılamaz.' : null,
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _pickFile,
                  icon: const Icon(Icons.upload_file),
                  label: const Text('TXT / PDF'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _pickPhoto,
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Fotoğraftan'),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            TextFormField(
              controller: _content,
              minLines: 12,
              maxLines: 24,
              decoration: InputDecoration(
                labelText: 'Not metni',
                hintText: 'Ders notunu buraya yapıştır...',
                alignLabelWithHint: true,
                helperText: '$length / $maxChars karakter (en az $minChars)',
              ),
              validator: (v) {
                final n = v?.trim().length ?? 0;
                if (n == 0) return 'Not metni boş bırakılamaz.';
                if (n < minChars) return 'Not en az $minChars karakter olmalı.';
                if (n > maxChars) return 'Not en fazla $maxChars karakter olabilir.';
                return null;
              },
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _summarize,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              icon: const Icon(Icons.auto_awesome),
              label: const Text('Kaydet ve özetle'),
            ),
          ]),
        ),
      ),
    );
  }
}
