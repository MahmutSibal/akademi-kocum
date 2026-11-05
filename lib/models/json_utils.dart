/// SQL Server `FOR JSON` tarihleri saat dilimi olmadan UTC olarak döner.
DateTime? parseUtc(Object? value) {
  if (value is! String || value.isEmpty) return null;
  final hasZone = value.endsWith('Z') || RegExp(r'[+-]\d{2}:\d{2}$').hasMatch(value);
  return DateTime.tryParse(hasZone ? value : '${value}Z')?.toLocal();
}

double? toDouble(Object? value) => value is num ? value.toDouble() : null;

int toInt(Object? value, [int fallback = 0]) => value is num ? value.toInt() : fallback;

List<T> listOf<T>(Object? value, T Function(Map<String, dynamic>) fromJson) =>
    (value as List? ?? const []).whereType<Map<String, dynamic>>().map(fromJson).toList();

List<String> stringList(Object? value) => (value as List? ?? const []).map((e) => e.toString()).toList();
