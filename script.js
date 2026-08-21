/**
 * TYPEFLOW — PRECISION ENGINE WITH KHMER UNICODE SUPPORT
 */

// ==========================================
// 1. STATE & STORAGE MANAGEMENT
// ==========================================
const STORAGE_KEY = 'typeflow_app_state';

const defaultState = {
  theme: 'dark',
  accent: 'cyan',
  lang: 'en',
  modeType: 'time', // time | words | custom
  timeVal: 30,
  wordsVal: 25,
  contentType: 'words', // words | sentences | quotes
  customText: '',
  settings: {
    sound: true,
    keyboard: true,
    smoothCaret: true,
    fontSize: '2rem'
  },
  stats: {
    en: { bestWpm: 0, bestAcc: 0 },
    km: { bestWpm: 0, bestAcc: 0 },
    totalTests: 0
  }
};

let appState = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

// ==========================================
// 2. TEXT CONTENT LIBRARIES
// ==========================================
const TEXT_CORPUS = {
  en: {
    words: [
      "the", "be", "of", "and", "a", "to", "in", "he", "have", "it", "that", "for",
      "they", "i", "with", "as", "not", "on", "she", "at", "by", "this", "we", "you",
      "do", "but", "from", "or", "which", "one", "would", "all", "will", "there",
      "say", "who", "make", "when", "can", "more", "if", "no", "man", "out", "other",
      "so", "what", "time", "up", "go", "about", "than", "into", "could", "state"
    ],
    sentences: [
      "The quick brown fox jumps over the lazy dog.",
      "Clean code always looks like it was written by someone who cares.",
      "Simplicity is prerequisite for reliability."
    ],
    quotes: [
      "Focus on being productive instead of busy.",
      "Premature optimization is the root of all evil in programming."
    ]
  },
  km: {
    words: [
      "ការអនុវត្ត", "ភាសាខ្មែរ", "កម្ពុជា", "បច្ចេកវិទ្យា", "ចំណេះដឹង", "កុំព្យូទ័រ",
      "អភិវឌ្ឍន៍", "ល្បឿន", "ភាពត្រឹមត្រូវ", "ក្ដារចុច", "សិស្ស", "សាលារៀន", "វិធីសាស្ត្រ"
    ],
    sentences: [
      "ការរៀនវាយអក្សរឱ្យបានលឿន ត្រូវការការអនុវត្តជាប្រចាំ។",
      "ភាសាខ្មែរជាអត្តសញ្ញាណជាតិ និងជាសម្បត្តិវប្បធម៌ដ៏ថ្លៃថ្លា។"
    ],
    quotes: [
      "ចំណេះដឹងគឺជាទ្រព្យសម្បត្តិដែលគ្មាននរណាម្នាក់អាចលួចបានឡើយ។"
    ]
  }
};

const KHMER_NIDA_MAPPING = {
  'q': 'ដ', 'w': 'ដិ', 'e': 'ើ', 'r': 'រ', 't': 'ត', 'y': 'យ', 'u': 'ុ', 'i': 'ិ', 'o': 'ោ', 'p': 'ផ',
  'a': 'ា', 's': 'ស', 'd': 'ដ', 'f': 'ថ', 'g': 'ង', 'h': 'ហ', 'j': 'ញ', 'k': 'ក', 'l': 'ល',
  'z': 'ៗ', 'x': 'ឃ', 'c': 'ច', 'v': 'វ', 'b': 'ប', 'n': 'ន', 'm': 'ម'
};

// ==========================================
// 3. SOUND SYNTHESIZER (WEB AUDIO API)
// ==========================================
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playKeySound(isError = false) {
    if (!appState.settings.sound) return;
    this.init();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (isError) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    }
  }
}

const soundFx = new SoundEffects();

// ==========================================
// 4. KHMER UNICODE & TEXT SEGMENTATION
// ==========================================
function segmentToGraphemes(text, lang) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(lang === 'km' ? 'km' : 'en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), s => s.segment);
  }
  return Array.from(text);
}

// ==========================================
// 5. ENGINE STATE & TYPING LOGIC
// ==========================================
let targetWords = [];          // Array of word grapheme arrays
let flatTargetGraphemes = [];  // Flattened target grapheme elements
let flatCharSpans = [];        // DOM references to span elements
let targetWordSpans = [];      // Word wrapper elements

let activeIndex = 0;
let totalTyped = 0;
let errorCount = 0;

let isTestRunning = false;
let testStartTime = 0;
let timerInterval = null;
let timeRemaining = 30;

function generateTargetText() {
  const lang = appState.lang;
  const contentMode = appState.contentType;

  if (appState.modeType === 'custom' && appState.customText) {
    return appState.customText;
  }

  const pool = TEXT_CORPUS[lang][contentMode] || TEXT_CORPUS[lang]['words'];

  if (contentMode === 'words') {
    const count = appState.modeType === 'words' ? appState.wordsVal : 40;
    let selected = [];
    for (let i = 0; i < count; i++) {
      selected.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return selected.join(' ');
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

function setupTest() {
  const rawText = generateTargetText();
  const wordsRaw = rawText.split(' ');

  const container = document.getElementById('words-container');
  container.innerHTML = '';
  container.style.transform = 'translateY(0px)';

  targetWords = [];
  flatTargetGraphemes = [];
  flatCharSpans = [];
  targetWordSpans = [];

  wordsRaw.forEach((wordRaw, wIdx) => {
    const wordSpan = document.createElement('div');
    wordSpan.className = 'word';

    const wordGraphemes = segmentToGraphemes(wordRaw, appState.lang);

    wordGraphemes.forEach((graph) => {
      const charSpan = document.createElement('span');
      charSpan.className = 'char';
      charSpan.textContent = graph;
      wordSpan.appendChild(charSpan);

      flatTargetGraphemes.push(graph);
      flatCharSpans.push(charSpan);
    });

    // Add trailing space grapheme if not last word
    if (wIdx < wordsRaw.length - 1) {
      const spaceSpan = document.createElement('span');
      spaceSpan.className = 'char';
      spaceSpan.textContent = ' ';
      wordSpan.appendChild(spaceSpan);

      flatTargetGraphemes.push(' ');
      flatCharSpans.push(spaceSpan);
    }

    container.appendChild(wordSpan);
    targetWordSpans.push(wordSpan);
  });

  // Reset Engine Variables
  activeIndex = 0;
  totalTyped = 0;
  errorCount = 0;
  isTestRunning = false;
  clearInterval(timerInterval);

  timeRemaining = appState.modeType === 'time' ? appState.timeVal : 0;

  // UI Resets
  document.getElementById('live-wpm').textContent = '0';
  document.getElementById('live-acc').textContent = '100%';
  document.getElementById('live-timer').textContent = appState.modeType === 'time' ? timeRemaining : '0';
  document.getElementById('timer-label').textContent = appState.modeType === 'time' ? 'SEC' : 'CHARS';

  const caret = document.getElementById('caret');
  caret.classList.add('blink');
  
  // Position initial caret
  setTimeout(updateCaretPosition, 20);
  renderVirtualKeyboard();
}

function startTest() {
  isTestRunning = true;
  testStartTime = Date.now();
  document.getElementById('caret').classList.remove('blink');

  if (appState.modeType === 'time') {
    timerInterval = setInterval(() => {
      timeRemaining--;
      document.getElementById('live-timer').textContent = timeRemaining;
      calculateMetrics();

      if (timeRemaining <= 0) {
        completeTest();
      }
    }, 1000);
  }
}

function handleInput() {
  const inputEl = document.getElementById('type-input');
  const typedVal = inputEl.value;
  inputEl.value = ''; // Flush input buffer immediately

  if (!typedVal) return;

  if (!isTestRunning) {
    startTest();
  }

  const typedGraphemes = segmentToGraphemes(typedVal, appState.lang);

  typedGraphemes.forEach(ch => {
    if (activeIndex >= flatTargetGraphemes.length) return;

    const expectedChar = flatTargetGraphemes[activeIndex];
    const targetSpan = flatCharSpans[activeIndex];

    totalTyped++;

    if (ch === expectedChar) {
      targetSpan.className = 'char correct';
      soundFx.playKeySound(false);
    } else {
      targetSpan.className = 'char incorrect';
      errorCount++;
      soundFx.playKeySound(true);
    }

    activeIndex++;
  });

  if (appState.modeType !== 'time') {
    document.getElementById('live-timer').textContent = `${activeIndex}/${flatTargetGraphemes.length}`;
  }

  calculateMetrics();
  updateCaretPosition();

  if (activeIndex >= flatTargetGraphemes.length) {
    completeTest();
  }
}

function handleKeyDown(e) {
  if (e.key === 'Backspace' && activeIndex > 0 && isTestRunning) {
    activeIndex--;
    flatCharSpans[activeIndex].className = 'char';
    updateCaretPosition();
    calculateMetrics();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    setupTest();
  }

  highlightVirtualKey(e.key);
}

function updateCaretPosition() {
  const caret = document.getElementById('caret');
  if (activeIndex >= flatCharSpans.length) return;

  const currentSpan = flatCharSpans[activeIndex];
  const container = document.getElementById('words-container');
  const stage = document.getElementById('text-stage');

  const spanOffsetTop = currentSpan.offsetTop;
  const spanOffsetLeft = currentSpan.offsetLeft;

  caret.style.left = `${spanOffsetLeft}px`;
  caret.style.top = `${spanOffsetTop}px`;

  // Auto Line Scrolling Handling
  if (spanOffsetTop > 50) {
    container.style.transform = `translateY(-${spanOffsetTop - 10}px)`;
    caret.style.top = `10px`;
  } else {
    container.style.transform = `translateY(0px)`;
  }
}

function calculateMetrics() {
  const elapsedMinutes = Math.max((Date.now() - testStartTime) / 60000, 0.001);
  const correctTyped = Math.max(0, activeIndex - errorCount);
  
  // Standard WPM formula: (Characters / 5) / Minutes
  const wpm = Math.max(0, Math.round((correctTyped / 5) / elapsedMinutes));
  const accuracy = totalTyped > 0 ? Math.round((correctTyped / totalTyped) * 100) : 100;

  document.getElementById('live-wpm').textContent = wpm;
  document.getElementById('live-acc').textContent = `${accuracy}%`;

  return { wpm, accuracy };
}

function completeTest() {
  clearInterval(timerInterval);
  isTestRunning = false;

  const { wpm, accuracy } = calculateMetrics();
  const elapsedSecs = Math.round((Date.now() - testStartTime) / 1000);

  const langKey = appState.lang;
  const prevBest = appState.stats[langKey].bestWpm;
  let isNewBest = false;

  if (wpm > prevBest) {
    appState.stats[langKey].bestWpm = wpm;
    appState.stats[langKey].bestAcc = accuracy;
    isNewBest = true;
  }

  appState.stats.totalTests++;
  saveState();

  // Populate Result Screen Modal
  document.getElementById('res-wpm').textContent = wpm;
  document.getElementById('res-acc').textContent = `${accuracy}%`;
  document.getElementById('res-time').textContent = `${elapsedSecs}s`;
  document.getElementById('res-errors').textContent = errorCount;
  document.getElementById('res-chars').textContent = totalTyped;
  document.getElementById('res-prev-best').textContent = `${prevBest} WPM`;

  const badge = document.getElementById('result-pb-badge');
  if (isNewBest) badge.classList.remove('hidden');
  else badge.classList.add('hidden');

  document.getElementById('modal-result').classList.add('active');
}

// ==========================================
// 6. VIRTUAL KEYBOARD LAYOUT & HIGHLIGHTING
// ==========================================
const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Space']
];

function renderVirtualKeyboard() {
  const container = document.getElementById('virtual-keyboard');
  container.innerHTML = '';

  if (!appState.settings.keyboard) {
    document.getElementById('keyboard-wrapper').classList.add('hidden');
    return;
  }
  document.getElementById('keyboard-wrapper').classList.remove('hidden');

  KEYBOARD_ROWS.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'vk-row';

    row.forEach(key => {
      const keyDiv = document.createElement('div');
      keyDiv.className = 'vk-key' + 
        (key.length > 1 ? ' wide' : '') + 
        (key === 'Space' ? ' extra-wide' : '');
      
      keyDiv.dataset.key = key.toLowerCase();

      let displayLabel = key;
      if (appState.lang === 'km' && KHMER_NIDA_MAPPING[key.toLowerCase()]) {
        displayLabel = KHMER_NIDA_MAPPING[key.toLowerCase()];
      }

      keyDiv.textContent = displayLabel;
      rowDiv.appendChild(keyDiv);
    });

    container.appendChild(rowDiv);
  });
}

function highlightVirtualKey(key) {
  if (!appState.settings.keyboard) return;
  const target = key === ' ' ? 'space' : key.toLowerCase();
  const keys = document.querySelectorAll('.vk-key');

  keys.forEach(k => {
    if (k.dataset.key === target) {
      k.classList.add('active');
      setTimeout(() => k.classList.remove('active'), 130);
    }
  });
}

// ==========================================
// 7. UI CONTROLS & SETTINGS BINDINGS
// ==========================================
function applyTheme() {
  document.documentElement.setAttribute('data-theme', appState.theme);
  document.documentElement.setAttribute('data-accent', appState.accent);
  document.getElementById('btn-theme-toggle').textContent = appState.theme === 'dark' ? '🌙' : '☀️';

  // Apply Font Size
  document.documentElement.style.setProperty('--font-size-typing', appState.settings.fontSize);

  // Apply Caret Mode
  const caret = document.getElementById('caret');
  if (appState.settings.smoothCaret) caret.classList.add('smooth');
  else caret.classList.remove('smooth');
}

function initUIBindings() {
  const stageWrapper = document.getElementById('text-stage-wrapper');
  const typeInput = document.getElementById('type-input');

  // Focus Handling
  stageWrapper.addEventListener('click', () => typeInput.focus());
  typeInput.addEventListener('focus', () => stageWrapper.classList.remove('blur'));
  typeInput.addEventListener('blur', () => stageWrapper.classList.add('blur'));

  typeInput.addEventListener('input', handleInput);
  document.addEventListener('keydown', (e) => {
    if (document.activeElement !== typeInput && e.key !== 'Tab') {
      typeInput.focus();
    }
    handleKeyDown(e);
  });

  // Language Switch
  document.getElementById('btn-lang-en').addEventListener('click', () => {
    appState.lang = 'en';
    updateLangToggleUI();
    setupTest();
  });
  document.getElementById('btn-lang-km').addEventListener('click', () => {
    appState.lang = 'km';
    updateLangToggleUI();
    setupTest();
  });

  // Theme Toggle
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
    saveState();
    applyTheme();
  });

  // Mode Type Selector (Time / Words / Custom)
  document.querySelectorAll('[data-mode-type]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      appState.modeType = e.target.dataset.modeType;
      document.querySelectorAll('[data-mode-type]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      document.getElementById('opt-time').classList.toggle('hidden', appState.modeType !== 'time');
      document.getElementById('opt-words').classList.toggle('hidden', appState.modeType !== 'words');

      if (appState.modeType === 'custom') {
        document.getElementById('modal-custom').classList.add('active');
      } else {
        setupTest();
      }
    });
  });

  // Sub-option Buttons (Time / Words Values)
  document.querySelectorAll('#opt-time .option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      appState.timeVal = Number(e.target.dataset.val);
      document.querySelectorAll('#opt-time .option-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setupTest();
    });
  });

  document.querySelectorAll('#opt-words .option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      appState.wordsVal = Number(e.target.dataset.val);
      document.querySelectorAll('#opt-words .option-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setupTest();
    });
  });

  // Content Type Selector
  document.querySelectorAll('[data-content]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      appState.contentType = e.target.dataset.content;
      document.querySelectorAll('[data-content]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setupTest();
    });
  });

  // Restart Button
  document.getElementById('btn-restart').addEventListener('click', setupTest);

  // Result Restart Button
  document.getElementById('btn-result-restart').addEventListener('click', () => {
    document.getElementById('modal-result').classList.remove('active');
    setupTest();
  });

  // Custom Text Modal Actions
  document.getElementById('btn-custom-cancel').addEventListener('click', () => {
    document.getElementById('modal-custom').classList.remove('active');
  });

  document.getElementById('btn-custom-apply').addEventListener('click', () => {
    const val = document.getElementById('custom-text-input').value.trim();
    if (val) {
      appState.customText = val;
      document.getElementById('modal-custom').classList.remove('active');
      setupTest();
    }
  });

  // Settings Modal Bindings
  document.getElementById('btn-settings-modal').addEventListener('click', () => {
    document.getElementById('modal-settings').classList.add('active');
  });

  document.getElementById('btn-settings-close').addEventListener('click', () => {
    document.getElementById('modal-settings').classList.remove('active');
  });

  document.getElementById('setting-accent').value = appState.accent;
  document.getElementById('setting-accent').addEventListener('change', (e) => {
    appState.accent = e.target.value;
    saveState();
    applyTheme();
  });

  document.getElementById('setting-sound').checked = appState.settings.sound;
  document.getElementById('setting-sound').addEventListener('change', (e) => {
    appState.settings.sound = e.target.checked;
    saveState();
  });

  document.getElementById('setting-keyboard').checked = appState.settings.keyboard;
  document.getElementById('setting-keyboard').addEventListener('change', (e) => {
    appState.settings.keyboard = e.target.checked;
    saveState();
    renderVirtualKeyboard();
  });

  document.getElementById('setting-smooth-caret').checked = appState.settings.smoothCaret;
  document.getElementById('setting-smooth-caret').addEventListener('change', (e) => {
    appState.settings.smoothCaret = e.target.checked;
    saveState();
    applyTheme();
  });

  document.getElementById('setting-fontsize').value = appState.settings.fontSize;
  document.getElementById('setting-fontsize').addEventListener('change', (e) => {
    appState.settings.fontSize = e.target.value;
    saveState();
    applyTheme();
    updateCaretPosition();
  });
}

function updateLangToggleUI() {
  document.getElementById('btn-lang-en').classList.toggle('active', appState.lang === 'en');
  document.getElementById('btn-lang-km').classList.toggle('active', appState.lang === 'km');
}

// ==========================================
// 8. INITIALIZATION ENTRY POINT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  updateLangToggleUI();
  initUIBindings();
  setupTest();
});