// frames.js — the marketing copy beside each store screenshot, per locale.
//
// Five 1280×800 frames, in upload order. Each has an eyebrow (mono, letterspaced),
// a headline, and a body paragraph. `<span class="lt">` marks a word that drops
// to the lighter weight inside the headline — used sparingly, currently only on
// frame 4, matching the existing English art.
//
// Headlines are re-cut per language rather than translated literally: a German
// headline that is faithful but 40% longer breaks the two-line composition, and
// the frame is a picture first. Where a language runs long the phrasing is
// tightened until it fits the same line count.
"use strict";

const FRAMES = {
  en: [
    { eyebrow: "NEVER START OVER", headline: "Resume any chat<br>on any AI platform.", body: "Capture a full conversation and pick it up in a fresh chat, with complete context intact.", worksWith: "WORKS WITH" },
    { eyebrow: "CAPTURE", headline: "Save the whole<br>conversation<br>in one click.", body: "Every message, image, and file, kept in a private library grouped by assistant." },
    { eyebrow: "RESUME", headline: "Start fresh without<br>losing the thread.", body: "Continuum opens a new chat, writes the handoff message, and attaches your conversation history as a PDF or MD file. You can also copy the chat history as text or save it as a zip file." },
    { eyebrow: "AI COMPRESSION", headline: "Trim tokens<br><span class=\"lt\">by</span> up to 95%.", body: "Condenses the whole chat into a structured handoff brief — completed work, current state, in progress, next steps, constraints, critical context, and discarded attempts — while keeping full context, including your key decisions, code, files, and images." },
    { eyebrow: "PRIVATE BY DESIGN", headline: "100% local. No<br>account, no servers.", body: "Your chats and keys never leave your device. No tracking, no analytics, no cloud. Make it yours too: dark mode, auto-send, and an editable hand-off message." },
  ],

  es: [
    { eyebrow: "NUNCA EMPIECES DE CERO", headline: "Continúa cualquier chat<br>en cualquier IA.", body: "Captura una conversación entera y retómala en un chat nuevo con todo el contexto intacto.", worksWith: "COMPATIBLE CON" },
    { eyebrow: "CAPTURA", headline: "Guarda la conversación<br>entera<br>en un clic.", body: "Cada mensaje, imagen y archivo, en una biblioteca privada agrupada por asistente." },
    { eyebrow: "CONTINUAR", headline: "Empieza de nuevo sin<br>perder el hilo.", body: "Continuum abre un chat nuevo, escribe el mensaje de traspaso y adjunta tu historial como PDF o MD. También puedes copiar el historial como texto o guardarlo en un zip." },
    { eyebrow: "COMPRESIÓN CON IA", headline: "Recorta tokens<br><span class=\"lt\">hasta</span> un 95%.", body: "Condensa el chat entero en un resumen de traspaso estructurado — trabajo completado, estado actual, en curso, próximos pasos, restricciones, contexto crítico e intentos descartados — sin perder contexto, incluidas tus decisiones clave, código, archivos e imágenes." },
    { eyebrow: "PRIVADO POR DISEÑO", headline: "100% local. Sin cuenta,<br>sin servidores.", body: "Tus chats y claves nunca salen de tu dispositivo. Sin rastreo, sin analíticas, sin nube. Y hazlo tuyo: modo oscuro, envío automático y un mensaje de traspaso editable." },
  ],

  pt_BR: [
    { eyebrow: "NUNCA COMECE DO ZERO", headline: "Retome qualquer chat<br>em qualquer IA.", body: "Capture uma conversa inteira e retome em um chat novo com todo o contexto preservado.", worksWith: "FUNCIONA COM" },
    { eyebrow: "CAPTURA", headline: "Salve a conversa<br>inteira<br>em um clique.", body: "Cada mensagem, imagem e arquivo, em uma biblioteca privada agrupada por assistente." },
    { eyebrow: "CONTINUAR", headline: "Comece de novo sem<br>perder o fio.", body: "O Continuum abre um novo chat, escreve a mensagem de transição e anexa seu histórico como PDF ou MD. Você também pode copiar o histórico como texto ou salvar em um zip." },
    { eyebrow: "COMPRESSÃO COM IA", headline: "Corte tokens<br><span class=\"lt\">em até</span> 95%.", body: "Condensa a conversa inteira em um resumo de transição estruturado — trabalho concluído, estado atual, em andamento, próximos passos, restrições, contexto crítico e tentativas descartadas — mantendo todo o contexto, incluindo suas decisões, código, arquivos e imagens." },
    { eyebrow: "PRIVADO POR DESIGN", headline: "100% local. Sem conta,<br>sem servidores.", body: "Suas conversas e chaves nunca saem do seu dispositivo. Sem rastreamento, sem analytics, sem nuvem. E deixe do seu jeito: modo escuro, envio automático e mensagem de transição editável." },
  ],

  de: [
    { eyebrow: "NIE WIEDER VON VORN", headline: "Jeden Chat fortsetzen<br>auf jeder KI-Plattform.", body: "Sichere eine ganze Unterhaltung und mach in einem neuen Chat weiter — mit vollem Kontext.", worksWith: "FUNKTIONIERT MIT" },
    { eyebrow: "SICHERN", headline: "Die ganze<br>Unterhaltung<br>mit einem Klick.", body: "Jede Nachricht, jedes Bild, jede Datei — in einer privaten Bibliothek nach Assistent sortiert." },
    { eyebrow: "FORTSETZEN", headline: "Neu anfangen, ohne<br>den Faden zu verlieren.", body: "Continuum öffnet einen neuen Chat, schreibt die Übergabenachricht und hängt deinen Verlauf als PDF oder MD an. Du kannst den Verlauf auch als Text kopieren oder als ZIP speichern." },
    { eyebrow: "KI-KOMPRIMIERUNG", headline: "Bis zu 95%<br><span class=\"lt\">weniger</span> Tokens.", body: "Verdichtet den ganzen Chat zu einem strukturierten Übergabe-Briefing — erledigte Arbeit, aktueller Stand, in Arbeit, nächste Schritte, Rahmenbedingungen, kritischer Kontext und verworfene Ansätze — bei vollem Kontext, inklusive deiner Entscheidungen, Code, Dateien und Bilder." },
    { eyebrow: "PRIVAT VON GRUND AUF", headline: "100% lokal. Kein Konto,<br>keine Server.", body: "Deine Chats und Schlüssel verlassen dein Gerät nie. Kein Tracking, keine Analytics, keine Cloud. Und mach es dir passend: Dunkelmodus, Auto-Senden und eine editierbare Übergabenachricht." },
  ],

  fr: [
    { eyebrow: "NE JAMAIS TOUT REPRENDRE", headline: "Reprenez vos chats<br>sur n'importe quelle IA.", body: "Capturez une conversation entière et reprenez-la dans un nouveau chat, contexte intact.", worksWith: "COMPATIBLE AVEC" },
    { eyebrow: "CAPTURE", headline: "Enregistrez toute<br>la conversation<br>en un clic.", body: "Chaque message, image et fichier, dans une bibliothèque privée classée par assistant." },
    { eyebrow: "REPRISE", headline: "Repartez à zéro sans<br>perdre le fil.", body: "Continuum ouvre un nouveau chat, rédige le message de passation et joint votre historique en PDF ou MD. Vous pouvez aussi copier l'historique en texte ou l'enregistrer en zip." },
    { eyebrow: "COMPRESSION IA", headline: "Jusqu'à 95%<br><span class=\"lt\">de</span> tokens en moins.", body: "Condense tout le chat en une synthèse de passation structurée — travail effectué, état actuel, en cours, prochaines étapes, contraintes, contexte critique et pistes abandonnées — sans perdre le contexte, y compris vos décisions, votre code, vos fichiers et vos images." },
    { eyebrow: "CONFIDENTIEL PAR CONCEPTION", headline: "100% local. Sans compte,<br>sans serveurs.", body: "Vos chats et vos clés ne quittent jamais votre appareil. Aucun pistage, aucune analytique, aucun cloud. À personnaliser aussi : mode sombre, envoi auto et message de passation modifiable." },
  ],

  ja: [
    { eyebrow: "最初からやり直さない", headline: "どのAIでも、<br>どの会話でも再開。", body: "会話全体をまるごと保存して、文脈をそのまま保ったまま新しいチャットで続けられます。", worksWith: "対応サービス" },
    { eyebrow: "保存", headline: "会話をまるごと、<br>ワンクリックで<br>保存。", body: "すべてのメッセージ・画像・ファイルを、アシスタントごとに整理した非公開のライブラリに保管します。" },
    { eyebrow: "再開", headline: "話の流れを失わずに<br>新しく始める。", body: "Continuum が新しいチャットを開き、引き継ぎメッセージを書き、会話履歴を PDF または MD で添付します。履歴をテキストとしてコピーしたり、zip で保存することもできます。" },
    { eyebrow: "AI 圧縮", headline: "トークンを<br><span class=\"lt\">最大</span>95%削減。", body: "会話全体を構造化された引き継ぎブリーフに凝縮します。完了した作業、現在の状態、進行中、次のステップ、制約、重要な文脈、見送った試み。重要な決定・コード・ファイル・画像を含め、文脈は完全に保たれます。" },
    { eyebrow: "設計段階からプライベート", headline: "100%ローカル。<br>アカウントもサーバーも不要。", body: "チャットもキーも端末から出ません。トラッキングなし、解析なし、クラウドなし。ダークモード、自動送信、編集できる引き継ぎメッセージで自分好みに。" },
  ],

  zh_CN: [
    { eyebrow: "不必从头再来", headline: "任何对话，<br>都能在任何 AI 上继续。", body: "完整捕获一整段对话，在新对话中接着聊，上下文原样保留。", worksWith: "支持的平台" },
    { eyebrow: "捕获", headline: "一键保存<br>整段对话。", body: "每一条消息、图片和文件，都收进按助手分组的私人库里。" },
    { eyebrow: "继续", headline: "重新开始，<br>但不丢失思路。", body: "Continuum 会打开新对话、写好交接消息，并把你的对话历史以 PDF 或 MD 附上。你也可以把历史复制为文本，或保存成 zip 文件。" },
    { eyebrow: "AI 压缩", headline: "token 最多<br><span class=\"lt\">减少</span> 95%。", body: "把整段对话浓缩成结构化的交接摘要——已完成的工作、当前状态、进行中、下一步、限制条件、关键背景和已放弃的尝试——同时完整保留上下文，包括你的关键决定、代码、文件和图片。" },
    { eyebrow: "隐私优先", headline: "100% 本地。<br>无需账号，没有服务器。", body: "对话和密钥从不离开你的设备。不追踪、不分析、不上云。也可以按自己的习惯来：深色模式、自动发送，以及可编辑的交接消息。" },
  ],

  ru: [
    { eyebrow: "НЕ НАЧИНАТЬ ЗАНОВО", headline: "Продолжите чат<br>на любой платформе.", body: "Сохраните весь диалог и продолжите его в новом чате — контекст останется полным.", worksWith: "РАБОТАЕТ С" },
    { eyebrow: "СОХРАНЕНИЕ", headline: "Весь диалог —<br>одним<br>нажатием.", body: "Каждое сообщение, изображение и файл в приватной библиотеке с группировкой по ассистенту." },
    { eyebrow: "ПРОДОЛЖЕНИЕ", headline: "Начните заново,<br>не теряя нить.", body: "Continuum откроет новый чат, напишет сообщение-передачу и приложит вашу историю в PDF или MD. Историю можно скопировать текстом или сохранить в zip." },
    { eyebrow: "СЖАТИЕ С ПОМОЩЬЮ ИИ", headline: "До 95%<br><span class=\"lt\">меньше</span> токенов.", body: "Сворачивает весь диалог в структурированную сводку — выполненная работа, текущее состояние, в работе, следующие шаги, ограничения, критический контекст и отвергнутые попытки — сохраняя полный контекст, включая ваши решения, код, файлы и изображения." },
    { eyebrow: "ПРИВАТНОСТЬ ПО УМОЛЧАНИЮ", headline: "100% локально.<br>Без аккаунта,<br>без серверов.", body: "Чаты и ключи никогда не покидают устройство. Без трекинга, без аналитики, без облака. И настройте под себя: тёмная тема, автоотправка и редактируемое сообщение-передача." },
  ],

  ko: [
    { eyebrow: "다시 시작하지 않기", headline: "어떤 대화든<br>어떤 AI에서든 이어가기.", body: "대화 전체를 저장해 두고, 맥락 그대로 새 대화에서 이어갈 수 있습니다.", worksWith: "지원하는 서비스" },
    { eyebrow: "저장", headline: "대화 전체를<br>클릭 한 번으로<br>저장.", body: "모든 메시지와 이미지, 파일을 어시스턴트별로 정리된 개인 보관함에 담아 둡니다." },
    { eyebrow: "이어하기", headline: "흐름을 잃지 않고<br>새로 시작하기.", body: "Continuum이 새 대화를 열고 인계 메시지를 작성한 뒤 대화 기록을 PDF나 MD로 첨부합니다. 기록을 텍스트로 복사하거나 zip으로 저장할 수도 있습니다." },
    { eyebrow: "AI 압축", headline: "토큰을<br><span class=\"lt\">최대</span> 95% 절감.", body: "대화 전체를 구조화된 인계 요약으로 압축합니다. 완료된 작업, 현재 상태, 진행 중, 다음 단계, 제약 사항, 핵심 맥락, 폐기된 시도까지. 주요 결정과 코드, 파일, 이미지를 포함해 맥락은 그대로 유지됩니다." },
    { eyebrow: "설계부터 프라이빗", headline: "100% 로컬. 계정도<br>서버도 없이.", body: "대화와 키는 기기를 벗어나지 않습니다. 추적 없음, 분석 없음, 클라우드 없음. 취향대로 쓰세요: 다크 모드, 자동 전송, 그리고 편집 가능한 인계 메시지." },
  ],

  it: [
    { eyebrow: "MAI PIÙ DA CAPO", headline: "Riprendi qualsiasi chat<br>su qualsiasi IA.", body: "Cattura un'intera conversazione e riprendila in una nuova chat, con il contesto intatto.", worksWith: "COMPATIBILE CON" },
    { eyebrow: "CATTURA", headline: "Salva tutta<br>la conversazione<br>con un clic.", body: "Ogni messaggio, immagine e file, in una libreria privata raggruppata per assistente." },
    { eyebrow: "RIPRESA", headline: "Riparti da zero senza<br>perdere il filo.", body: "Continuum apre una nuova chat, scrive il messaggio di passaggio e allega la cronologia come PDF o MD. Puoi anche copiare la cronologia come testo o salvarla in uno zip." },
    { eyebrow: "COMPRESSIONE IA", headline: "Fino al 95%<br><span class=\"lt\">di</span> token in meno.", body: "Condensa l'intera chat in una sintesi di passaggio strutturata — lavoro completato, stato attuale, in corso, prossimi passi, vincoli, contesto critico e tentativi scartati — mantenendo tutto il contesto, incluse decisioni, codice, file e immagini." },
    { eyebrow: "PRIVATO PER PROGETTAZIONE", headline: "100% locale. Nessun<br>account, nessun server.", body: "Chat e chiavi non lasciano mai il tuo dispositivo. Nessun tracciamento, nessuna analitica, nessun cloud. E personalizzalo: modalità scura, invio automatico e messaggio di passaggio modificabile." },
  ],

  tr: [
    { eyebrow: "BAŞTAN BAŞLAMAYIN", headline: "Sohbeti sürdürün<br>her yapay zekâda.", body: "Bir sohbetin tamamını yakalayın ve bağlam eksiksiz korunmuş hâlde yeni bir sohbette sürdürün.", worksWith: "ŞUNLARLA ÇALIŞIR" },
    { eyebrow: "YAKALAMA", headline: "Sohbetin tamamını<br>tek tıkla<br>kaydedin.", body: "Her mesaj, görsel ve dosya, asistana göre gruplanmış özel bir kitaplıkta durur." },
    { eyebrow: "SÜRDÜRME", headline: "Konuyu kaybetmeden<br>yeniden başlayın.", body: "Continuum yeni bir sohbet açar, devir mesajını yazar ve geçmişinizi PDF veya MD olarak ekler. Geçmişi metin olarak kopyalayabilir ya da zip olarak kaydedebilirsiniz." },
    { eyebrow: "YAPAY ZEKA SIKIŞTIRMASI", headline: "Token'ları<br><span class=\"lt\">%95'e kadar</span> azaltın.", body: "Sohbetin tamamını yapılandırılmış bir devir özetine indirger — tamamlanan iş, mevcut durum, devam eden, sonraki adımlar, kısıtlar, kritik bağlam ve vazgeçilen denemeler — bağlamı eksiksiz koruyarak; kararlarınız, kodunuz, dosyalarınız ve görselleriniz dâhil." },
    { eyebrow: "TASARIMDAN GELEN GİZLİLİK", headline: "%100 yerel. Hesap yok,<br>sunucu yok.", body: "Sohbetleriniz ve anahtarlarınız cihazınızdan çıkmaz. Takip yok, analitik yok, bulut yok. Üstelik size göre: koyu mod, otomatik gönderim ve düzenlenebilir devir mesajı." },
  ],
};

module.exports = { FRAMES };
