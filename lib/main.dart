import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/app_config.dart';
import 'core/api_client.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'services/auth_service.dart';
import 'services/chat_service.dart';
import 'services/course_service.dart';
import 'services/data_service.dart';
import 'services/flashcard_service.dart';
import 'services/insights_service.dart';
import 'services/note_service.dart';
import 'services/quiz_service.dart';
import 'state/session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final config = AppConfig();
  await config.load();
  final api = ApiClient(config);
  final data = DataService(api);
  final session = Session(api, AuthService(api));
  await session.restore();

  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider.value(value: config),
      ChangeNotifierProvider.value(value: session),
      Provider.value(value: CourseService(data)),
      Provider.value(value: NoteService(api, data)),
      Provider.value(value: ChatService(api, data)),
      Provider.value(value: QuizService(api, data)),
      Provider.value(value: InsightsService(api, data)),
      Provider.value(value: FlashcardService(api, data)),
    ],
    child: const AkademiKocumApp(),
  ));
}

class AkademiKocumApp extends StatelessWidget {
  const AkademiKocumApp({super.key});

  @override
  Widget build(BuildContext context) {
    ThemeData theme(Brightness b) => ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4), brightness: b),
          useMaterial3: true,
          scaffoldBackgroundColor: b == Brightness.light ? const Color(0xFFF8F7FC) : null,
          appBarTheme: const AppBarTheme(centerTitle: false, elevation: 0, scrolledUnderElevation: 0),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: b == Brightness.light ? Colors.white : null,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          ),
          cardTheme: CardThemeData(
            clipBehavior: Clip.antiAlias,
            elevation: 0,
            margin: const EdgeInsets.symmetric(vertical: 6),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(54),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          navigationBarTheme: const NavigationBarThemeData(height: 72),
        );

    return MaterialApp(
      title: 'Akademi Koçum',
      debugShowCheckedModeBanner: false,
      theme: theme(Brightness.light),
      darkTheme: theme(Brightness.dark),
      home: Consumer<Session>(
        builder: (_, session, _) => session.isLoggedIn ? const HomeScreen() : const LoginScreen(),
      ),
    );
  }
}
