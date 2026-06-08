// session-model.js — helpers for the normalized session format.
// Provider adapters PRODUCE this shape; core (storage, future handoff builder)
// CONSUMES it. Keeping the shape in one place means adapters stay swappable.
//
// Normalized shape:
// {
//   id, sourceProvider, title, capturedAt, startedAt,
//   stats: { messages, images, files },
//   turns: [ { role, content:[{type:"text",text}], attachments:[{type,mediaId,name}], artifacts:[] } ],
//   media: { [mediaId]: { blob, mimeType, name } }
// }

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  function uuid() {
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback for older runtimes — good enough for local IDs.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function createSession({ title, startedAt = null, sourceProvider = "claude" } = {}) {
    return {
      id: uuid(),
      sourceProvider,
      title: title || "Untitled conversation",
      capturedAt: new Date().toISOString(),
      startedAt: startedAt || null,
      stats: { messages: 0, images: 0, files: 0 },
      turns: [],
      media: {},
    };
  }

  // Stores a blob in the session's media map and returns the generated mediaId.
  // Adapters reference this id from a turn's attachments[].
  function addMedia(session, blob, mimeType, name) {
    const mediaId = uuid();
    session.media[mediaId] = { blob, mimeType: mimeType || (blob && blob.type) || "", name: name || "" };
    return mediaId;
  }

  // Recomputes stats.{messages,images,files,artifacts} from the turns.
  // Call after capture.
  function recomputeStats(session) {
    let images = 0;
    let files = 0;
    let artifacts = 0;
    for (const turn of session.turns) {
      const fromUser = turn.role === "user";
      for (const att of turn.attachments || []) {
        if (att.type === "image") images++;
        // A file YOU uploaded always COUNTS — it's real chat content worth showing,
        // even if its bytes can't be retrieved (e.g. a Claude code-sandbox .zip blob).
        // AI-generated files count only when attachable (mediaId). Whether a counted
        // file can actually be ATTACHED is a SEPARATE check: the "Attach files" toggle
        // keys on mediaId, so an un-fetchable upload shows in the count but offers no
        // attach option (you can't attach what we couldn't capture). Applies to all
        // providers — no per-site special case.
        else if (att.type === "file" && (att.mediaId || fromUser)) files++;
      }
      artifacts += (turn.artifacts || []).length;
    }
    session.stats = { messages: session.turns.length, images, files, artifacts };
    return session.stats;
  }

  Continuum.model = { uuid, createSession, addMedia, recomputeStats };
})();
