import '../models/course.dart';
import '../models/json_utils.dart';
import 'data_service.dart';

class CourseService {
  CourseService(this._data);
  final DataService _data;

  Future<List<Course>> list() async => listOf(await _data('courses.list'), Course.fromJson);

  Future<Course> create(String name, {String? description}) async =>
      Course.fromJson(await _data('courses.create', {'name': name, 'description': description}) as Map<String, dynamic>);

  Future<void> delete(int courseId) => _data('courses.delete', {'courseId': courseId});
}
