#!/usr/bin/env bash
# Uçtan uca API testi (canlı demo akışı + hata durumları).
# Kullanım:  bash backend/tests/api-test.sh [http://localhost:5678]
# Gereken: curl, node (JSON alanlarını okumak için)
set -euo pipefail

BASE="${1:-http://localhost:5678}/webhook"
DIR="$(cd "$(dirname "$0")" && pwd)"
# curl -F "file=@yol;type=..." içinde Git Bash yolları çevrilmez: Windows biçimine çevir
winpath() { command -v cygpath >/dev/null && cygpath -m "$1" || echo "$1"; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0

# json <dosya> <js-ifadesi>  ->  ifadenin değeri (d = ayrıştırılmış JSON)
json() { node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); const v=($2); process.stdout.write(typeof v==='object'?JSON.stringify(v):String(v))" "$1"; }

# call <ad> <beklenen-http> <yol> <gövde-dosyası> [token]
call() {
  local name=$1 expect=$2 path=$3 body=$4 token=${5:-}
  local out="$TMP/$name.json" start code
  start=$(date +%s)
  code=$(curl -s -o "$out" -w '%{http_code}' -X POST "$BASE/$path" \
    -H 'Content-Type: application/json; charset=utf-8' ${token:+-H "Authorization: Bearer $token"} \
    --data-binary "@$body" --max-time 400)
  if [[ "$code" == "$expect" ]]; then PASS=$((PASS+1)); echo "  ✓ $name  (HTTP $code, $(( $(date +%s) - start )) sn)";
  else FAIL=$((FAIL+1)); echo "  ✗ $name  beklenen $expect, gelen $code: $(head -c 300 "$out")"; fi
}

body() { printf '%s' "$2" > "$TMP/$1.req.json"; echo "$TMP/$1.req.json"; }

EMAIL="test$(date +%s)@uni.edu.tr"
echo "== Kimlik doğrulama"
call register 201 register "$(body register "{\"name\":\"Test Öğrenci\",\"email\":\"$EMAIL\",\"password\":\"sifre123\"}")"
call register-duplicate 409 register "$TMP/register.req.json"
call register-invalid 400 register "$(body reg-bad '{"name":"A","email":"gecersiz","password":"1"}')"
call login-wrong 401 login "$(body login-bad "{\"email\":\"$EMAIL\",\"password\":\"yanlis\"}")"
call login 200 login "$(body login "{\"email\":\"$EMAIL\",\"password\":\"sifre123\"}")"
TOKEN=$(json "$TMP/login.json" d.token)
USER_ID=$(json "$TMP/login.json" d.user.id)

echo "== Yetki kontrolü"
call no-token 401 data "$(body nt '{"action":"courses.list"}')"
call other-user 403 ask "$(body ou '{"userId":999999,"question":"Merhaba"}')" "$TOKEN"

echo "== Ders"
call course-create 201 data "$(body cc '{"action":"courses.create","params":{"name":"Mobil Programlama","description":"Flutter ve Dart"}}')" "$TOKEN"
COURSE_ID=$(json "$TMP/course-create.json" d.data.id)
call courses-list 200 data "$(body cl '{"action":"courses.list"}')" "$TOKEN"

echo "== 1) Not gönder -> özet al"
NOTE=$(node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(process.argv[1],'utf8')))" "$DIR/payloads/ornek-not.txt")
call summarize-short 400 summarize "$(body ss "{\"courseId\":$COURSE_ID,\"title\":\"Kısa\",\"content\":\"çok kısa\"}")" "$TOKEN"
call summarize 201 summarize "$(body sum "{\"userId\":$USER_ID,\"courseId\":$COURSE_ID,\"title\":\"Flutter Temelleri\",\"content\":$NOTE}")" "$TOKEN"
NOTE_ID=$(json "$TMP/summarize.json" d.noteId)
echo "    Özet: $(json "$TMP/summarize.json" 'd.summary.slice(0,160).replace(/\n/g," ")')..."

echo "== 2) Aynı nottan test oluştur"
call quiz-min 400 generate-quiz "$(body qm "{\"noteId\":$NOTE_ID,\"questionCount\":3}")" "$TOKEN"
call quiz-404 404 generate-quiz "$(body q4 '{"noteId":999999}')" "$TOKEN"
call generate-quiz 201 generate-quiz "$(body gq "{\"userId\":$USER_ID,\"noteId\":$NOTE_ID,\"questionCount\":5}")" "$TOKEN"
QUIZ_ID=$(json "$TMP/generate-quiz.json" d.quizId)
LEAK=$(json "$TMP/generate-quiz.json" 'JSON.stringify(d).includes("correct") || JSON.stringify(d).includes("explanation")')
[[ "$LEAK" == "false" ]] && { PASS=$((PASS+1)); echo "  ✓ cevaplar istemciye gönderilmedi"; } || { FAIL=$((FAIL+1)); echo "  ✗ yanıtta doğru cevap/açıklama var!"; }
echo "    İlk soru: $(json "$TMP/generate-quiz.json" 'd.questions[0].question')"

echo "== 3) Cevapla (hepsi 'A' -> en az bir yanlış olur) -> öneri"
ANSWERS=$(json "$TMP/generate-quiz.json" 'd.questions.map(q=>({questionIndex:q.questionIndex,selected:"A"}))')
call evaluate-bad 400 evaluate "$(body eb "{\"quizId\":$QUIZ_ID,\"answers\":[{\"questionIndex\":0,\"selected\":\"E\"}]}")" "$TOKEN"
call evaluate 200 evaluate "$(body ev "{\"userId\":$USER_ID,\"quizId\":$QUIZ_ID,\"answers\":$ANSWERS}")" "$TOKEN"
echo "    Puan: $(json "$TMP/evaluate.json" '`${d.score}/${d.total}`')"
echo "    Öneri: $(json "$TMP/evaluate.json" 'd.recommendation.slice(0,240).replace(/\n/g," | ")')..."
RESULT_ID=$(json "$TMP/evaluate.json" d.resultId)

echo "== 4) Yanlış konudan odaklı yeni test"
TOPIC=$(json "$TMP/evaluate.json" '(d.results.find(r=>!r.isCorrect)||d.results[0]).topic')
TOPIC_JSON=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$TOPIC")
call topic-quiz 201 generate-quiz "$(body tq "{\"noteId\":$NOTE_ID,\"questionCount\":5,\"focusTopic\":$TOPIC_JSON}")" "$TOKEN"
echo "    Odak: $TOPIC -> $(json "$TMP/topic-quiz.json" 'd.questions.map(q=>q.topic).join(" | ")')"

DIFF=$(json "$TMP/topic-quiz.json" 'd.difficulty')
[[ "$DIFF" == "kolay" || "$DIFF" == "orta" || "$DIFF" == "zor" ]] && { PASS=$((PASS+1)); echo "  ✓ uyarlanabilir zorluk: $DIFF ($(json "$TMP/topic-quiz.json" d.difficultyReason))"; } || { FAIL=$((FAIL+1)); echo "  ✗ zorluk dönmedi"; }
call quiz-hard 201 generate-quiz "$(body qh "{\"noteId\":$NOTE_ID,\"questionCount\":5,\"difficulty\":\"zor\"}")" "$TOKEN"
call quiz-bad-diff 400 generate-quiz "$(body qbd "{\"noteId\":$NOTE_ID,\"difficulty\":\"imkansiz\"}")" "$TOKEN"

echo "== 5) Ezber kartları + aralıklı tekrar (SM-2)"
call flashcards 201 flashcards "$(body fc "{\"noteId\":$NOTE_ID,\"count\":6}")" "$TOKEN"
echo "    Kart: $(json "$TMP/flashcards.json" 'd.cards[0].front+" => "+d.cards[0].back')"
call cards-due 200 data "$(body cd '{"action":"cards.due","params":{"limit":5}}')" "$TOKEN"
CARD_ID=$(json "$TMP/cards-due.json" 'd.data[0].id')
call card-good 200 data "$(body cg "{\"action\":\"cards.review\",\"params\":{\"cardId\":$CARD_ID,\"grade\":4}}")" "$TOKEN"
call card-good2 200 data "$(body cg2 "{\"action\":\"cards.review\",\"params\":{\"cardId\":$CARD_ID,\"grade\":4}}")" "$TOKEN"
IVL=$(json "$TMP/card-good2.json" 'd.data.intervalDays')
[[ "$IVL" == "6" ]] && { PASS=$((PASS+1)); echo "  ✓ SM-2: iki 'iyi' sonrası aralık 6 gün"; } || { FAIL=$((FAIL+1)); echo "  ✗ SM-2 aralığı beklenen 6, gelen $IVL"; }
call card-bad-grade 400 data "$(body cbg "{\"action\":\"cards.review\",\"params\":{\"cardId\":$CARD_ID,\"grade\":9}}")" "$TOKEN"

echo "== 6) Defter fotoğrafından not (görsel model)"
start=$(date +%s)
code=$(curl -s -o "$TMP/image.json" -w '%{http_code}' -X POST "$BASE/extract-image" -H "Authorization: Bearer $TOKEN" -F "file=@$(winpath "$DIR/payloads/ornek-defter.png");type=image/png" --max-time 700 || true)
OCR_OK=$( [[ "$code" == "200" ]] && json "$TMP/image.json" 'd.text.includes("Ağacı")' || echo false)
if [[ "$OCR_OK" == "true" ]]; then PASS=$((PASS+1)); echo "  ✓ extract-image (HTTP 200, $(( $(date +%s) - start )) sn): $(json "$TMP/image.json" 'd.text.split("\n")[0]')"; else FAIL=$((FAIL+1)); echo "  ✗ extract-image HTTP $code: $(head -c 200 "$TMP/image.json")"; fi
code=$(curl -s -o "$TMP/image-bad.json" -w '%{http_code}' -X POST "$BASE/extract-image" -H "Authorization: Bearer $TOKEN" -F "file=@$(winpath "$DIR/payloads/ornek-not.txt");type=text/plain" || true)
[[ "$code" == "415" ]] && { PASS=$((PASS+1)); echo "  ✓ görsel olmayan dosya reddedildi (415)"; } || { FAIL=$((FAIL+1)); echo "  ✗ beklenen 415, gelen $code"; }

echo "== 7) Haftalık e-posta raporu (önizleme, gönderilmez)"
call weekly-preview 200 weekly-report "$(body wp '{"dryRun":true}')" "$TOKEN"
echo "    Konu: $(json "$TMP/weekly-preview.json" 'd.subject') -> $(json "$TMP/weekly-preview.json" 'd.to')"

echo "== Soru-cevap (RAG + geçmiş)"
call ask 200 ask "$(body ask "{\"userId\":$USER_ID,\"courseId\":$COURSE_ID,\"question\":\"StatefulWidget ile StatelessWidget arasındaki fark nedir?\"}")" "$TOKEN"
echo "    Yanıt: $(json "$TMP/ask.json" 'd.answer.slice(0,200).replace(/\n/g," ")')...  (kullanılan not parçası: $(json "$TMP/ask.json" d.usedNotes))"
SRC=$(json "$TMP/ask.json" '(d.sources||[]).length')
[[ "$SRC" -ge 1 ]] && { PASS=$((PASS+1)); echo "  ✓ kaynak: $(json "$TMP/ask.json" 'd.sources.map(s=>"["+s.index+"] "+s.title+(s.cited?"":" (atıfsız)")).join(", ")')"; } || { FAIL=$((FAIL+1)); echo "  ✗ yanıtta kaynak yok"; }
call ask-empty 400 ask "$(body ae '{"question":" "}')" "$TOKEN"
call chat-history 200 data "$(body ch "{\"action\":\"chat.history\",\"params\":{\"courseId\":$COURSE_ID}}")" "$TOKEN"

echo "== Veri / istatistik / bonus"
call dashboard 200 data "$(body db '{"action":"dashboard"}')" "$TOKEN"
call notes-get 200 data "$(body ng "{\"action\":\"notes.get\",\"params\":{\"noteId\":$NOTE_ID}}")" "$TOKEN"
call results-get 200 data "$(body rg "{\"action\":\"results.get\",\"params\":{\"resultId\":$RESULT_ID}}")" "$TOKEN"
call stats 200 data "$(body st '{"action":"stats"}')" "$TOKEN"
echo "    Zayıf konular: $(json "$TMP/stats.json" 'd.data.weakTopics.map(t=>t.topic+" %"+t.successRate).join(", ")')"
call unknown-action 400 data "$(body ua '{"action":"drop.table"}')" "$TOKEN"
call study-plan 200 study-plan "$(body sp '{"hoursPerDay":2}')" "$TOKEN"
echo "    Program: $(json "$TMP/study-plan.json" 'd.days.map(x=>x.day+": "+x.focus).slice(0,3).join(" | ")') ..."

echo
echo "Sonuç: $PASS başarılı, $FAIL başarısız"
[[ $FAIL -eq 0 ]]
