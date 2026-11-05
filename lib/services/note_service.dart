import '../core/api_client.dart';
import '../models/json_utils.dart';
import '../models/note.dart';
import 'data_service.dart';

class NoteService {
  NoteService(this._api, this._data);
  final ApiClient _api;
  final DataService _data;

  Future<List<NoteSummary>> list({int? courseId}) async =>
      listOf(await _data('notes.list', {'courseId': courseId}), NoteSummary.fromJson);

  Future<Note> get(int noteId) async => Note.fromJson(await _data('notes.get', {'noteId': noteId}) as Map<String, dynamic>);

  /// Notu kaydeder ve Ollama ile özetler.
  Future<SummarizeResult> summarize(SummarizeRequest request) async =>
      SummarizeResult.fromJson(await _api.post('summarize', request.toJson()));

  /// PDF'ten metin çıkarır (n8n Extract From File).
  Future<PdfText> extractPdf(List<int> bytes, String fileName) async =>
      PdfText.fromJson(await _api.upload('extract-pdf', bytes, fileName));

  /// Defter/tahta fotoğrafını yerel görsel modelle metne çevirir (ilk çağrıda model yüklenir, uzun sürebilir).
  Future<PdfText> extractImage(List<int> bytes, String fileName) async =>
      PdfText.fromJson(await _api.upload('extract-image', bytes, fileName, timeout: const Duration(minutes: 10)));
}
