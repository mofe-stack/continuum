// preambles.js — the default resume message, per locale.
//
// This is NOT interface chrome. It is the text Continuum types into the new chat
// on resume, and the model reads it. Leaving it English meant a Spanish user
// resuming a Spanish conversation got an English instruction pasted in, which
// nudges the model to reply in English and breaks the very thread they were
// continuing. So it is localized.
//
// Only the DEFAULT is localized. Anyone who has edited their resume message keeps
// theirs — settings.js persists the value on first run and never overwrites it.
//
// TWO THINGS STAY IN ENGLISH IN EVERY LANGUAGE, deliberately:
//
//   1. `conversation-history.pdf` / `.md` — a real filename the model looks for
//      in its attachments. Translating it would point at a file that isn't there.
//
//   2. The seven brief section names (Completed work, Current state, In progress,
//      Next steps, Constraints, Critical context, Discarded attempts). The
//      compressor prompt in llm-compressor.js is English and emits those headings
//      verbatim, so the preamble has to name them exactly as they appear in the
//      document. Translating them would describe a structure the brief does not
//      have. The chips in Settings ARE translated — those are labels about the
//      feature, not references into the generated file.
//
// Four variants: verbatim PDF, verbatim Markdown, and the AI-brief version of
// each. The Markdown ones must NOT promise the model can see images — with .md
// the images are referenced by name, not attached.
"use strict";

const PREAMBLES = {
  // ── Verbatim transcript, PDF ──────────────────────────────────────────
  preamblePdf: {
    en:
      "Continue from our previous conversation. The entire chat history is attached " +
      "as `conversation-history.pdf` — every message, with any uploaded files' " +
      "contents inlined and any images embedded inline, so you can read it and see " +
      "the images directly. You have the complete prior context, so pick up exactly " +
      "where we left off — same goals, decisions, constraints, and current state. " +
      "Don't recap the history back to me; just continue as if this is the same conversation.",
    es:
      "Continúa nuestra conversación anterior. El historial completo del chat está adjunto " +
      "como `conversation-history.pdf`: cada mensaje, con el contenido de los archivos subidos " +
      "incorporado y las imágenes insertadas, así que puedes leerlo y ver las imágenes " +
      "directamente. Tienes todo el contexto previo, así que retoma exactamente donde lo " +
      "dejamos: mismos objetivos, decisiones, restricciones y estado actual. No me resumas el " +
      "historial; simplemente continúa como si fuera la misma conversación.",
    pt_BR:
      "Continue a partir da nossa conversa anterior. O histórico completo está anexado como " +
      "`conversation-history.pdf` — cada mensagem, com o conteúdo dos arquivos enviados " +
      "incorporado e as imagens embutidas, então você pode ler tudo e ver as imagens " +
      "diretamente. Você tem todo o contexto anterior, então retome exatamente de onde paramos: " +
      "mesmos objetivos, decisões, restrições e estado atual. Não me resuma o histórico; apenas " +
      "continue como se fosse a mesma conversa.",
    de:
      "Setze unsere vorherige Unterhaltung fort. Der vollständige Chatverlauf ist als " +
      "`conversation-history.pdf` angehängt — jede Nachricht, mit den Inhalten hochgeladener " +
      "Dateien eingebettet und allen Bildern inline, sodass du ihn lesen und die Bilder direkt " +
      "sehen kannst. Du hast den vollständigen bisherigen Kontext, mach also genau dort weiter, " +
      "wo wir aufgehört haben — gleiche Ziele, Entscheidungen, Rahmenbedingungen und aktueller " +
      "Stand. Fasse den Verlauf nicht für mich zusammen; mach einfach weiter, als wäre es " +
      "dieselbe Unterhaltung.",
    fr:
      "Reprends notre conversation précédente. L'historique complet du chat est joint sous le nom " +
      "`conversation-history.pdf` — chaque message, avec le contenu des fichiers téléversés " +
      "intégré et les images incorporées, afin que tu puisses le lire et voir les images " +
      "directement. Tu disposes de tout le contexte antérieur : reprends exactement là où nous " +
      "nous étions arrêtés — mêmes objectifs, décisions, contraintes et état actuel. Ne me " +
      "résume pas l'historique ; continue simplement comme s'il s'agissait de la même conversation.",
    ja:
      "前回の会話の続きから進めてください。これまでのチャット履歴はすべて `conversation-history.pdf` " +
      "として添付されています。すべてのメッセージに加え、アップロードされたファイルの内容も" +
      "取り込まれ、画像も埋め込まれているため、そのまま読んで画像も直接確認できます。" +
      "これまでの文脈はすべて揃っているので、中断したところから正確に再開してください。" +
      "目標、決定事項、制約、現在の状態はそのままです。履歴を要約して返す必要はありません。" +
      "同じ会話の続きとしてそのまま進めてください。",
    zh_CN:
      "接着我们之前的对话继续。完整的聊天记录已作为 `conversation-history.pdf` 附上——包含每一条消息，" +
      "上传文件的内容已内联，图片也已嵌入，因此你可以直接阅读并查看这些图片。" +
      "你已经掌握了全部先前的上下文，请从我们停下的地方精确接着往下走：目标、决定、" +
      "限制条件和当前状态都不变。不要把历史内容复述给我，直接当作同一段对话继续即可。",
    ru:
      "Продолжи наш предыдущий разговор. Полная история чата приложена как " +
      "`conversation-history.pdf` — каждое сообщение, с содержимым загруженных файлов внутри и " +
      "встроенными изображениями, так что ты можешь прочитать её и увидеть изображения напрямую. " +
      "У тебя есть весь предыдущий контекст, поэтому продолжай ровно с того места, где мы " +
      "остановились: те же цели, решения, ограничения и текущее состояние. Не пересказывай мне " +
      "историю — просто продолжай, как если бы это был тот же разговор.",
    ko:
      "이전 대화에서 이어서 진행해 주세요. 전체 대화 기록이 `conversation-history.pdf`로 첨부되어 " +
      "있습니다. 모든 메시지와 함께 업로드된 파일의 내용이 포함되어 있고 이미지도 삽입되어 있어, " +
      "그대로 읽고 이미지를 직접 확인할 수 있습니다. 이전 맥락이 모두 갖춰져 있으니 우리가 멈춘 " +
      "지점에서 정확히 이어가 주세요. 목표와 결정, 제약, 현재 상태는 그대로입니다. 기록을 다시 " +
      "요약해 줄 필요는 없습니다. 같은 대화의 연장선으로 계속 진행해 주세요.",
    it:
      "Riprendi dalla nostra conversazione precedente. L'intera cronologia della chat è allegata " +
      "come `conversation-history.pdf` — ogni messaggio, con i contenuti dei file caricati " +
      "incorporati e le immagini inserite, così puoi leggerla e vedere le immagini direttamente. " +
      "Hai tutto il contesto precedente, quindi riprendi esattamente da dove eravamo rimasti: " +
      "stessi obiettivi, decisioni, vincoli e stato attuale. Non riassumermi la cronologia; " +
      "continua semplicemente come se fosse la stessa conversazione.",
    tr:
      "Önceki konuşmamızdan devam et. Sohbet geçmişinin tamamı `conversation-history.pdf` olarak " +
      "ekli — her mesaj, yüklenen dosyaların içeriği satır içine alınmış ve görseller gömülü " +
      "hâlde, böylece okuyabilir ve görselleri doğrudan görebilirsin. Önceki bağlamın tamamı " +
      "sende, o yüzden tam bıraktığımız yerden devam et: aynı hedefler, kararlar, kısıtlar ve " +
      "mevcut durum. Geçmişi bana özetleme; sadece aynı konuşmanın devamıymış gibi sürdür.",
  },

  // ── Verbatim transcript, Markdown (images NOT attached) ───────────────
  preambleMd: {
    en:
      "Continue from our previous conversation. The entire chat history is attached " +
      "as `conversation-history.md` — every message, with any uploaded text files' " +
      "contents inlined. Any images and other files are referenced by name (not " +
      "attached), so you won't see those directly. You have the complete prior " +
      "context, so pick up exactly where we left off — same goals, decisions, " +
      "constraints, and current state. Don't recap the history back to me; just " +
      "continue as if this is the same conversation.",
    es:
      "Continúa nuestra conversación anterior. El historial completo del chat está adjunto como " +
      "`conversation-history.md`: cada mensaje, con el contenido de los archivos de texto subidos " +
      "incorporado. Las imágenes y otros archivos se mencionan por su nombre (no van adjuntos), " +
      "así que no podrás verlos directamente. Tienes todo el contexto previo, así que retoma " +
      "exactamente donde lo dejamos: mismos objetivos, decisiones, restricciones y estado actual. " +
      "No me resumas el historial; simplemente continúa como si fuera la misma conversación.",
    pt_BR:
      "Continue a partir da nossa conversa anterior. O histórico completo está anexado como " +
      "`conversation-history.md` — cada mensagem, com o conteúdo dos arquivos de texto enviados " +
      "incorporado. Imagens e outros arquivos são citados pelo nome (não vão anexados), então " +
      "você não conseguirá vê-los diretamente. Você tem todo o contexto anterior, então retome " +
      "exatamente de onde paramos: mesmos objetivos, decisões, restrições e estado atual. Não me " +
      "resuma o histórico; apenas continue como se fosse a mesma conversa.",
    de:
      "Setze unsere vorherige Unterhaltung fort. Der vollständige Chatverlauf ist als " +
      "`conversation-history.md` angehängt — jede Nachricht, mit den Inhalten hochgeladener " +
      "Textdateien eingebettet. Bilder und andere Dateien werden nur per Name genannt (nicht " +
      "angehängt), du siehst sie also nicht direkt. Du hast den vollständigen bisherigen Kontext, " +
      "mach also genau dort weiter, wo wir aufgehört haben — gleiche Ziele, Entscheidungen, " +
      "Rahmenbedingungen und aktueller Stand. Fasse den Verlauf nicht für mich zusammen; mach " +
      "einfach weiter, als wäre es dieselbe Unterhaltung.",
    fr:
      "Reprends notre conversation précédente. L'historique complet du chat est joint sous le nom " +
      "`conversation-history.md` — chaque message, avec le contenu des fichiers texte téléversés " +
      "intégré. Les images et les autres fichiers sont désignés par leur nom (non joints) : tu ne " +
      "les verras donc pas directement. Tu disposes de tout le contexte antérieur : reprends " +
      "exactement là où nous nous étions arrêtés — mêmes objectifs, décisions, contraintes et " +
      "état actuel. Ne me résume pas l'historique ; continue simplement comme s'il s'agissait de " +
      "la même conversation.",
    ja:
      "前回の会話の続きから進めてください。これまでのチャット履歴はすべて `conversation-history.md` " +
      "として添付されています。すべてのメッセージに加え、アップロードされたテキストファイルの" +
      "内容も取り込まれています。画像やその他のファイルは名前で参照されるだけで添付はされて" +
      "いないため、直接見ることはできません。これまでの文脈はすべて揃っているので、中断した" +
      "ところから正確に再開してください。目標、決定事項、制約、現在の状態はそのままです。" +
      "履歴を要約して返す必要はありません。同じ会話の続きとしてそのまま進めてください。",
    zh_CN:
      "接着我们之前的对话继续。完整的聊天记录已作为 `conversation-history.md` 附上——包含每一条消息，" +
      "上传的文本文件内容已内联。图片和其他文件只按名称引用（未随附），因此你无法直接查看。" +
      "你已经掌握了全部先前的上下文，请从我们停下的地方精确接着往下走：目标、决定、限制条件" +
      "和当前状态都不变。不要把历史内容复述给我，直接当作同一段对话继续即可。",
    ru:
      "Продолжи наш предыдущий разговор. Полная история чата приложена как " +
      "`conversation-history.md` — каждое сообщение, с содержимым загруженных текстовых файлов " +
      "внутри. Изображения и прочие файлы указаны только по имени (не приложены), поэтому " +
      "напрямую ты их не увидишь. У тебя есть весь предыдущий контекст, поэтому продолжай ровно " +
      "с того места, где мы остановились: те же цели, решения, ограничения и текущее состояние. " +
      "Не пересказывай мне историю — просто продолжай, как если бы это был тот же разговор.",
    ko:
      "이전 대화에서 이어서 진행해 주세요. 전체 대화 기록이 `conversation-history.md`로 첨부되어 " +
      "있습니다. 모든 메시지와 함께 업로드된 텍스트 파일의 내용이 포함되어 있습니다. 이미지와 " +
      "기타 파일은 이름으로만 참조되며 첨부되지 않으므로 직접 볼 수는 없습니다. 이전 맥락이 모두 " +
      "갖춰져 있으니 우리가 멈춘 지점에서 정확히 이어가 주세요. 목표와 결정, 제약, 현재 상태는 " +
      "그대로입니다. 기록을 다시 요약해 줄 필요는 없습니다. 같은 대화의 연장선으로 계속 진행해 주세요.",
    it:
      "Riprendi dalla nostra conversazione precedente. L'intera cronologia della chat è allegata " +
      "come `conversation-history.md` — ogni messaggio, con i contenuti dei file di testo caricati " +
      "incorporati. Le immagini e gli altri file sono indicati per nome (non allegati), quindi non " +
      "li vedrai direttamente. Hai tutto il contesto precedente, quindi riprendi esattamente da " +
      "dove eravamo rimasti: stessi obiettivi, decisioni, vincoli e stato attuale. Non " +
      "riassumermi la cronologia; continua semplicemente come se fosse la stessa conversazione.",
    tr:
      "Önceki konuşmamızdan devam et. Sohbet geçmişinin tamamı `conversation-history.md` olarak " +
      "ekli — her mesaj, yüklenen metin dosyalarının içeriği satır içine alınmış hâlde. Görseller " +
      "ve diğer dosyalar yalnızca adlarıyla anılıyor (ekli değil), bu yüzden onları doğrudan " +
      "göremezsin. Önceki bağlamın tamamı sende, o yüzden tam bıraktığımız yerden devam et: aynı " +
      "hedefler, kararlar, kısıtlar ve mevcut durum. Geçmişi bana özetleme; sadece aynı " +
      "konuşmanın devamıymış gibi sürdür.",
  },

  // ── AI handoff brief, PDF ─────────────────────────────────────────────
  // Section names stay English — llm-compressor.js emits them verbatim.
  preambleBriefPdf: {
    en:
      "Continue from our previous conversation. Attached as `conversation-history.pdf` is a " +
      "structured handoff brief of our entire chat so far — organized under Completed work, Current " +
      "state, In progress, Next steps, Constraints, Critical context, and Discarded attempts, with " +
      "images embedded inline and files referenced by name, each with a one-line note. " +
      "This brief is your complete prior context — pick up exactly where we left off. Don't recap " +
      "it back to me; just continue as if this is the same conversation.",
    es:
      "Continúa nuestra conversación anterior. Adjunto como `conversation-history.pdf` va un " +
      "resumen de traspaso estructurado de todo nuestro chat hasta ahora, organizado en Completed " +
      "work, Current state, In progress, Next steps, Constraints, Critical context y Discarded " +
      "attempts, con las imágenes insertadas y los archivos mencionados por su nombre, cada uno " +
      "con una nota de una línea. Ese resumen es todo tu contexto previo: retoma exactamente " +
      "donde lo dejamos. No me lo resumas de vuelta; simplemente continúa como si fuera la misma " +
      "conversación.",
    pt_BR:
      "Continue a partir da nossa conversa anterior. Anexado como `conversation-history.pdf` está " +
      "um resumo de transição estruturado de toda a nossa conversa até aqui, organizado em " +
      "Completed work, Current state, In progress, Next steps, Constraints, Critical context e " +
      "Discarded attempts, com as imagens embutidas e os arquivos citados pelo nome, cada um com " +
      "uma nota de uma linha. Esse resumo é todo o seu contexto anterior — retome exatamente de " +
      "onde paramos. Não me resuma de volta; apenas continue como se fosse a mesma conversa.",
    de:
      "Setze unsere vorherige Unterhaltung fort. Als `conversation-history.pdf` ist ein " +
      "strukturiertes Übergabe-Briefing unseres gesamten bisherigen Chats angehängt — gegliedert " +
      "in Completed work, Current state, In progress, Next steps, Constraints, Critical context " +
      "und Discarded attempts, mit eingebetteten Bildern und per Name genannten Dateien, jeweils " +
      "mit einer einzeiligen Notiz. Dieses Briefing ist dein vollständiger bisheriger Kontext — " +
      "mach genau dort weiter, wo wir aufgehört haben. Fasse es nicht für mich zusammen; mach " +
      "einfach weiter, als wäre es dieselbe Unterhaltung.",
    fr:
      "Reprends notre conversation précédente. Le fichier joint `conversation-history.pdf` est une " +
      "synthèse de passation structurée de tout notre échange jusqu'ici — organisée en Completed " +
      "work, Current state, In progress, Next steps, Constraints, Critical context et Discarded " +
      "attempts, avec les images incorporées et les fichiers désignés par leur nom, chacun " +
      "accompagné d'une note d'une ligne. Cette synthèse constitue tout ton contexte antérieur : " +
      "reprends exactement là où nous nous étions arrêtés. Ne me la résume pas ; continue " +
      "simplement comme s'il s'agissait de la même conversation.",
    ja:
      "前回の会話の続きから進めてください。`conversation-history.pdf` として、これまでのやり取り" +
      "全体を構造化した引き継ぎブリーフを添付しています。Completed work、Current state、" +
      "In progress、Next steps、Constraints、Critical context、Discarded attempts の項目に" +
      "整理され、画像は埋め込み、ファイルは名前で参照し、それぞれに一行の注記を付けています。" +
      "このブリーフがこれまでの文脈のすべてです。中断したところから正確に再開してください。" +
      "内容を要約して返す必要はありません。同じ会話の続きとしてそのまま進めてください。",
    zh_CN:
      "接着我们之前的对话继续。随附的 `conversation-history.pdf` 是我们迄今整段对话的结构化交接摘要，" +
      "按 Completed work、Current state、In progress、Next steps、Constraints、Critical context " +
      "和 Discarded attempts 组织，图片已嵌入，文件按名称引用，并各附一行说明。" +
      "这份摘要就是你全部的先前上下文——请从我们停下的地方精确接着往下走。" +
      "不要把它复述给我，直接当作同一段对话继续即可。",
    ru:
      "Продолжи наш предыдущий разговор. В приложении `conversation-history.pdf` — " +
      "структурированная сводка всего нашего разговора на данный момент, разложенная по разделам " +
      "Completed work, Current state, In progress, Next steps, Constraints, Critical context и " +
      "Discarded attempts, со встроенными изображениями и файлами, указанными по имени, каждый с " +
      "однострочной пометкой. Эта сводка — весь твой предыдущий контекст: продолжай ровно с того " +
      "места, где мы остановились. Не пересказывай её мне — просто продолжай, как если бы это был " +
      "тот же разговор.",
    ko:
      "이전 대화에서 이어서 진행해 주세요. `conversation-history.pdf`로 지금까지의 대화 전체를 " +
      "구조화한 인계 요약을 첨부했습니다. Completed work, Current state, In progress, Next steps, " +
      "Constraints, Critical context, Discarded attempts 항목으로 정리되어 있고, 이미지는 삽입되어 " +
      "있으며 파일은 이름으로 참조되고 각각 한 줄 설명이 붙어 있습니다. 이 요약이 이전 맥락의 " +
      "전부입니다. 우리가 멈춘 지점에서 정확히 이어가 주세요. 내용을 다시 요약해 줄 필요는 " +
      "없습니다. 같은 대화의 연장선으로 계속 진행해 주세요.",
    it:
      "Riprendi dalla nostra conversazione precedente. In allegato come `conversation-history.pdf` " +
      "trovi una sintesi di passaggio strutturata di tutta la nostra chat finora — organizzata in " +
      "Completed work, Current state, In progress, Next steps, Constraints, Critical context e " +
      "Discarded attempts, con le immagini incorporate e i file indicati per nome, ciascuno con " +
      "una nota di una riga. Questa sintesi è tutto il tuo contesto precedente: riprendi " +
      "esattamente da dove eravamo rimasti. Non riassumermela; continua semplicemente come se " +
      "fosse la stessa conversazione.",
    tr:
      "Önceki konuşmamızdan devam et. `conversation-history.pdf` olarak ekli olan, şimdiye kadarki " +
      "tüm sohbetimizin yapılandırılmış bir devir özetidir — Completed work, Current state, In " +
      "progress, Next steps, Constraints, Critical context ve Discarded attempts başlıkları " +
      "altında düzenlenmiş, görseller gömülü ve dosyalar adlarıyla anılmış, her biri tek satırlık " +
      "bir notla. Bu özet önceki bağlamının tamamıdır — tam bıraktığımız yerden devam et. Bana " +
      "geri özetleme; sadece aynı konuşmanın devamıymış gibi sürdür.",
  },

  // ── AI handoff brief, Markdown (nothing attached but the .md) ─────────
  preambleBriefMd: {
    en:
      "Continue from our previous conversation. Attached as `conversation-history.md` is a structured " +
      "handoff brief of our entire chat so far — organized under Completed work, Current state, In " +
      "progress, Next steps, Constraints, Critical context, and Discarded attempts, with images and " +
      "files referenced by name (not attached), each with a one-line note. This " +
      "brief is your complete prior context — pick up exactly where we left off. Don't recap it back " +
      "to me; just continue as if this is the same conversation.",
    es:
      "Continúa nuestra conversación anterior. Adjunto como `conversation-history.md` va un resumen " +
      "de traspaso estructurado de todo nuestro chat hasta ahora, organizado en Completed work, " +
      "Current state, In progress, Next steps, Constraints, Critical context y Discarded attempts, " +
      "con las imágenes y los archivos mencionados por su nombre (no adjuntos), cada uno con una " +
      "nota de una línea. Ese resumen es todo tu contexto previo: retoma exactamente donde lo " +
      "dejamos. No me lo resumas de vuelta; simplemente continúa como si fuera la misma conversación.",
    pt_BR:
      "Continue a partir da nossa conversa anterior. Anexado como `conversation-history.md` está um " +
      "resumo de transição estruturado de toda a nossa conversa até aqui, organizado em Completed " +
      "work, Current state, In progress, Next steps, Constraints, Critical context e Discarded " +
      "attempts, com imagens e arquivos citados pelo nome (não anexados), cada um com uma nota de " +
      "uma linha. Esse resumo é todo o seu contexto anterior — retome exatamente de onde paramos. " +
      "Não me resuma de volta; apenas continue como se fosse a mesma conversa.",
    de:
      "Setze unsere vorherige Unterhaltung fort. Als `conversation-history.md` ist ein " +
      "strukturiertes Übergabe-Briefing unseres gesamten bisherigen Chats angehängt — gegliedert " +
      "in Completed work, Current state, In progress, Next steps, Constraints, Critical context " +
      "und Discarded attempts, wobei Bilder und Dateien nur per Name genannt werden (nicht " +
      "angehängt), jeweils mit einer einzeiligen Notiz. Dieses Briefing ist dein vollständiger " +
      "bisheriger Kontext — mach genau dort weiter, wo wir aufgehört haben. Fasse es nicht für " +
      "mich zusammen; mach einfach weiter, als wäre es dieselbe Unterhaltung.",
    fr:
      "Reprends notre conversation précédente. Le fichier joint `conversation-history.md` est une " +
      "synthèse de passation structurée de tout notre échange jusqu'ici — organisée en Completed " +
      "work, Current state, In progress, Next steps, Constraints, Critical context et Discarded " +
      "attempts, les images et les fichiers étant désignés par leur nom (non joints), chacun " +
      "accompagné d'une note d'une ligne. Cette synthèse constitue tout ton contexte antérieur : " +
      "reprends exactement là où nous nous étions arrêtés. Ne me la résume pas ; continue " +
      "simplement comme s'il s'agissait de la même conversation.",
    ja:
      "前回の会話の続きから進めてください。`conversation-history.md` として、これまでのやり取り" +
      "全体を構造化した引き継ぎブリーフを添付しています。Completed work、Current state、" +
      "In progress、Next steps、Constraints、Critical context、Discarded attempts の項目に" +
      "整理され、画像やファイルは名前で参照されるだけで添付はされておらず、それぞれに一行の" +
      "注記が付いています。このブリーフがこれまでの文脈のすべてです。中断したところから正確に" +
      "再開してください。内容を要約して返す必要はありません。同じ会話の続きとしてそのまま" +
      "進めてください。",
    zh_CN:
      "接着我们之前的对话继续。随附的 `conversation-history.md` 是我们迄今整段对话的结构化交接摘要，" +
      "按 Completed work、Current state、In progress、Next steps、Constraints、Critical context " +
      "和 Discarded attempts 组织，图片和文件仅按名称引用（未随附），并各附一行说明。" +
      "这份摘要就是你全部的先前上下文——请从我们停下的地方精确接着往下走。" +
      "不要把它复述给我，直接当作同一段对话继续即可。",
    ru:
      "Продолжи наш предыдущий разговор. В приложении `conversation-history.md` — " +
      "структурированная сводка всего нашего разговора на данный момент, разложенная по разделам " +
      "Completed work, Current state, In progress, Next steps, Constraints, Critical context и " +
      "Discarded attempts; изображения и файлы указаны только по имени (не приложены), каждый с " +
      "однострочной пометкой. Эта сводка — весь твой предыдущий контекст: продолжай ровно с того " +
      "места, где мы остановились. Не пересказывай её мне — просто продолжай, как если бы это был " +
      "тот же разговор.",
    ko:
      "이전 대화에서 이어서 진행해 주세요. `conversation-history.md`로 지금까지의 대화 전체를 " +
      "구조화한 인계 요약을 첨부했습니다. Completed work, Current state, In progress, Next steps, " +
      "Constraints, Critical context, Discarded attempts 항목으로 정리되어 있으며, 이미지와 파일은 " +
      "이름으로만 참조되고(첨부되지 않음) 각각 한 줄 설명이 붙어 있습니다. 이 요약이 이전 맥락의 " +
      "전부입니다. 우리가 멈춘 지점에서 정확히 이어가 주세요. 내용을 다시 요약해 줄 필요는 " +
      "없습니다. 같은 대화의 연장선으로 계속 진행해 주세요.",
    it:
      "Riprendi dalla nostra conversazione precedente. In allegato come `conversation-history.md` " +
      "trovi una sintesi di passaggio strutturata di tutta la nostra chat finora — organizzata in " +
      "Completed work, Current state, In progress, Next steps, Constraints, Critical context e " +
      "Discarded attempts, con immagini e file indicati per nome (non allegati), ciascuno con una " +
      "nota di una riga. Questa sintesi è tutto il tuo contesto precedente: riprendi esattamente " +
      "da dove eravamo rimasti. Non riassumermela; continua semplicemente come se fosse la stessa " +
      "conversazione.",
    tr:
      "Önceki konuşmamızdan devam et. `conversation-history.md` olarak ekli olan, şimdiye kadarki " +
      "tüm sohbetimizin yapılandırılmış bir devir özetidir — Completed work, Current state, In " +
      "progress, Next steps, Constraints, Critical context ve Discarded attempts başlıkları " +
      "altında düzenlenmiş, görseller ve dosyalar yalnızca adlarıyla anılmış (ekli değil), her " +
      "biri tek satırlık bir notla. Bu özet önceki bağlamının tamamıdır — tam bıraktığımız yerden " +
      "devam et. Bana geri özetleme; sadece aynı konuşmanın devamıymış gibi sürdür.",
  },
};

module.exports = { PREAMBLES };
