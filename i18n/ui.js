// ui.js — Continuum's own interface strings, per locale.
//
// SCOPE: this file covers Continuum's CHROME only — the labels the extension
// itself draws. It must never be used for captured data. Chat titles, message
// bodies, attachment names, and any filename derived from a chat title are the
// user's content and pass through verbatim in every locale. The PDF and
// Markdown exporters are deliberately NOT wired to i18n for the same reason:
// an exported document is a portable artifact that gets handed to another
// model or another person, so its structure stays stable and English.
//
// Key-major layout (one key, all locales beneath it) so a translator can see
// every rendering of a string side by side and keep terminology consistent.
// tools/check-locales.js fails the build on any key missing a locale.
//
// Placeholders use Chrome's $1/$2 convention and are declared in the generated
// messages.json. Keep them in the same order in every language.
"use strict";

const UI = {
  // ── Header ────────────────────────────────────────────────────────────
  uiReview: {
    en: "Review", es: "Valorar", pt_BR: "Avaliar", de: "Bewerten",
    fr: "Noter", ja: "評価", zh_CN: "评价", ru: "Оценить",
    ko: "평가", it: "Recensisci", tr: "Değerlendir",
  },
  uiRateContinuum: {
    en: "Rate Continuum", es: "Valorar Continuum", pt_BR: "Avaliar o Continuum",
    de: "Continuum bewerten", fr: "Noter Continuum", ja: "Continuum を評価",
    zh_CN: "评价 Continuum", ru: "Оценить Continuum", ko: "Continuum 평가하기",
    it: "Valuta Continuum", tr: "Continuum'u değerlendir",
  },
  uiSettings: {
    en: "Settings", es: "Ajustes", pt_BR: "Configurações", de: "Einstellungen",
    fr: "Paramètres", ja: "設定", zh_CN: "设置", ru: "Настройки",
    ko: "설정", it: "Impostazioni", tr: "Ayarlar",
  },
  uiClose: {
    en: "Close", es: "Cerrar", pt_BR: "Fechar", de: "Schließen",
    fr: "Fermer", ja: "閉じる", zh_CN: "关闭", ru: "Закрыть",
    ko: "닫기", it: "Chiudi", tr: "Kapat",
  },
  uiBack: {
    en: "Back", es: "Atrás", pt_BR: "Voltar", de: "Zurück",
    fr: "Retour", ja: "戻る", zh_CN: "返回", ru: "Назад",
    ko: "뒤로", it: "Indietro", tr: "Geri",
  },

  // ── Main view ─────────────────────────────────────────────────────────
  uiCurrentChat: {
    en: "Current chat", es: "Chat actual", pt_BR: "Conversa atual",
    de: "Aktueller Chat", fr: "Chat actuel", ja: "現在のチャット",
    zh_CN: "当前对话", ru: "Текущий чат", ko: "현재 대화",
    it: "Chat corrente", tr: "Geçerli sohbet",
  },
  uiCaptureSession: {
    en: "Capture this session", es: "Capturar esta sesión",
    pt_BR: "Capturar esta sessão", de: "Diese Sitzung sichern",
    fr: "Capturer cette session", ja: "このセッションを保存",
    zh_CN: "捕获此对话", ru: "Сохранить эту сессию",
    ko: "이 세션 저장", it: "Cattura questa sessione",
    tr: "Bu oturumu yakala",
  },
  uiSavedSessions: {
    en: "Saved sessions", es: "Sesiones guardadas", pt_BR: "Sessões salvas",
    de: "Gespeicherte Sitzungen", fr: "Sessions enregistrées",
    ja: "保存したセッション", zh_CN: "已保存的会话",
    ru: "Сохранённые сессии", ko: "저장된 세션",
    it: "Sessioni salvate", tr: "Kayıtlı oturumlar",
  },
  uiSelect: {
    en: "Select", es: "Seleccionar", pt_BR: "Selecionar", de: "Auswählen",
    fr: "Sélectionner", ja: "選択", zh_CN: "选择", ru: "Выбрать",
    ko: "선택", it: "Seleziona", tr: "Seç",
  },
  uiSelectAll: {
    en: "Select all", es: "Seleccionar todo", pt_BR: "Selecionar tudo",
    de: "Alle auswählen", fr: "Tout sélectionner", ja: "すべて選択",
    zh_CN: "全选", ru: "Выбрать все", ko: "전체 선택",
    it: "Seleziona tutto", tr: "Tümünü seç",
  },
  uiSearchSaved: {
    en: "Search saved chats", es: "Buscar chats guardados",
    pt_BR: "Buscar conversas salvas", de: "Gespeicherte Chats durchsuchen",
    fr: "Rechercher dans les chats enregistrés", ja: "保存したチャットを検索",
    zh_CN: "搜索已保存的对话", ru: "Поиск по сохранённым чатам",
    ko: "저장된 대화 검색", it: "Cerca nelle chat salvate",
    tr: "Kayıtlı sohbetlerde ara",
  },
  uiClearSearch: {
    en: "Clear search", es: "Borrar búsqueda", pt_BR: "Limpar busca",
    de: "Suche löschen", fr: "Effacer la recherche", ja: "検索をクリア",
    zh_CN: "清除搜索", ru: "Очистить поиск", ko: "검색 지우기",
    it: "Cancella ricerca", tr: "Aramayı temizle",
  },
  uiAllSavedChats: {
    en: "All saved chats", es: "Todos los chats guardados",
    pt_BR: "Todas as conversas salvas", de: "Alle gespeicherten Chats",
    fr: "Tous les chats enregistrés", ja: "保存したすべてのチャット",
    zh_CN: "所有已保存的对话", ru: "Все сохранённые чаты",
    ko: "저장된 모든 대화", it: "Tutte le chat salvate",
    tr: "Tüm kayıtlı sohbetler",
  },
  uiDeleteCount: {
    en: "Delete ($1)", es: "Eliminar ($1)", pt_BR: "Excluir ($1)",
    de: "Löschen ($1)", fr: "Supprimer ($1)", ja: "削除 ($1)",
    zh_CN: "删除 ($1)", ru: "Удалить ($1)", ko: "삭제 ($1)",
    it: "Elimina ($1)", tr: "Sil ($1)",
  },

  // ── Detail view ───────────────────────────────────────────────────────
  uiResumeNewChat: {
    en: "Resume in new chat", es: "Continuar en un chat nuevo",
    pt_BR: "Continuar em nova conversa", de: "In neuem Chat fortsetzen",
    fr: "Reprendre dans un nouveau chat", ja: "新しいチャットで再開",
    zh_CN: "在新对话中继续", ru: "Продолжить в новом чате",
    ko: "새 대화에서 이어하기", it: "Riprendi in una nuova chat",
    tr: "Yeni sohbette sürdür",
  },
  uiResumeFormat: {
    en: "Resume format", es: "Formato para continuar",
    pt_BR: "Formato para continuar", de: "Format zum Fortsetzen",
    fr: "Format de reprise", ja: "再開の形式", zh_CN: "继续时使用的格式",
    ru: "Формат для продолжения", ko: "이어하기 형식",
    it: "Formato per riprendere", tr: "Sürdürme biçimi",
  },
  uiFormatHint: {
    en: "<strong>PDF</strong> embeds images and references files — heavier, but the model can <em>see</em> the images. <strong>MD</strong> references images and files by name only — much lighter (fewer tokens), text-only.",
    es: "<strong>PDF</strong> incrusta las imágenes y referencia los archivos: más pesado, pero el modelo puede <em>ver</em> las imágenes. <strong>MD</strong> solo referencia imágenes y archivos por su nombre: mucho más ligero (menos tokens), solo texto.",
    pt_BR: "<strong>PDF</strong> incorpora as imagens e referencia os arquivos — mais pesado, mas o modelo consegue <em>ver</em> as imagens. <strong>MD</strong> referencia imagens e arquivos apenas pelo nome — bem mais leve (menos tokens), só texto.",
    de: "<strong>PDF</strong> bettet Bilder ein und verweist auf Dateien — schwerer, aber das Modell kann die Bilder <em>sehen</em>. <strong>MD</strong> verweist auf Bilder und Dateien nur per Name — deutlich leichter (weniger Tokens), reiner Text.",
    fr: "<strong>PDF</strong> intègre les images et référence les fichiers : plus lourd, mais le modèle peut <em>voir</em> les images. <strong>MD</strong> ne référence images et fichiers que par leur nom : bien plus léger (moins de tokens), texte seul.",
    ja: "<strong>PDF</strong> は画像を埋め込み、ファイルを参照します。容量は大きくなりますが、モデルが画像を<em>見る</em>ことができます。<strong>MD</strong> は画像とファイルを名前で参照するだけです。はるかに軽量（トークン数が少ない）で、テキストのみです。",
    zh_CN: "<strong>PDF</strong> 会嵌入图片并引用文件——体积更大，但模型能够<em>看到</em>图片。<strong>MD</strong> 仅按名称引用图片和文件——轻量得多（token 更少），纯文本。",
    ru: "<strong>PDF</strong> встраивает изображения и ссылается на файлы — тяжелее, зато модель может <em>видеть</em> изображения. <strong>MD</strong> ссылается на изображения и файлы только по имени — намного легче (меньше токенов), только текст.",
    ko: "<strong>PDF</strong>는 이미지를 포함하고 파일을 참조합니다. 용량은 크지만 모델이 이미지를 <em>볼</em> 수 있습니다. <strong>MD</strong>는 이미지와 파일을 이름으로만 참조합니다. 훨씬 가볍고(토큰이 적음) 텍스트 전용입니다.",
    it: "<strong>PDF</strong> incorpora le immagini e referenzia i file: più pesante, ma il modello può <em>vedere</em> le immagini. <strong>MD</strong> referenzia immagini e file solo per nome: molto più leggero (meno token), solo testo.",
    tr: "<strong>PDF</strong> görselleri gömer ve dosyalara referans verir — daha ağırdır, ancak model görselleri <em>görebilir</em>. <strong>MD</strong> görsel ve dosyalara yalnızca adlarıyla referans verir — çok daha hafiftir (daha az token), yalnızca metin.",
  },
  uiCompressWithAI: {
    en: "Compress with AI (structured handoff brief)",
    es: "Comprimir con IA (resumen de traspaso estructurado)",
    pt_BR: "Comprimir com IA (resumo de transição estruturado)",
    de: "Mit KI komprimieren (strukturiertes Übergabe-Briefing)",
    fr: "Compresser avec l'IA (synthèse de passation structurée)",
    ja: "AIで圧縮（構造化された引き継ぎブリーフ）",
    zh_CN: "使用 AI 压缩（结构化交接摘要）",
    ru: "Сжать с помощью ИИ (структурированная сводка)",
    ko: "AI로 압축 (구조화된 인계 요약)",
    it: "Comprimi con l'IA (sintesi di passaggio strutturata)",
    tr: "Yapay zeka ile sıkıştır (yapılandırılmış devir özeti)",
  },
  uiAttachFiles: {
    en: "Attach files to the new chat", es: "Adjuntar archivos al chat nuevo",
    pt_BR: "Anexar arquivos à nova conversa", de: "Dateien an den neuen Chat anhängen",
    fr: "Joindre les fichiers au nouveau chat", ja: "新しいチャットにファイルを添付",
    zh_CN: "将文件附加到新对话", ru: "Прикрепить файлы к новому чату",
    ko: "새 대화에 파일 첨부", it: "Allega i file alla nuova chat",
    tr: "Dosyaları yeni sohbete ekle",
  },
  uiAttachImages: {
    en: "Attach images to the new chat", es: "Adjuntar imágenes al chat nuevo",
    pt_BR: "Anexar imagens à nova conversa", de: "Bilder an den neuen Chat anhängen",
    fr: "Joindre les images au nouveau chat", ja: "新しいチャットに画像を添付",
    zh_CN: "将图片附加到新对话", ru: "Прикрепить изображения к новому чату",
    ko: "새 대화에 이미지 첨부", it: "Allega le immagini alla nuova chat",
    tr: "Görselleri yeni sohbete ekle",
  },
  uiCopyChatHistory: {
    en: "Copy chat history", es: "Copiar el historial del chat",
    pt_BR: "Copiar histórico da conversa", de: "Chatverlauf kopieren",
    fr: "Copier l'historique du chat", ja: "チャット履歴をコピー",
    zh_CN: "复制聊天记录", ru: "Скопировать историю чата",
    ko: "대화 기록 복사", it: "Copia la cronologia della chat",
    tr: "Sohbet geçmişini kopyala",
  },
  uiDownloadFmt: {
    en: "Download $1", es: "Descargar $1", pt_BR: "Baixar $1",
    de: "$1 herunterladen", fr: "Télécharger le $1", ja: "$1 をダウンロード",
    zh_CN: "下载 $1", ru: "Скачать $1", ko: "$1 다운로드",
    it: "Scarica $1", tr: "$1 indir",
  },
  uiSaveAsFile: {
    en: "Save as file (.zip)", es: "Guardar como archivo (.zip)",
    pt_BR: "Salvar como arquivo (.zip)", de: "Als Datei speichern (.zip)",
    fr: "Enregistrer comme fichier (.zip)", ja: "ファイルとして保存（.zip）",
    zh_CN: "保存为文件 (.zip)", ru: "Сохранить как файл (.zip)",
    ko: "파일로 저장 (.zip)", it: "Salva come file (.zip)",
    tr: "Dosya olarak kaydet (.zip)",
  },
  uiDeleteSession: {
    en: "Delete session", es: "Eliminar sesión", pt_BR: "Excluir sessão",
    de: "Sitzung löschen", fr: "Supprimer la session", ja: "セッションを削除",
    zh_CN: "删除会话", ru: "Удалить сессию", ko: "세션 삭제",
    it: "Elimina sessione", tr: "Oturumu sil",
  },
  uiSoonLower: {
    en: "soon", es: "pronto", pt_BR: "em breve", de: "bald",
    fr: "bientôt", ja: "近日", zh_CN: "即将推出", ru: "скоро",
    ko: "곧", it: "presto", tr: "yakında",
  },
};

module.exports = { UI };
