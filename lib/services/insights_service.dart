import '../core/api_client.dart';
import '../models/insights.dart';
import 'data_service.dart';

class InsightsService {
  InsightsService(this._api, this._data);
  final ApiClient _api;
  final DataService _data;

  Future<Dashboard> dashboard() async => Dashboard.fromJson(await _data('dashboard') as Map<String, dynamic>);

  Future<Stats> stats() async => Stats.fromJson(await _data('stats') as Map<String, dynamic>);

  Future<StudyPlan> studyPlan({double hoursPerDay = 2}) async =>
      StudyPlan.fromJson(await _api.post('study-plan', {'hoursPerDay': hoursPerDay}));

  /// Haftalık raporu kullanıcının kendi e-posta adresine gönderir (Brevo SMTP).
  /// Dönen değer: gönderilen adres.
  Future<String?> sendWeeklyReport() async {
    final res = await _api.post('weekly-report', {'dryRun': false}, timeout: const Duration(minutes: 1));
    return res['to'] as String?;
  }
}
