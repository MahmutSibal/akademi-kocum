class User {
  const User({required this.id, required this.email, required this.name});

  final int id;
  final String email;
  final String name;

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as int,
        email: json['email'] as String,
        name: json['name'] as String,
      );

  Map<String, dynamic> toJson() => {'id': id, 'email': email, 'name': name};
}

/// /login ve /register yanıtı.
class AuthResult {
  const AuthResult({required this.token, required this.user});

  final String token;
  final User user;

  factory AuthResult.fromJson(Map<String, dynamic> json) => AuthResult(
        token: json['token'] as String,
        user: User.fromJson(json['user'] as Map<String, dynamic>),
      );
}
