// listing.js — store-listing copy per locale. Single source of truth for the
// Chrome Web Store / AMO listings, the generated _locales/*/messages.json, and
// the localized marketing site.
//
// Keyword strategy (see LOCALIZATION.md): the head term in every locale is
// save/export — that is how the demand is actually expressed, and every
// competitor listing in these markets is built on it. "Resume / continue" is
// the differentiator and takes second position. It is deliberately NOT first:
// nobody searches for a category they don't know exists yet. In English it is
// also demoted because "resume" collides with "résumé" (CV builders dominate
// that query and the traffic is worthless to us).
//
// Platform names (ChatGPT, Claude, Gemini) appear in DESCRIPTIONS only, never
// in `name` — trademark use in an extension title is a takedown risk.
//
// Length budgets, enforced by tools/check-locales.js:
//   name   ≤ 75   (Chrome Web Store hard limit)
//   short  ≤ 132  (Chrome Web Store short description; also the AMO summary)
//   long   ≤ 250  (AMO summary limit — Firefox manifest description)
// `detailed` has no hard cap; it is pasted into the dashboard by hand and is
// emitted per locale into store-listings/<locale>/listing.txt.
"use strict";

const LISTING = {
  en: {
    name: "Continuum: Save & Export AI Chats, Resume Anywhere",
    short:
      "Save and export AI chats to PDF or Markdown, then resume them in a new chat with the full context intact.",
    long:
      "Save and export any AI conversation to PDF, Markdown, or ZIP, then resume it in a fresh chat on another platform with the full context intact — so you never lose a thread to message or length limits. Optional AI compression.",
    detailed: `Continuum saves your AI conversations and lets you pick them back up in a new chat — on the same assistant or a different one.

WHAT IT DOES
• Capture a whole conversation in one click — every message, image, and file.
• Resume it in a fresh chat on Claude, ChatGPT, Gemini, or Perplexity. Continuum opens the new chat, writes the hand-off message, and attaches your history.
• Export to PDF, Markdown, or ZIP whenever you want a copy.
• Compress with AI (optional) — condense a long chat into a structured hand-off brief and cut up to 95% of the tokens while keeping the details that matter.

WHY
Long chats hit message and length limits. Starting over means re-explaining everything you already covered. Continuum carries the context across instead.

PRIVATE BY DESIGN
Everything stays on your device. No account, no servers, no tracking, no analytics. If you turn on AI compression, the chat goes straight from your browser to the provider you chose, using your own API key — never through us.`,
  },

  es: {
    name: "Continuum: Guardar y Exportar Chats de IA y Continuarlos",
    short:
      "Guarda y exporta tus chats de IA en PDF o Markdown, y continúalos en un chat nuevo sin perder el contexto.",
    long:
      "Guarda y exporta cualquier conversación de IA en PDF, Markdown o ZIP, y continúala en un chat nuevo en otra plataforma con todo el contexto intacto, sin perder el hilo por los límites de mensajes o de longitud. Compresión con IA opcional.",
    detailed: `Continuum guarda tus conversaciones de IA y te permite retomarlas en un chat nuevo, con el mismo asistente o con otro distinto.

QUÉ HACE
• Captura una conversación entera con un clic: cada mensaje, imagen y archivo.
• Continúala en un chat nuevo de Claude, ChatGPT, Gemini o Perplexity. Continuum abre el chat, escribe el mensaje de traspaso y adjunta tu historial.
• Exporta a PDF, Markdown o ZIP cuando quieras una copia.
• Compresión con IA (opcional): condensa un chat largo en un resumen de traspaso estructurado y reduce hasta el 95 % de los tokens conservando lo que importa.

POR QUÉ
Las conversaciones largas chocan con los límites de mensajes y de longitud. Empezar de cero significa volver a explicar todo lo que ya habías contado. Continuum se lleva el contexto contigo.

PRIVADO POR DISEÑO
Todo se queda en tu dispositivo. Sin cuenta, sin servidores, sin rastreo, sin analíticas. Si activas la compresión con IA, el chat va directo de tu navegador al proveedor que elijas con tu propia clave de API, nunca a través de nosotros.`,
  },

  pt_BR: {
    name: "Continuum: Salvar e Exportar Conversas de IA e Continuar",
    short:
      "Salve e exporte suas conversas de IA em PDF ou Markdown e continue-as em um novo chat sem perder o contexto.",
    long:
      "Salve e exporte qualquer conversa de IA em PDF, Markdown ou ZIP e continue em um novo chat, em outra plataforma, com todo o contexto preservado — sem perder o fio por limites de mensagens ou de tamanho. Compressão com IA opcional.",
    detailed: `O Continuum salva suas conversas de IA e permite retomá-las em um novo chat, no mesmo assistente ou em outro.

O QUE FAZ
• Captura a conversa inteira em um clique: cada mensagem, imagem e arquivo.
• Continua em um novo chat no Claude, ChatGPT, Gemini ou Perplexity. O Continuum abre o chat, escreve a mensagem de transição e anexa seu histórico.
• Exporta para PDF, Markdown ou ZIP sempre que quiser uma cópia.
• Compressão com IA (opcional): condensa uma conversa longa em um resumo estruturado e corta até 95% dos tokens mantendo o que importa.

POR QUÊ
Conversas longas esbarram nos limites de mensagens e de tamanho. Recomeçar significa explicar tudo de novo. O Continuum leva o contexto junto.

PRIVADO POR DESIGN
Tudo fica no seu dispositivo. Sem conta, sem servidores, sem rastreamento, sem analytics. Se você ativar a compressão com IA, a conversa vai direto do seu navegador para o provedor escolhido, com sua própria chave de API — nunca por nós.`,
  },

  de: {
    name: "Continuum: KI-Chats speichern, exportieren & fortsetzen",
    short:
      "KI-Chats als PDF oder Markdown speichern und exportieren und in einem neuen Chat ohne Kontextverlust fortsetzen.",
    long:
      "Speichere und exportiere jede KI-Unterhaltung als PDF, Markdown oder ZIP und setze sie in einem neuen Chat auf einer anderen Plattform fort — mit vollem Kontext, ohne an Nachrichten- oder Längenlimits zu scheitern. Optional mit KI-Komprimierung.",
    detailed: `Continuum speichert deine KI-Unterhaltungen und lässt dich in einem neuen Chat weitermachen — beim selben Assistenten oder bei einem anderen.

WAS ES KANN
• Eine komplette Unterhaltung mit einem Klick sichern: jede Nachricht, jedes Bild, jede Datei.
• In einem neuen Chat bei Claude, ChatGPT, Gemini oder Perplexity fortsetzen. Continuum öffnet den Chat, schreibt die Übergabenachricht und hängt deinen Verlauf an.
• Als PDF, Markdown oder ZIP exportieren, wann immer du eine Kopie brauchst.
• KI-Komprimierung (optional): fasst einen langen Chat zu einem strukturierten Übergabe-Briefing zusammen und spart bis zu 95 % der Tokens, ohne das Wesentliche zu verlieren.

WARUM
Lange Chats stoßen an Nachrichten- und Längenlimits. Neu anfangen heißt, alles noch einmal zu erklären. Continuum nimmt den Kontext stattdessen mit.

PRIVAT VON GRUND AUF
Alles bleibt auf deinem Gerät. Kein Konto, keine Server, kein Tracking, keine Analytics. Wenn du die KI-Komprimierung aktivierst, geht der Chat direkt von deinem Browser an den gewählten Anbieter — mit deinem eigenen API-Schlüssel, niemals über uns.`,
  },

  fr: {
    name: "Continuum : sauvegarder, exporter et reprendre vos chats IA",
    short:
      "Sauvegardez et exportez vos conversations IA en PDF ou Markdown, puis reprenez-les dans un nouveau chat.",
    long:
      "Sauvegardez et exportez n'importe quelle conversation IA en PDF, Markdown ou ZIP, puis reprenez-la dans un nouveau chat sur une autre plateforme sans rien perdre du contexte, malgré les limites de messages ou de longueur. Compression IA en option.",
    detailed: `Continuum sauvegarde vos conversations IA et vous permet de les reprendre dans un nouveau chat, avec le même assistant ou un autre.

CE QU'IL FAIT
• Capture une conversation entière en un clic : chaque message, image et fichier.
• La reprend dans un nouveau chat sur Claude, ChatGPT, Gemini ou Perplexity. Continuum ouvre le chat, rédige le message de passation et joint votre historique.
• Exporte en PDF, Markdown ou ZIP dès que vous voulez une copie.
• Compression IA (facultative) : condense une longue conversation en une synthèse de passation structurée et réduit jusqu'à 95 % des tokens sans perdre l'essentiel.

POURQUOI
Les longues conversations butent sur les limites de messages et de longueur. Recommencer, c'est tout réexpliquer. Continuum emporte le contexte avec vous.

CONFIDENTIEL PAR CONCEPTION
Tout reste sur votre appareil. Aucun compte, aucun serveur, aucun pistage, aucune analytique. Si vous activez la compression IA, la conversation part directement de votre navigateur vers le fournisseur choisi, avec votre propre clé API — jamais par nos soins.`,
  },

  ja: {
    name: "Continuum: AIチャットを保存・エクスポート・再開",
    short:
      "AIとの会話をPDFやMarkdownで保存・エクスポートし、新しいチャットで文脈を保ったまま再開できます。",
    long:
      "AIとの会話をPDF・Markdown・ZIPで保存してエクスポートし、別のプラットフォームの新しいチャットでも文脈をそのまま引き継いで再開できます。メッセージ数や長さの上限で話の流れを失いません。AI圧縮にも対応。",
    detailed: `Continuumは、AIとの会話を保存し、新しいチャットで続きから再開できるようにします。同じアシスタントでも、別のアシスタントでも構いません。

できること
• 会話全体をワンクリックで保存。すべてのメッセージ、画像、ファイルを含みます。
• Claude、ChatGPT、Gemini、Perplexityの新しいチャットで再開。Continuumが新しいチャットを開き、引き継ぎメッセージを入力し、履歴を添付します。
• 必要なときにPDF・Markdown・ZIPへエクスポート。
• AI圧縮（任意）: 長い会話を構造化された引き継ぎブリーフにまとめ、重要な内容を残したままトークンを最大95%削減します。

なぜ必要か
長い会話はメッセージ数や長さの上限に達します。最初からやり直すと、すでに説明した内容をもう一度説明することになります。Continuumは代わりに文脈を運びます。

設計段階からプライベート
すべてがお使いのデバイス内で完結します。アカウント不要、サーバーなし、トラッキングなし、解析なし。AI圧縮を有効にした場合も、会話はブラウザから選択したプロバイダーへ直接送信されます。ご自身のAPIキーを使用し、当社を経由することはありません。`,
  },

  zh_CN: {
    name: "Continuum：保存、导出并继续 AI 对话",
    short: "将 AI 对话保存并导出为 PDF 或 Markdown，并在新对话中继续，不会丢失上下文。",
    long:
      "将任意 AI 对话保存并导出为 PDF、Markdown 或 ZIP，然后在其他平台的新对话中继续，完整保留上下文，不再因消息数量或长度限制而中断思路。可选 AI 压缩。",
    detailed: `Continuum 保存你的 AI 对话，并让你在新对话中接着聊——同一个助手或换一个都可以。

功能
• 一键捕获整段对话，包含每一条消息、图片和文件。
• 在 Claude、ChatGPT、Gemini 或 Perplexity 的新对话中继续。Continuum 会打开新对话、写好交接消息并附上你的历史记录。
• 随时导出为 PDF、Markdown 或 ZIP。
• AI 压缩（可选）：把长对话浓缩成结构化的交接摘要，在保留关键信息的同时最多减少 95% 的 token。

为什么需要
长对话会触及消息数量和长度限制。重新开始就意味着把讲过的内容再讲一遍。Continuum 则直接把上下文带过去。

隐私优先
所有数据都留在你的设备上。无需账号，没有服务器，不做追踪，不做分析。即使启用 AI 压缩，对话也是从你的浏览器直接发送到你选择的服务商，使用你自己的 API 密钥，绝不经过我们。`,
  },

  ru: {
    name: "Continuum: сохранение и экспорт чатов с ИИ, продолжение",
    short:
      "Сохраняйте и экспортируйте чаты с ИИ в PDF или Markdown и продолжайте их в новом чате без потери контекста.",
    long:
      "Сохраняйте и экспортируйте любой диалог с ИИ в PDF, Markdown или ZIP, а затем продолжайте его в новом чате на другой платформе с полным контекстом — не теряя нить из-за лимитов на сообщения и длину. Сжатие с помощью ИИ по желанию.",
    detailed: `Continuum сохраняет ваши диалоги с ИИ и позволяет продолжить их в новом чате — у того же ассистента или у другого.

ЧТО УМЕЕТ
• Сохраняет весь диалог в один клик: каждое сообщение, изображение и файл.
• Продолжает его в новом чате в Claude, ChatGPT, Gemini или Perplexity. Continuum открывает чат, пишет сообщение-передачу и прикрепляет вашу историю.
• Экспортирует в PDF, Markdown или ZIP, когда нужна копия.
• Сжатие с помощью ИИ (по желанию): сворачивает длинный диалог в структурированную сводку и убирает до 95% токенов, сохраняя главное.

ЗАЧЕМ
Длинные диалоги упираются в лимиты на сообщения и длину. Начать заново — значит объяснять всё сначала. Continuum вместо этого переносит контекст.

ПРИВАТНОСТЬ ПО УМОЛЧАНИЮ
Всё остаётся на вашем устройстве. Без аккаунта, без серверов, без трекинга и аналитики. Если включить сжатие с помощью ИИ, диалог уходит напрямую из браузера выбранному провайдеру с вашим собственным API-ключом — никогда через нас.`,
  },

  ko: {
    name: "Continuum: AI 대화 저장·내보내기·이어하기",
    short:
      "AI 대화를 PDF나 Markdown으로 저장하고 내보내며, 새 대화에서 맥락을 잃지 않고 이어갈 수 있습니다.",
    long:
      "AI 대화를 PDF, Markdown, ZIP으로 저장하고 내보낸 뒤 다른 플랫폼의 새 대화에서 전체 맥락 그대로 이어갈 수 있습니다. 메시지 수나 길이 제한으로 흐름을 잃지 않습니다. AI 압축 선택 가능.",
    detailed: `Continuum은 AI 대화를 저장해 두고, 새 대화에서 이어갈 수 있게 해줍니다. 같은 어시스턴트든 다른 어시스턴트든 상관없습니다.

주요 기능
• 클릭 한 번으로 대화 전체를 저장합니다. 모든 메시지, 이미지, 파일이 포함됩니다.
• Claude, ChatGPT, Gemini, Perplexity의 새 대화에서 이어갑니다. Continuum이 새 대화를 열고 인계 메시지를 작성한 뒤 기록을 첨부합니다.
• 필요할 때 PDF, Markdown, ZIP으로 내보냅니다.
• AI 압축(선택): 긴 대화를 구조화된 인계 요약으로 압축해 중요한 내용은 남기면서 토큰을 최대 95%까지 줄입니다.

왜 필요한가
긴 대화는 메시지 수와 길이 제한에 부딪힙니다. 처음부터 다시 시작하면 이미 설명한 내용을 또 설명해야 합니다. Continuum은 대신 맥락을 그대로 옮겨 줍니다.

설계부터 프라이빗
모든 것이 기기 안에 남습니다. 계정 없음, 서버 없음, 추적 없음, 분석 없음. AI 압축을 켜더라도 대화는 브라우저에서 선택한 제공업체로 직접 전송되며, 사용자 본인의 API 키를 사용합니다. 저희를 거치지 않습니다.`,
  },

  it: {
    name: "Continuum: salva ed esporta le chat IA e riprendile",
    short:
      "Salva ed esporta le conversazioni IA in PDF o Markdown e riprendile in una nuova chat senza perdere il contesto.",
    long:
      "Salva ed esporta qualsiasi conversazione IA in PDF, Markdown o ZIP, poi riprendila in una nuova chat su un'altra piattaforma con tutto il contesto intatto, senza perdere il filo per i limiti di messaggi o di lunghezza. Compressione IA opzionale.",
    detailed: `Continuum salva le tue conversazioni IA e ti permette di riprenderle in una nuova chat, con lo stesso assistente o con un altro.

COSA FA
• Cattura un'intera conversazione con un clic: ogni messaggio, immagine e file.
• La riprende in una nuova chat su Claude, ChatGPT, Gemini o Perplexity. Continuum apre la chat, scrive il messaggio di passaggio e allega la cronologia.
• Esporta in PDF, Markdown o ZIP ogni volta che ti serve una copia.
• Compressione IA (opzionale): condensa una chat lunga in una sintesi strutturata e taglia fino al 95% dei token mantenendo ciò che conta.

PERCHÉ
Le conversazioni lunghe si scontrano con i limiti di messaggi e di lunghezza. Ricominciare significa rispiegare tutto da capo. Continuum porta invece il contesto con sé.

PRIVATO PER PROGETTAZIONE
Tutto resta sul tuo dispositivo. Nessun account, nessun server, nessun tracciamento, nessuna analitica. Se attivi la compressione IA, la chat va direttamente dal tuo browser al provider che hai scelto, con la tua chiave API — mai attraverso di noi.`,
  },

  tr: {
    name: "Continuum: Yapay Zeka Sohbetlerini Kaydet, Dışa Aktar, Sürdür",
    short:
      "Yapay zeka sohbetlerini PDF veya Markdown olarak kaydedip dışa aktarın, yeni sohbette bağlamı kaybetmeden sürdürün.",
    long:
      "Yapay zeka sohbetlerini PDF, Markdown veya ZIP olarak kaydedip dışa aktarın ve başka bir platformdaki yeni sohbette bağlamı eksiksiz koruyarak sürdürün. Mesaj ve uzunluk sınırları yüzünden konuyu kaybetmeyin. İsteğe bağlı yapay zeka sıkıştırması.",
    detailed: `Continuum yapay zeka sohbetlerinizi kaydeder ve yeni bir sohbette kaldığınız yerden devam etmenizi sağlar — aynı asistanda ya da başka birinde.

NE YAPAR
• Tüm sohbeti tek tıkla yakalar: her mesaj, görsel ve dosya.
• Claude, ChatGPT, Gemini veya Perplexity'de yeni bir sohbette sürdürür. Continuum yeni sohbeti açar, devir mesajını yazar ve geçmişinizi ekler.
• İstediğiniz zaman PDF, Markdown veya ZIP olarak dışa aktarır.
• Yapay zeka sıkıştırması (isteğe bağlı): uzun bir sohbeti yapılandırılmış bir devir özetine indirger ve önemli ayrıntıları koruyarak token miktarını %95'e kadar azaltır.

NEDEN
Uzun sohbetler mesaj ve uzunluk sınırlarına takılır. Yeniden başlamak, daha önce anlattığınız her şeyi tekrar anlatmak demektir. Continuum bunun yerine bağlamı yanınızda taşır.

TASARIMDAN GELEN GİZLİLİK
Her şey cihazınızda kalır. Hesap yok, sunucu yok, takip yok, analitik yok. Yapay zeka sıkıştırmasını açsanız bile sohbet, tarayıcınızdan seçtiğiniz sağlayıcıya doğrudan gider; kendi API anahtarınızla, asla bizim üzerimizden değil.`,
  },
};

const LOCALES = Object.keys(LISTING);
const DEFAULT_LOCALE = "en";

module.exports = { LISTING, LOCALES, DEFAULT_LOCALE };
