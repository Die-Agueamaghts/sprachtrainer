/* ============================================================
   SPRACHTRAINER — App-Logik
   ============================================================ */

const LANGS = {
  de: { label: "Deutsch", native: "Deutsch", dir: "ltr" },
  en: { label: "Englisch", native: "English", dir: "ltr" },
  fr: { label: "Französisch", native: "Français", dir: "ltr" },
  ar: { label: "Arabisch", native: "العربية", dir: "rtl" },
};

const SPEECH_LANGS = { de: "de-DE", en: "en-US", fr: "fr-FR", ar: "ar-SA" };

const state = {
  topicsIndex: [],
  topicSentences: {}, // id -> array of sentences
  topicsLoaded: false,
  settings: null, // { source, targets[], mode, shuffle, limit }
  pool: [], // sentences for current session
  current: 0,
  results: [], // per-sentence result objects
  checked: false, // whether current test item has been checked
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- Theme ---------------- */
(function initTheme() {
  const saved = localStorage.getItem("sprachtrainer_theme");
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
})();
$("#themeToggle").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("sprachtrainer_theme", next);
});

/* ---------------- Screens ---------------- */
function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
  $("#main").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------- Setup: build language chips ---------------- */
function buildLangChips() {
  const sourceWrap = $("#sourceLangs");
  const targetWrap = $("#targetLangs");
  sourceWrap.innerHTML = "";
  targetWrap.innerHTML = "";

  Object.entries(LANGS).forEach(([code, info]) => {
    // source: radio
    const sLabel = document.createElement("label");
    sLabel.className = "chip";
    sLabel.innerHTML = `
      <input type="radio" name="sourceLang" value="${code}" ${code === "de" ? "checked" : ""}>
      <span>${code.toUpperCase()} <span class="chip-native">${info.native}</span></span>`;
    sourceWrap.appendChild(sLabel);

    // target: checkbox
    const tLabel = document.createElement("label");
    tLabel.className = "chip";
    tLabel.innerHTML = `
      <input type="checkbox" name="targetLang" value="${code}" ${code === "en" ? "checked" : ""}>
      <span>${code.toUpperCase()} <span class="chip-native">${info.native}</span></span>`;
    targetWrap.appendChild(tLabel);
  });

  // keep target choices from including the source language
  sourceWrap.addEventListener("change", () => {
    syncTargetAvailability();
    updateVoiceStatus();
  });
  syncTargetAvailability();
  updateVoiceStatus();
}

function updateVoiceStatus() {
  const wrap = document.getElementById("voiceStatus");
  if (!wrap) return;

  if (!window.speechSynthesis) {
    wrap.innerHTML = '<span class="voice-status-item is-unknown"><span class="voice-status-dot"></span>Vorlesen nicht unterstützt</span>';
    return;
  }

  const voices = window.speechSynthesis.getVoices?.() || [];
  const status = Object.entries(LANGS)
    .map(([code, info]) => {
      const hasVoice = voices.some((voice) => {
        const lang = (voice.lang || "").toLowerCase();
        const key = (SPEECH_LANGS[code] || "").toLowerCase();
        return lang === key || lang.startsWith(key.split("-")[0]);
      });
      return `
        <span class="voice-status-item ${hasVoice ? "is-ready" : "is-unknown"}">
          <span class="voice-status-dot"></span>
          ${info.native}: ${hasVoice ? "vorlesbar" : "keine Stimme"}
        </span>
      `;
    })
    .join("");

  wrap.innerHTML = status;
}

function syncTargetAvailability() {
  const sourceEl = $('input[name="sourceLang"]:checked');
  const source = sourceEl ? sourceEl.value : undefined;
  $$('input[name="targetLang"]').forEach((cb) => {
    if (cb.value === source) {
      cb.checked = false;
      cb.disabled = true;
    } else {
      cb.disabled = false;
    }
  });
}

function syncSelectionClasses() {
  $$(".mode-card, .topic-card").forEach((card) => {
    const input = $("input", card);
    card.classList.toggle("is-selected", input && input.checked);
  });
}

/* ---------------- Setup: load topics ---------------- */
async function loadTopicsIndex() {
  const wrap = $("#topicCards");
  try {
    const res = await fetch("data/topics.json");
    if (!res.ok) throw new Error("topics.json nicht gefunden");
    state.topicsIndex = await res.json();
  } catch (err) {
    wrap.innerHTML = `<p class="muted-note">Themen konnten nicht geladen werden (${escapeHtml(err.message)}). Läuft die Seite über einen lokalen Server?</p>`;
    return;
  }

  wrap.innerHTML = "";
  for (const topic of state.topicsIndex) {
    const card = document.createElement("label");
    card.className = "topic-card";
    card.innerHTML = `
      <input type="checkbox" name="topic" value="${topic.id}" checked>
      <span class="topic-name">${topic.name.de}</span>
      <span class="topic-count" data-count-for="${topic.id}">wird geladen…</span>`;
    wrap.appendChild(card);
  }

  // fetch each topic file in the background to show sentence counts and cache data
  await Promise.all(
    state.topicsIndex.map(async (topic) => {
      try {
        const res = await fetch(`data/${topic.file}`);
        const json = await res.json();
        state.topicSentences[topic.id] = json.sentences || [];
        const countEl = $(`[data-count-for="${topic.id}"]`);
        if (countEl) countEl.textContent = `${json.sentences.length} Sätze`;
      } catch (err) {
        const countEl = $(`[data-count-for="${topic.id}"]`);
        if (countEl) countEl.textContent = "Fehler beim Laden";
        state.topicSentences[topic.id] = [];
      }
    }),
  );
  state.topicsLoaded = true;
  $("#startBtn").disabled = false;
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

/* ---------------- Setup: restore last settings ---------------- */
function restoreLastSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("sprachtrainer_settings") || "null",
    );
    if (!saved) return;
    if (saved.source) {
      const el = document.querySelector(
        `input[name="sourceLang"][value="${saved.source}"]`,
      );
      if (el) el.checked = true;
    }
    syncTargetAvailability();
    if (Array.isArray(saved.targets)) {
      $$('input[name="targetLang"]').forEach((cb) => {
        cb.checked = saved.targets.includes(cb.value) && !cb.disabled;
      });
    }
    if (saved.mode) {
      const el = document.querySelector(
        `input[name="mode"][value="${saved.mode}"]`,
      );
      if (el) el.checked = true;
    }
    if (typeof saved.shuffle === "boolean")
      $("#shuffleToggle").checked = saved.shuffle;
    if (saved.limit !== undefined)
      $("#sessionLength").value = String(saved.limit);
  } catch (e) {
    /* ignore malformed storage */
  }
}

/* ---------------- Start session ---------------- */
function gatherSettings() {
  const sourceEl = $('input[name="sourceLang"]:checked');
  const source = sourceEl ? sourceEl.value : undefined;
  const targets = $$('input[name="targetLang"]:checked').map((cb) => cb.value);
  const modeEl = $('input[name="mode"]:checked');
  const mode = (modeEl ? modeEl.value : null) || "learn";
  const topics = $$('input[name="topic"]:checked').map((cb) => cb.value);
  const shuffle = $("#shuffleToggle").checked;
  const limit = parseInt($("#sessionLength").value, 10) || 0;
  return { source, targets, mode, topics, shuffle, limit };
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

$("#startBtn").addEventListener("click", () => {
  if (!state.topicsLoaded) {
    showSetupError("Die Sätze werden noch geladen. Bitte kurz warten.");
    return;
  }
  const settings = gatherSettings();
  const errorEl = $("#setupError");
  errorEl.hidden = true;

  if (!settings.source) {
    showSetupError("Bitte eine Ausgangssprache wählen.");
    return;
  }
  if (settings.targets.length === 0) {
    showSetupError("Bitte mindestens eine Zielsprache wählen.");
    return;
  }
  if (settings.topics.length === 0) {
    showSetupError("Bitte mindestens ein Thema wählen.");
    return;
  }

  // build sentence pool from selected topics, keep only sentences that
  // actually contain the source language and all chosen target languages
  let pool = [];
  settings.topics.forEach((id) => {
    (state.topicSentences[id] || []).forEach((s) => pool.push(s));
  });
  pool = pool.filter(
    (s) => s[settings.source] && settings.targets.every((t) => s[t]),
  );

  if (pool.length === 0) {
    showSetupError(
      "Für diese Sprachkombination liegen in den gewählten Themen keine Sätze vor.",
    );
    return;
  }

  if (settings.shuffle) pool = shuffleArray(pool);
  if (settings.limit > 0) pool = pool.slice(0, settings.limit);

  localStorage.setItem(
    "sprachtrainer_settings",
    JSON.stringify({
      source: settings.source,
      targets: settings.targets,
      mode: settings.mode,
      shuffle: settings.shuffle,
      limit: settings.limit,
    }),
  );

  state.settings = settings;
  state.pool = pool;
  state.current = 0;
  state.results = [];

  startStudy();
});

function showSetupError(msg) {
  const el = $("#setupError");
  el.textContent = msg;
  el.hidden = false;
}

/* ---------------- Study screen ---------------- */
function startStudy() {
  $("#scoreLive").hidden = state.settings.mode !== "test";
  $("#studyHint").textContent =
    state.settings.mode === "test"
      ? "Enter drücken oder auf „Weiter“ klicken, um zu prüfen."
      : "Enter drücken oder auf „Weiter“ klicken für den nächsten Satz.";
  showScreen("studyScreen");
  renderCurrentItem();
}

function stopReading() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  $$(".read-btn").forEach((button) => {
    button.classList.remove("is-speaking");
    button.setAttribute(
      "aria-label",
      button.dataset.defaultLabel || "Vorlesen",
    );
    button.title = button.dataset.defaultTitle || "Vorlesen";
  });
}

function getPreferredVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const langKey = (SPEECH_LANGS[lang] || lang || "").toLowerCase();
  const exact = voices.find(
    (voice) => voice.lang && voice.lang.toLowerCase() === langKey,
  );
  if (exact) return exact;

  const familyMatch = voices.find((voice) => {
    const voiceLang = (voice.lang || "").toLowerCase();
    return voiceLang.startsWith(langKey.split("-")[0]);
  });
  if (familyMatch) return familyMatch;

  return voices.find((voice) => /^(de|en|fr|ar)/i.test(voice.lang || "")) || null;
}

function showVoiceWarning(lang) {
  const messageEl = document.getElementById("voiceWarning");
  if (!messageEl) return;
  const name = LANGS[lang]?.label || lang?.toUpperCase() || "Sprache";
  messageEl.textContent = `Keine passende ${name}-Stimme gefunden. Das Vorlesen ist in diesem Browser/Computer nicht verfügbar.`;
  messageEl.hidden = false;
}

function hideVoiceWarning() {
  const messageEl = document.getElementById("voiceWarning");
  if (messageEl) messageEl.hidden = true;
}

function ensureVoiceNoticeForLanguage(lang) {
  if (!window.speechSynthesis) {
    showVoiceWarning(lang);
    return;
  }
  const voice = getPreferredVoice(lang);
  if (!voice) {
    showVoiceWarning(lang);
    return;
  }
  hideVoiceWarning();
}

function readText(text, lang, button = null) {
  if (!window.speechSynthesis) {
    showVoiceWarning(lang);
    return;
  }
  if (button && button.classList.contains("is-speaking")) {
    stopReading();
    return;
  }

  const voice = getPreferredVoice(lang);
  if (!voice) {
    showVoiceWarning(lang);
    return;
  }

  stopReading();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANGS[lang] || lang || "de-DE";
  utterance.voice = voice;
  utterance.rate = 0.9;
  utterance.onend = stopReading;
  utterance.onerror = stopReading;
  if (button) {
    button.classList.add("is-speaking");
    button.setAttribute("aria-label", "Vorlesen stoppen");
    button.title = "Vorlesen stoppen";
  }
  window.speechSynthesis.speak(utterance);
}

function readCurrentSentence() {
  const { source } = state.settings;
  readText(state.pool[state.current][source], source, $("#readSentenceBtn"));
}

$("#readSentenceBtn").addEventListener("click", readCurrentSentence);

$("#voiceTestBtn").addEventListener("click", () => {
  const sourceEl = $('input[name="sourceLang"]:checked');
  const source = sourceEl ? sourceEl.value : "de";
  const sampleText = {
    de: "Hallo, wie geht es dir?",
    en: "Hello, how are you?",
    fr: "Bonjour, comment ça va ?",
    ar: "مرحبا، كيف حالك؟",
  }[source] || "Hallo";
  readText(sampleText, source);
});

function updateProgress() {
  const total = state.pool.length;
  const idx = state.current + 1;
  $("#progressLabel").textContent = `${idx} / ${total}`;
  $("#progressFill").style.width = `${(state.current / total) * 100}%`;

  const correct = state.results.filter((r) => r.allCorrect).length;
  const wrong = state.results.filter((r) => !r.allCorrect).length;
  $("#scoreLiveCorrect").textContent = correct;
  $("#scoreLiveWrong").textContent = wrong;
}

function renderCurrentItem() {
  stopReading();
  hideVoiceWarning();
  state.checked = false;
  const sentence = state.pool[state.current];
  const { source, targets, mode } = state.settings;

  if (source) ensureVoiceNoticeForLanguage(source);
  if (Array.isArray(targets)) {
    const missingTarget = targets.find((lang) => !getPreferredVoice(lang));
    if (missingTarget) showVoiceWarning(missingTarget);
  }

  updateProgress();

  const card = $("#sentenceCard");
  card.classList.remove("index-card");
  void card.offsetWidth;
  card.classList.add("index-card"); // restart animation

  const tag = $("#sourceTag");
  tag.textContent = source.toUpperCase();
  tag.removeAttribute("data-rtl");
  if (LANGS[source].dir === "rtl") tag.setAttribute("data-rtl", "1");

  const sourceEl = $("#sourceSentence");
  sourceEl.textContent = sentence[source];
  sourceEl.setAttribute("lang", source);
  sourceEl.setAttribute("dir", LANGS[source].dir);

  const learnWrap = $("#learnAnswers");
  const testWrap = $("#testAnswers");

  if (mode === "learn") {
    testWrap.style.display = "none";
    learnWrap.style.display = "flex";
    learnWrap.innerHTML = "";
    targets.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "answer-row";
      row.style.animationDelay = `${i * 60}ms`;
      row.setAttribute("dir", LANGS[t].dir);
      row.innerHTML = `
        <span class="answer-tag">${t.toUpperCase()}</span>
        <span class="answer-text" lang="${t}">${escapeHtml(sentence[t])}</span>
        <button class="read-btn answer-read-btn" type="button" aria-label="Übersetzung vorlesen" title="Übersetzung vorlesen" data-default-label="Übersetzung vorlesen" data-default-title="Übersetzung vorlesen">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 10v4h3l4 3V7l-4 3H4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>`;
      $(".answer-read-btn", row).addEventListener("click", () => {
        readText(sentence[t], t, $(".answer-read-btn", row));
      });
      learnWrap.appendChild(row);
    });
    $("#nextBtn").textContent = "Weiter";
    updateNextButtonIcon();
  } else {
    learnWrap.style.display = "none";
    testWrap.style.display = "flex";
    testWrap.innerHTML = "";
    targets.forEach((t) => {
      const row = document.createElement("div");
      row.className = "test-row";
      row.dataset.lang = t;
      const dir = LANGS[t].dir;
      row.innerHTML = `
        <label class="test-row-label" for="input-${t}">Übersetzung — ${t.toUpperCase()}</label>
        <div class="test-input-wrap">
          <input class="test-input" id="input-${t}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" lang="${t}" dir="${dir}">
          <span class="result-icon icon-correct" hidden>
            <svg viewBox="0 0 20 20" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 10.5l4 4 8-9"/></svg>
          </span>
          <span class="result-icon icon-wrong" hidden>
            <svg viewBox="0 0 20 20" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 5l10 10M15 5L5 15"/></svg>
          </span>
        </div>
        <p class="correct-answer-hint" lang="${t}" dir="${dir}"></p>
        <button class="read-btn correct-answer-read" type="button" aria-label="Richtige Übersetzung vorlesen" title="Richtige Übersetzung vorlesen" data-default-label="Richtige Übersetzung vorlesen" data-default-title="Richtige Übersetzung vorlesen" hidden>
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 10v4h3l4 3V7l-4 3H4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>`;
      $(".correct-answer-read", row).addEventListener("click", () => {
        readText(
          sentence[t].split("/")[0].trim(),
          t,
          $(".correct-answer-read", row),
        );
      });
      testWrap.appendChild(row);
    });
    $("#nextBtn").textContent = "Prüfen";
    updateNextButtonIcon();

    // Enter key handling: move to next field, or check on last field
    const inputs = $$(".test-input", testWrap);
    inputs.forEach((input, idx) => {
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (state.checked) {
          advance();
          return;
        }
        if (idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        } else {
          checkAnswers();
        }
      });
    });
    if (inputs[0]) inputs[0].focus();
  }
}

function updateNextButtonIcon() {
  // no-op placeholder kept for clarity/extensibility
}

/* ---------------- Checking answers (test mode) ---------------- */
function normalize(str, lang) {
  let s = (str || "").trim().toLowerCase();
  s = s.replace(/[.,!?;:'"„“”«»¡¿]/g, "");
  s = s.replace(/\s+/g, " ");
  if (lang === "ar") {
    s = s.replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, ""); // tashkeel
    s = s.replace(/[إأآا]/g, "ا");
    s = s.replace(/ى/g, "ي");
    s = s.replace(/ة/g, "ه");
    s = s.replace(/ؤ/g, "و");
    s = s.replace(/ئ/g, "ي");
  }
  return s;
}

function isAnswerCorrect(given, correctRaw, lang) {
  const variants = correctRaw.split("/").map((v) => normalize(v, lang));
  return variants.includes(normalize(given, lang));
}

function checkAnswers() {
  const sentence = state.pool[state.current];
  const rows = $$(".test-row", $("#testAnswers"));
  let allCorrect = true;
  const givenAnswers = {};

  rows.forEach((row) => {
    const lang = row.dataset.lang;
    const input = $(".test-input", row);
    const given = input.value;
    givenAnswers[lang] = given;
    const correctRaw = sentence[lang];
    const ok = isAnswerCorrect(given, correctRaw, lang);
    row.classList.remove("is-correct", "is-wrong");
    row.classList.add(ok ? "is-correct" : "is-wrong");
    input.disabled = true;
    $(".icon-correct", row).hidden = !ok;
    $(".icon-wrong", row).hidden = ok;
    const hint = $(".correct-answer-hint", row);
    hint.textContent = ok ? "" : `Richtig: ${correctRaw.split("/")[0].trim()}`;
    $(".correct-answer-read", row).hidden = ok;
    if (!ok) allCorrect = false;
  });

  state.checked = true;
  state.results.push({ sentence, given: givenAnswers, allCorrect });
  updateProgress();

  $("#nextBtn").textContent =
    state.current < state.pool.length - 1
      ? "Nächster Satz"
      : "Ergebnis anzeigen";
}

/* ---------------- Advance ---------------- */
$("#nextBtn").addEventListener("click", () => {
  if (state.settings.mode === "test" && !state.checked) {
    checkAnswers();
    return;
  }
  if (state.settings.mode === "learn") {
    state.results.push({
      sentence: state.pool[state.current],
      allCorrect: true,
    });
  }
  advance();
});

function advance() {
  if (state.current < state.pool.length - 1) {
    state.current++;
    renderCurrentItem();
  } else {
    finishSession();
  }
}

$("#exitStudyBtn").addEventListener("click", () => {
  if (!confirm("Sitzung abbrechen und zum Menü zurückkehren?")) return;
  stopReading();
  state.pool = [];
  state.current = 0;
  state.results = [];
  state.checked = false;
  showScreen("setupScreen");
});

/* ---------------- Results ---------------- */
function finishSession() {
  const total = state.results.length;
  const correct = state.results.filter((r) => r.allCorrect).length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  $("#resultPercent").textContent = `${percent}%`;
  $("#resultsSummary").textContent =
    state.settings.mode === "test"
      ? `${correct} von ${total} Sätzen vollständig richtig übersetzt.`
      : `${total} Sätze durchgearbeitet.`;

  const mistakes = state.results.filter((r) => !r.allCorrect);
  const mistakesWrap = $("#mistakesWrap");
  const list = $("#mistakesList");
  list.innerHTML = "";

  if (state.settings.mode === "test" && mistakes.length > 0) {
    mistakesWrap.hidden = false;
    mistakes.forEach((m) => {
      const li = document.createElement("li");
      li.className = "mistake-item";
      const sourceText = m.sentence[state.settings.source];
      let rowsHtml = "";
      state.settings.targets.forEach((t) => {
        const given = (m.given[t] || "").trim();
        const correctRaw = m.sentence[t];
        const ok = isAnswerCorrect(given, correctRaw, t);
        if (ok) return;
        rowsHtml += `<div class="mistake-row">
          <span class="mistake-tag">${t.toUpperCase()}</span>
          <span class="given">${escapeHtml(given || "—")}</span>
          <span class="correct">${escapeHtml(correctRaw.split("/")[0].trim())}</span>
        </div>`;
      });
      li.innerHTML = `<p class="mistake-source">${escapeHtml(sourceText)}</p>${rowsHtml}`;
      list.appendChild(li);
    });
    $("#retryMistakesBtn").hidden = false;
  } else {
    mistakesWrap.hidden = true;
    $("#retryMistakesBtn").hidden = true;
  }

  showScreen("resultsScreen");
}

$("#retryMistakesBtn").addEventListener("click", () => {
  const mistakes = state.results
    .filter((r) => !r.allCorrect)
    .map((r) => r.sentence);
  if (mistakes.length === 0) return;
  state.pool = state.settings.shuffle ? shuffleArray(mistakes) : mistakes;
  state.current = 0;
  state.results = [];
  startStudy();
});

$("#restartSameBtn").addEventListener("click", () => {
  let pool = state.pool.slice();
  if (state.settings.shuffle) pool = shuffleArray(pool);
  state.pool = pool;
  state.current = 0;
  state.results = [];
  startStudy();
});

$("#newSelectionBtn").addEventListener("click", () => {
  showScreen("setupScreen");
});

document.addEventListener("change", (event) => {
  if (event.target.matches('input[name="mode"], input[name="topic"]')) {
    syncSelectionClasses();
  }
});

/* ---------------- Init ---------------- */
(async function init() {
  buildLangChips();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = updateVoiceStatus;
  }
  updateVoiceStatus();
  $("#startBtn").disabled = true;
  await loadTopicsIndex();
  restoreLastSettings();
  syncSelectionClasses();
})();
