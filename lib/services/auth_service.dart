import '../core/api_client.dart';
import '../models/user.dart';

class AuthService {
  AuthService(this._api);
  final ApiClient _api;

  Future<AuthResult> login(String email, String password) async =>
      AuthResult.fromJson(await _api.post('login', {'email': email, 'password': password}));

  Future<AuthResult> register(String name, String email, String password) async =>
      AuthResult.fromJson(await _api.post('register', {'name': name, 'email': email, 'password': password}));
}
