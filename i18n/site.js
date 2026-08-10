// site.js — landing-page copy per locale, for the localized static pages under
// website/<locale>/.
//
// Keyed by the EXACT English source string as it appears in website/index.html.
// tools/build-website.js does a literal replace, so the key must stay
// byte-identical to the page — tools/build-website.js --check reports any key
// that no longer matches, which is what catches an English edit that silently
// orphans ten translations.
//
// NOT LISTED HERE, ON PURPOSE:
//   • Sample data in the hero mock — "Troubleshooting an error", dates, and the
//     other stand-in chat titles. They represent the user's own content, which
//     Continuum never translates.
//   • Product and brand names — Continuum, Claude, ChatGPT, Gemini, Perplexity,
//     PDF, Markdown, ZIP, Obsidian, Notion.
//   • The seven mock-panel labels that already exist in _locales; the builder
//     pulls those from the shipped catalog so the site cannot drift from the
//     extension.
"use strict";

const SITE = {
  // ── <head> — what search results actually show ────────────────────────
  "Continuum — Capture, save & resume AI chats": {
    es: "Continuum — Guarda, exporta y continúa tus chats de IA",
    pt_BR: "Continuum — Salve, exporte e continue suas conversas de IA",
    de: "Continuum — KI-Chats speichern, exportieren und fortsetzen",
    fr: "Continuum — Sauvegardez, exportez et reprenez vos chats IA",
    ja: "Continuum — AIチャットを保存・エクスポート・再開",
    zh_CN: "Continuum — 保存、导出并继续 AI 对话",
    ru: "Continuum — Сохраняйте, экспортируйте и продолжайте чаты с ИИ",
    ko: "Continuum — AI 대화 저장·내보내기·이어하기",
    it: "Continuum — Salva, esporta e riprendi le chat IA",
    tr: "Continuum — Yapay zeka sohbetlerini kaydedin, dışa aktarın, sürdürün",
  },
  "Continuum captures a full AI conversation and reopens it in a fresh chat on any platform, with every message, file, and image intact. 100% local.": {
    es: "Continuum captura una conversación de IA completa y la reabre en un chat nuevo en cualquier plataforma, con cada mensaje, archivo e imagen intactos. 100% local.",
    pt_BR: "O Continuum captura uma conversa de IA inteira e a reabre em um novo chat, em qualquer plataforma, com cada mensagem, arquivo e imagem preservados. 100% local.",
    de: "Continuum sichert eine komplette KI-Unterhaltung und öffnet sie in einem neuen Chat auf jeder Plattform wieder — mit jeder Nachricht, Datei und jedem Bild. 100% lokal.",
    fr: "Continuum capture une conversation IA entière et la rouvre dans un nouveau chat sur n'importe quelle plateforme, avec chaque message, fichier et image intacts. 100% local.",
    ja: "Continuum はAIとの会話をまるごと保存し、どのプラットフォームの新しいチャットでも、すべてのメッセージ・ファイル・画像をそのままに再開します。100%ローカル。",
    zh_CN: "Continuum 会完整捕获一整段 AI 对话，并在任意平台的新对话中重新打开，每一条消息、文件和图片都原样保留。100% 本地。",
    ru: "Continuum сохраняет весь диалог с ИИ и открывает его заново в новом чате на любой платформе — каждое сообщение, файл и изображение на месте. 100% локально.",
    ko: "Continuum은 AI 대화 전체를 저장해 어떤 플랫폼의 새 대화에서도 모든 메시지와 파일, 이미지를 그대로 다시 엽니다. 100% 로컬.",
    it: "Continuum cattura un'intera conversazione IA e la riapre in una nuova chat su qualsiasi piattaforma, con ogni messaggio, file e immagine intatti. 100% locale.",
    tr: "Continuum bir yapay zeka sohbetinin tamamını yakalar ve her mesaj, dosya ve görsel korunmuş hâlde herhangi bir platformdaki yeni bir sohbette yeniden açar. %100 yerel.",
  },

  // og:description — the blurb shown when the page is shared in a chat app.
  "Save any AI chat and resume it anywhere, with context intact. A private, local browser extension.": {
    es: "Guarda cualquier chat de IA y continúalo donde quieras, con el contexto intacto. Una extensión de navegador privada y local.",
    pt_BR: "Salve qualquer conversa de IA e continue onde quiser, com o contexto preservado. Uma extensão de navegador privada e local.",
    de: "Jeden KI-Chat speichern und überall fortsetzen — mit vollem Kontext. Eine private, lokale Browser-Erweiterung.",
    fr: "Sauvegardez n'importe quel chat IA et reprenez-le où vous voulez, contexte intact. Une extension de navigateur privée et locale.",
    ja: "AIチャットを保存して、どこでも文脈そのままに再開。プライベートでローカルなブラウザ拡張機能です。",
    zh_CN: "保存任何 AI 对话，随处继续，上下文原样保留。一个私密的本地浏览器扩展。",
    ru: "Сохраните любой чат с ИИ и продолжите где угодно, не теряя контекста. Приватное локальное расширение для браузера.",
    ko: "어떤 AI 대화든 저장해 맥락 그대로 어디서든 이어가세요. 프라이빗한 로컬 브라우저 확장 프로그램입니다.",
    it: "Salva qualsiasi chat IA e riprendila ovunque, con il contesto intatto. Un'estensione browser privata e locale.",
    tr: "Her yapay zeka sohbetini kaydedin ve bağlam korunmuş hâlde istediğiniz yerde sürdürün. Özel, yerel bir tarayıcı eklentisi.",
  },

  // ── Nav + hero ────────────────────────────────────────────────────────
  "How it works": { es: "Cómo funciona", pt_BR: "Como funciona", de: "So funktioniert es", fr: "Comment ça marche", ja: "使い方", zh_CN: "工作方式", ru: "Как это работает", ko: "작동 방식", it: "Come funziona", tr: "Nasıl çalışır" },
  Features: { es: "Funciones", pt_BR: "Recursos", de: "Funktionen", fr: "Fonctionnalités", ja: "機能", zh_CN: "功能", ru: "Возможности", ko: "기능", it: "Funzioni", tr: "Özellikler" },
  Privacy: { es: "Privacidad", pt_BR: "Privacidade", de: "Datenschutz", fr: "Confidentialité", ja: "プライバシー", zh_CN: "隐私", ru: "Приватность", ko: "개인정보", it: "Privacy", tr: "Gizlilik" },
  Support: { es: "Soporte", pt_BR: "Suporte", de: "Support", fr: "Assistance", ja: "サポート", zh_CN: "支持", ru: "Поддержка", ko: "지원", it: "Supporto", tr: "Destek" },
  "Add to Chrome": { es: "Añadir a Chrome", pt_BR: "Adicionar ao Chrome", de: "Zu Chrome hinzufügen", fr: "Ajouter à Chrome", ja: "Chrome に追加", zh_CN: "添加到 Chrome", ru: "Установить в Chrome", ko: "Chrome에 추가", it: "Aggiungi a Chrome", tr: "Chrome'a ekle" },
  "Add to Firefox": { es: "Añadir a Firefox", pt_BR: "Adicionar ao Firefox", de: "Zu Firefox hinzufügen", fr: "Ajouter à Firefox", ja: "Firefox に追加", zh_CN: "添加到 Firefox", ru: "Установить в Firefox", ko: "Firefox에 추가", it: "Aggiungi a Firefox", tr: "Firefox'a ekle" },

  "Save any AI chat.": { es: "Guarda cualquier chat de IA.", pt_BR: "Salve qualquer conversa de IA.", de: "Jeden KI-Chat speichern.", fr: "Sauvegardez n'importe quel chat IA.", ja: "AIチャットを保存。", zh_CN: "保存任何 AI 对话。", ru: "Сохраните любой чат с ИИ.", ko: "어떤 AI 대화든 저장.", it: "Salva qualsiasi chat IA.", tr: "Her yapay zeka sohbetini kaydedin." },
  "Resume it anywhere.": { es: "Continúalo donde quieras.", pt_BR: "Continue onde quiser.", de: "Überall fortsetzen.", fr: "Reprenez-le où vous voulez.", ja: "どこでも再開。", zh_CN: "随处继续。", ru: "Продолжите где угодно.", ko: "어디서든 이어하기.", it: "Riprendila ovunque.", tr: "İstediğiniz yerde sürdürün." },
  "Continuum captures the full conversation and reopens it in a fresh chat on any AI, with every message, image, file, and code block intact.": {
    es: "Continuum captura la conversación entera y la reabre en un chat nuevo en cualquier IA, con cada mensaje, imagen, archivo y bloque de código intactos.",
    pt_BR: "O Continuum captura a conversa inteira e a reabre em um novo chat em qualquer IA, com cada mensagem, imagem, arquivo e bloco de código preservados.",
    de: "Continuum sichert die ganze Unterhaltung und öffnet sie in einem neuen Chat bei jeder KI wieder — mit jeder Nachricht, jedem Bild, jeder Datei und jedem Codeblock.",
    fr: "Continuum capture la conversation entière et la rouvre dans un nouveau chat sur n'importe quelle IA, avec chaque message, image, fichier et bloc de code intacts.",
    ja: "Continuum は会話全体を保存し、どのAIの新しいチャットでも、すべてのメッセージ・画像・ファイル・コードブロックをそのままに再開します。",
    zh_CN: "Continuum 会完整捕获整段对话，并在任意 AI 的新对话中重新打开，每一条消息、图片、文件和代码块都原样保留。",
    ru: "Continuum сохраняет весь диалог и открывает его заново в новом чате в любом ИИ — каждое сообщение, изображение, файл и блок кода на месте.",
    ko: "Continuum은 대화 전체를 저장해 어떤 AI의 새 대화에서도 모든 메시지와 이미지, 파일, 코드 블록을 그대로 다시 엽니다.",
    it: "Continuum cattura l'intera conversazione e la riapre in una nuova chat su qualsiasi IA, con ogni messaggio, immagine, file e blocco di codice intatti.",
    tr: "Continuum sohbetin tamamını yakalar ve her mesaj, görsel, dosya ve kod bloğu korunmuş hâlde herhangi bir yapay zekâdaki yeni bir sohbette yeniden açar.",
  },
  "Free. Works locally. No account.": { es: "Gratis. Funciona en local. Sin cuenta.", pt_BR: "Grátis. Funciona local. Sem conta.", de: "Kostenlos. Läuft lokal. Kein Konto.", fr: "Gratuit. Fonctionne en local. Sans compte.", ja: "無料。ローカルで動作。アカウント不要。", zh_CN: "免费。本地运行。无需账号。", ru: "Бесплатно. Работает локально. Без аккаунта.", ko: "무료. 로컬 작동. 계정 불필요.", it: "Gratis. Funziona in locale. Senza account.", tr: "Ücretsiz. Yerel çalışır. Hesap yok." },
  // Carries the sample count, so it cannot reuse the extension's bare
  // uiSavedSessions key the way the other mock-panel labels do.
  "Saved sessions (3)": {
    es: "Sesiones guardadas (3)", pt_BR: "Sessões salvas (3)",
    de: "Gespeicherte Sitzungen (3)", fr: "Sessions enregistrées (3)",
    ja: "保存したセッション (3)", zh_CN: "已保存的会话 (3)",
    ru: "Сохранённые сессии (3)", ko: "저장된 세션 (3)",
    it: "Sessioni salvate (3)", tr: "Kayıtlı oturumlar (3)",
  },
  "Works with": { es: "Compatible con", pt_BR: "Funciona com", de: "Funktioniert mit", fr: "Compatible avec", ja: "対応サービス", zh_CN: "支持的平台", ru: "Работает с", ko: "지원하는 서비스", it: "Compatibile con", tr: "Şunlarla çalışır" },

  // ── Resume section ────────────────────────────────────────────────────
  "Resume on any AI platform.": { es: "Continúa en cualquier plataforma de IA.", pt_BR: "Continue em qualquer plataforma de IA.", de: "Auf jeder KI-Plattform fortsetzen.", fr: "Reprenez sur n'importe quelle plateforme IA.", ja: "どのAIプラットフォームでも再開。", zh_CN: "在任意 AI 平台继续。", ru: "Продолжайте на любой платформе ИИ.", ko: "어떤 AI 플랫폼에서든 이어하기.", it: "Riprendi su qualsiasi piattaforma IA.", tr: "Her yapay zeka platformunda sürdürün." },
  "Hit a length limit on Claude? Pick the thread back up on ChatGPT, Gemini, or Perplexity. Continuum writes the hand-off and attaches the history, so the new model starts with full context.": {
    es: "¿Llegaste al límite en Claude? Retoma el hilo en ChatGPT, Gemini o Perplexity. Continuum escribe el traspaso y adjunta el historial, para que el nuevo modelo arranque con todo el contexto.",
    pt_BR: "Bateu no limite do Claude? Retome o fio no ChatGPT, Gemini ou Perplexity. O Continuum escreve a transição e anexa o histórico, para o novo modelo começar com todo o contexto.",
    de: "Längenlimit bei Claude erreicht? Nimm den Faden bei ChatGPT, Gemini oder Perplexity wieder auf. Continuum schreibt die Übergabe und hängt den Verlauf an, damit das neue Modell mit vollem Kontext startet.",
    fr: "Limite atteinte sur Claude ? Reprenez le fil sur ChatGPT, Gemini ou Perplexity. Continuum rédige la passation et joint l'historique, pour que le nouveau modèle démarre avec tout le contexte.",
    ja: "Claude で長さの上限に達しましたか？ ChatGPT、Gemini、Perplexity で話を続けましょう。Continuum が引き継ぎを書き、履歴を添付するので、新しいモデルは完全な文脈から始められます。",
    zh_CN: "在 Claude 上碰到长度限制？换到 ChatGPT、Gemini 或 Perplexity 接着聊。Continuum 会写好交接消息并附上历史记录，让新模型带着完整上下文开始。",
    ru: "Упёрлись в лимит длины в Claude? Продолжите в ChatGPT, Gemini или Perplexity. Continuum напишет сообщение-передачу и приложит историю, чтобы новая модель начала с полным контекстом.",
    ko: "Claude에서 길이 제한에 걸렸나요? ChatGPT나 Gemini, Perplexity에서 이어가세요. Continuum이 인계 메시지를 쓰고 기록을 첨부해, 새 모델이 완전한 맥락에서 시작합니다.",
    it: "Hai raggiunto il limite su Claude? Riprendi il filo su ChatGPT, Gemini o Perplexity. Continuum scrive il passaggio e allega la cronologia, così il nuovo modello parte con tutto il contesto.",
    tr: "Claude'da uzunluk sınırına mı takıldınız? Konuyu ChatGPT, Gemini veya Perplexity'de sürdürün. Continuum devir mesajını yazar ve geçmişi ekler; yeni model tam bağlamla başlar.",
  },
  "One conversation, any destination": { es: "Una conversación, cualquier destino", pt_BR: "Uma conversa, qualquer destino", de: "Eine Unterhaltung, jedes Ziel", fr: "Une conversation, n'importe quelle destination", ja: "ひとつの会話を、どこへでも", zh_CN: "一段对话，任意去处", ru: "Один диалог, любое назначение", ko: "하나의 대화, 어디로든", it: "Una conversazione, qualsiasi destinazione", tr: "Tek sohbet, her hedef" },
  "The hand-off message is editable": { es: "El mensaje de traspaso es editable", pt_BR: "A mensagem de transição é editável", de: "Die Übergabenachricht ist editierbar", fr: "Le message de passation est modifiable", ja: "引き継ぎメッセージは編集可能", zh_CN: "交接消息可以编辑", ru: "Сообщение-передачу можно редактировать", ko: "인계 메시지는 편집 가능", it: "Il messaggio di passaggio è modificabile", tr: "Devir mesajı düzenlenebilir" },
  "Optional auto-send when the upload finishes": { es: "Envío automático opcional al terminar la subida", pt_BR: "Envio automático opcional quando o upload terminar", de: "Optionales Auto-Senden, sobald der Upload fertig ist", fr: "Envoi automatique optionnel à la fin du chargement", ja: "アップロード完了後の自動送信（任意）", zh_CN: "上传完成后可选自动发送", ru: "Автоотправка после загрузки — по желанию", ko: "업로드가 끝나면 자동 전송(선택)", it: "Invio automatico opzionale a fine caricamento", tr: "Yükleme bitince isteğe bağlı otomatik gönderim" },

  // ── PDF section ───────────────────────────────────────────────────────
  "A PDF the model can read": { es: "Un PDF que el modelo puede leer", pt_BR: "Um PDF que o modelo consegue ler", de: "Ein PDF, das das Modell lesen", fr: "Un PDF que le modèle peut lire", ja: "モデルが読めて", zh_CN: "模型能读", ru: "PDF, который модель может прочитать", ko: "모델이 읽고", it: "Un PDF che il modello può leggere", tr: "Modelin okuyabildiği" },
  and: { es: "y", pt_BR: "e", de: "und", fr: "et", ja: "しかも", zh_CN: "也能", ru: "и", ko: "그리고", it: "e", tr: "ve" },
  "see.": { es: "y ver.", pt_BR: "e ver.", de: "sehen kann.", fr: "et voir.", ja: "見られるPDF。", zh_CN: "能看的 PDF。", ru: "и увидеть.", ko: "볼 수 있는 PDF.", it: "e vedere.", tr: "görebildiği bir PDF." },
  "Continuum builds a single PDF of the whole chat. The text is real, not a screenshot, and your images are embedded inline so the resuming model can actually look at them, not just hear about them.": {
    es: "Continuum crea un único PDF con el chat entero. El texto es real, no una captura, y tus imágenes van incrustadas para que el modelo que retoma pueda verlas de verdad, no solo leer sobre ellas.",
    pt_BR: "O Continuum monta um único PDF da conversa inteira. O texto é real, não uma captura de tela, e suas imagens ficam incorporadas para o modelo que continua poder de fato vê-las, não só ouvir falar delas.",
    de: "Continuum baut ein einziges PDF der ganzen Unterhaltung. Der Text ist echt, kein Screenshot, und deine Bilder sind eingebettet — das fortsetzende Modell kann sie wirklich ansehen, statt nur davon zu hören.",
    fr: "Continuum crée un seul PDF de tout le chat. Le texte est réel, pas une capture d'écran, et vos images sont intégrées pour que le modèle qui reprend puisse vraiment les regarder, pas seulement en entendre parler.",
    ja: "Continuum は会話全体をひとつのPDFにまとめます。テキストはスクリーンショットではなく本物のテキストで、画像も埋め込まれるため、再開するモデルは説明を聞くだけでなく実際に画像を見ることができます。",
    zh_CN: "Continuum 会把整段对话生成一份 PDF。文字是真实文本而非截图，图片也直接嵌入其中，接手的模型能真正看到它们，而不只是听说。",
    ru: "Continuum собирает весь чат в один PDF. Текст настоящий, а не скриншот, и ваши изображения встроены — модель, которая продолжает, действительно их видит, а не просто читает описание.",
    ko: "Continuum은 대화 전체를 하나의 PDF로 만듭니다. 텍스트는 스크린샷이 아닌 실제 텍스트이고 이미지도 함께 삽입되어, 이어받는 모델이 이미지를 설명으로만 듣는 게 아니라 직접 볼 수 있습니다.",
    it: "Continuum crea un unico PDF dell'intera chat. Il testo è reale, non uno screenshot, e le tue immagini sono incorporate: il modello che riprende può davvero guardarle, non solo sentirne parlare.",
    tr: "Continuum sohbetin tamamını tek bir PDF hâline getirir. Metin ekran görüntüsü değil gerçek metindir ve görselleriniz de gömülüdür; devralan model onları duymakla kalmaz, gerçekten görebilir.",
  },
  "Files inlined, images embedded": { es: "Archivos en línea, imágenes incrustadas", pt_BR: "Arquivos embutidos, imagens incorporadas", de: "Dateien inline, Bilder eingebettet", fr: "Fichiers intégrés, images incorporées", ja: "ファイルはインライン、画像は埋め込み", zh_CN: "文件内联，图片嵌入", ru: "Файлы встроены, изображения вшиты", ko: "파일은 인라인, 이미지는 삽입", it: "File in linea, immagini incorporate", tr: "Dosyalar satır içi, görseller gömülü" },
  "Markdown for a lighter, text-only hand-off": { es: "Markdown para un traspaso más ligero, solo texto", pt_BR: "Markdown para uma transição mais leve, só texto", de: "Markdown für eine leichtere Übergabe, nur Text", fr: "Markdown pour une passation plus légère, texte seul", ja: "軽量でテキストのみの引き継ぎには Markdown", zh_CN: "Markdown 提供更轻量的纯文本交接", ru: "Markdown — более лёгкая передача, только текст", ko: "더 가벼운 텍스트 전용 인계에는 Markdown", it: "Markdown per un passaggio più leggero, solo testo", tr: "Daha hafif, yalnızca metin devir için Markdown" },
  "One-click copy of the whole chat history": { es: "Copia el historial entero con un clic", pt_BR: "Copie o histórico inteiro com um clique", de: "Ganzen Chatverlauf mit einem Klick kopieren", fr: "Copie de tout l'historique en un clic", ja: "チャット履歴全体をワンクリックでコピー", zh_CN: "一键复制完整聊天记录", ru: "Копирование всей истории чата одним кликом", ko: "전체 대화 기록을 클릭 한 번으로 복사", it: "Copia dell'intera cronologia con un clic", tr: "Tüm sohbet geçmişini tek tıkla kopyalayın" },
  "Or a full .zip archive of everything": { es: "O un archivo .zip completo con todo", pt_BR: "Ou um arquivo .zip completo com tudo", de: "Oder ein komplettes .zip-Archiv von allem", fr: "Ou une archive .zip complète de tout", ja: "またはすべてをまとめた .zip アーカイブ", zh_CN: "或导出包含全部内容的 .zip 归档", ru: "Или полный .zip-архив со всем", ko: "또는 전부 담은 .zip 아카이브", it: "Oppure un archivio .zip completo di tutto", tr: "Ya da her şeyi içeren tam bir .zip arşivi" },
  "See an example PDF": { es: "Ver un PDF de ejemplo", pt_BR: "Ver um PDF de exemplo", de: "Beispiel-PDF ansehen", fr: "Voir un exemple de PDF", ja: "PDF の例を見る", zh_CN: "查看 PDF 示例", ru: "Посмотреть пример PDF", ko: "PDF 예시 보기", it: "Vedi un PDF di esempio", tr: "Örnek bir PDF görün" },

  // ── Formats ───────────────────────────────────────────────────────────
  "Carry it your way.": { es: "Llévatelo a tu manera.", pt_BR: "Leve do seu jeito.", de: "Nimm es mit, wie du willst.", fr: "Emportez-le à votre façon.", ja: "好きな形で持ち出す。", zh_CN: "按你的方式带走。", ru: "Забирайте как удобно.", ko: "원하는 방식으로 가져가기.", it: "Portala via a modo tuo.", tr: "Kendi yönteminizle taşıyın." },
  "Read and seen": { es: "Leído y visto", pt_BR: "Lido e visto", de: "Gelesen und gesehen", fr: "Lu et vu", ja: "読めて、見える", zh_CN: "可读，也可见", ru: "Прочитано и увидено", ko: "읽고, 보고", it: "Letto e visto", tr: "Okunur ve görülür" },
  "Real text, not a screenshot, plus embedded images. The richest hand-off for vision models.": { es: "Texto real, no una captura, más imágenes incrustadas. El traspaso más completo para modelos con visión.", pt_BR: "Texto real, não captura de tela, mais imagens incorporadas. A transição mais rica para modelos com visão.", de: "Echter Text statt Screenshot, dazu eingebettete Bilder. Die reichhaltigste Übergabe für Vision-Modelle.", fr: "Du vrai texte, pas une capture, plus des images intégrées. La passation la plus riche pour les modèles à vision.", ja: "スクリーンショットではない本物のテキストと、埋め込み画像。視覚対応モデルに最も豊かな引き継ぎ。", zh_CN: "真实文本而非截图，还带嵌入图片。为视觉模型准备的最完整交接。", ru: "Настоящий текст, а не скриншот, плюс встроенные изображения. Самая полная передача для мультимодальных моделей.", ko: "스크린샷이 아닌 실제 텍스트에 이미지까지 삽입. 비전 모델에 가장 풍부한 인계.", it: "Testo reale, non uno screenshot, più immagini incorporate. Il passaggio più ricco per i modelli con visione.", tr: "Ekran görüntüsü değil gerçek metin, üstüne gömülü görseller. Görme yetenekli modeller için en zengin devir." },
  "Light and fast": { es: "Ligero y rápido", pt_BR: "Leve e rápido", de: "Leicht und schnell", fr: "Léger et rapide", ja: "軽くて速い", zh_CN: "轻量而快速", ru: "Лёгкий и быстрый", ko: "가볍고 빠르게", it: "Leggero e veloce", tr: "Hafif ve hızlı" },
  "Text-only, fewer tokens. Files and images referenced by name.": { es: "Solo texto, menos tokens. Archivos e imágenes referenciados por nombre.", pt_BR: "Só texto, menos tokens. Arquivos e imagens referenciados pelo nome.", de: "Nur Text, weniger Tokens. Dateien und Bilder per Name referenziert.", fr: "Texte seul, moins de tokens. Fichiers et images référencés par leur nom.", ja: "テキストのみでトークン数も少なめ。ファイルと画像は名前で参照。", zh_CN: "纯文本，token 更少。文件和图片按名称引用。", ru: "Только текст, меньше токенов. Файлы и изображения — по имени.", ko: "텍스트 전용, 토큰도 적게. 파일과 이미지는 이름으로 참조.", it: "Solo testo, meno token. File e immagini referenziati per nome.", tr: "Yalnızca metin, daha az token. Dosya ve görseller adlarıyla referanslanır." },
  "The full archive": { es: "El archivo completo", pt_BR: "O arquivo completo", de: "Das komplette Archiv", fr: "L'archive complète", ja: "完全なアーカイブ", zh_CN: "完整归档", ru: "Полный архив", ko: "전체 아카이브", it: "L'archivio completo", tr: "Tam arşiv" },
  "Every message, file, and image saved to disk, exactly as captured.": { es: "Cada mensaje, archivo e imagen guardado en disco, exactamente como se capturó.", pt_BR: "Cada mensagem, arquivo e imagem salvo em disco, exatamente como foi capturado.", de: "Jede Nachricht, Datei und jedes Bild auf der Festplatte — genau wie gesichert.", fr: "Chaque message, fichier et image enregistré sur disque, exactement tel que capturé.", ja: "すべてのメッセージ・ファイル・画像を、保存した時のままディスクへ。", zh_CN: "每一条消息、文件和图片都按捕获时的原样保存到磁盘。", ru: "Каждое сообщение, файл и изображение на диске — ровно в том виде, в каком сохранены.", ko: "모든 메시지와 파일, 이미지를 저장한 그대로 디스크에 보관.", it: "Ogni messaggio, file e immagine salvato su disco, esattamente com'è stato catturato.", tr: "Her mesaj, dosya ve görsel, yakalandığı hâliyle diske kaydedilir." },
};

module.exports = { SITE };
