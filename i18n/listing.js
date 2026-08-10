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
// The long store description lives in i18n/listing-detailed.js — it is pasted
// into the dashboard by hand and never ships inside the package.
"use strict";

const LISTING = {
  en: {
    name: "Continuum: Save & Export AI Chats, Resume Anywhere",
    short:
      "Save and export AI chats to PDF or Markdown, then resume them in a new chat with the full context intact.",
    long:
      "Save and export any AI conversation to PDF, Markdown, or ZIP, then resume it in a fresh chat on another platform with the full context intact — so you never lose a thread to message or length limits. Optional AI compression.",
  },

  es: {
    name: "Continuum: Guardar y Exportar Chats de IA y Continuarlos",
    short:
      "Guarda y exporta tus chats de IA en PDF o Markdown, y continúalos en un chat nuevo sin perder el contexto.",
    long:
      "Guarda y exporta cualquier conversación de IA en PDF, Markdown o ZIP, y continúala en un chat nuevo en otra plataforma con todo el contexto intacto, sin perder el hilo por los límites de mensajes o de longitud. Compresión con IA opcional.",
  },

  pt_BR: {
    name: "Continuum: Salvar e Exportar Conversas de IA e Continuar",
    short:
      "Salve e exporte suas conversas de IA em PDF ou Markdown e continue-as em um novo chat sem perder o contexto.",
    long:
      "Salve e exporte qualquer conversa de IA em PDF, Markdown ou ZIP e continue em um novo chat, em outra plataforma, com todo o contexto preservado — sem perder o fio por limites de mensagens ou de tamanho. Compressão com IA opcional.",
  },

  de: {
    name: "Continuum: KI-Chats speichern, exportieren & fortsetzen",
    short:
      "KI-Chats als PDF oder Markdown speichern und exportieren und in einem neuen Chat ohne Kontextverlust fortsetzen.",
    long:
      "Speichere und exportiere jede KI-Unterhaltung als PDF, Markdown oder ZIP und setze sie in einem neuen Chat auf einer anderen Plattform fort — mit vollem Kontext, ohne an Nachrichten- oder Längenlimits zu scheitern. Optional mit KI-Komprimierung.",
  },

  fr: {
    name: "Continuum : sauvegarder, exporter et reprendre vos chats IA",
    short:
      "Sauvegardez et exportez vos conversations IA en PDF ou Markdown, puis reprenez-les dans un nouveau chat.",
    long:
      "Sauvegardez et exportez n'importe quelle conversation IA en PDF, Markdown ou ZIP, puis reprenez-la dans un nouveau chat sur une autre plateforme sans rien perdre du contexte, malgré les limites de messages ou de longueur. Compression IA en option.",
  },

  ja: {
    name: "Continuum: AIチャットを保存・エクスポート・再開",
    short:
      "AIとの会話をPDFやMarkdownで保存・エクスポートし、新しいチャットで文脈を保ったまま再開できます。",
    long:
      "AIとの会話をPDF・Markdown・ZIPで保存してエクスポートし、別のプラットフォームの新しいチャットでも文脈をそのまま引き継いで再開できます。メッセージ数や長さの上限で話の流れを失いません。AI圧縮にも対応。",
  },

  zh_CN: {
    name: "Continuum：保存、导出并继续 AI 对话",
    short: "将 AI 对话保存并导出为 PDF 或 Markdown，并在新对话中继续，不会丢失上下文。",
    long:
      "将任意 AI 对话保存并导出为 PDF、Markdown 或 ZIP，然后在其他平台的新对话中继续，完整保留上下文，不再因消息数量或长度限制而中断思路。可选 AI 压缩。",
  },

  ru: {
    name: "Continuum: сохранение и экспорт чатов с ИИ, продолжение",
    short:
      "Сохраняйте и экспортируйте чаты с ИИ в PDF или Markdown и продолжайте их в новом чате без потери контекста.",
    long:
      "Сохраняйте и экспортируйте любой диалог с ИИ в PDF, Markdown или ZIP, а затем продолжайте его в новом чате на другой платформе с полным контекстом — не теряя нить из-за лимитов на сообщения и длину. Сжатие с помощью ИИ по желанию.",
  },

  ko: {
    name: "Continuum: AI 대화 저장·내보내기·이어하기",
    short:
      "AI 대화를 PDF나 Markdown으로 저장하고 내보내며, 새 대화에서 맥락을 잃지 않고 이어갈 수 있습니다.",
    long:
      "AI 대화를 PDF, Markdown, ZIP으로 저장하고 내보낸 뒤 다른 플랫폼의 새 대화에서 전체 맥락 그대로 이어갈 수 있습니다. 메시지 수나 길이 제한으로 흐름을 잃지 않습니다. AI 압축 선택 가능.",
  },

  it: {
    name: "Continuum: salva ed esporta le chat IA e riprendile",
    short:
      "Salva ed esporta le conversazioni IA in PDF o Markdown e riprendile in una nuova chat senza perdere il contesto.",
    long:
      "Salva ed esporta qualsiasi conversazione IA in PDF, Markdown o ZIP, poi riprendila in una nuova chat su un'altra piattaforma con tutto il contesto intatto, senza perdere il filo per i limiti di messaggi o di lunghezza. Compressione IA opzionale.",
  },

  tr: {
    name: "Continuum: Yapay Zeka Sohbetlerini Kaydet, Dışa Aktar, Sürdür",
    short:
      "Yapay zeka sohbetlerini PDF veya Markdown olarak kaydedip dışa aktarın, yeni sohbette bağlamı kaybetmeden sürdürün.",
    long:
      "Yapay zeka sohbetlerini PDF, Markdown veya ZIP olarak kaydedip dışa aktarın ve başka bir platformdaki yeni sohbette bağlamı eksiksiz koruyarak sürdürün. Mesaj ve uzunluk sınırları yüzünden konuyu kaybetmeyin. İsteğe bağlı yapay zeka sıkıştırması.",
  },
};

const LOCALES = Object.keys(LISTING);
const DEFAULT_LOCALE = "en";

module.exports = { LISTING, LOCALES, DEFAULT_LOCALE };
