import 'api_client.dart';

/// Her API çağrısının arayüzdeki durumu: yükleniyor / başarılı / hata.
sealed class ViewState<T> {
  const ViewState();
}

class Loading<T> extends ViewState<T> {
  const Loading();
}

class Success<T> extends ViewState<T> {
  const Success(this.data);
  final T data;
}

class Failure<T> extends ViewState<T> {
  const Failure(this.message);
  final String message;
}

/// Hata nesnesini kullanıcıya gösterilecek Türkçe mesaja çevirir.
String errorMessage(Object error) =>
    error is ApiException ? error.message : 'Beklenmeyen bir hata oluştu: $error';
