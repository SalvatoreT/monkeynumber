// Main thread: collect the target word, fan the search out across one WASM worker
// per CPU core, render one monkey per worker showing how close it has gotten to
// the target, drive the header progress bar + ETA over the 2^32 seed space, and
// show the winning seed as a runnable Ruby command.

const form = document.getElementById('word-input-form');
const input = document.getElementById('target-word-input');
const goButton = document.getElementById('go-button');
const inputHint = document.getElementById('input-hint');
const idleMonkey = document.getElementById('idle-monkey');
const monkeysEl = document.getElementById('monkeys');
const resultRow = document.getElementById('monkey-result-row');
const result = document.getElementById('monkey-result');
const status = document.getElementById('monkey-status');
const progressEl = document.getElementById('search-progress');
const progressFill = document.getElementById('progress-fill');
const progressMeta = document.getElementById('progress-meta');
const controlsRow = document.getElementById('controls-row');
const startOverBtn = document.getElementById('start-over');

const U32 = 2 ** 32; // size of the seed space every search sweeps

// Each generated letter is one of 27 equally likely values (Ruby's rand(97..123)
// minus 97), so a word of L letters is reproduced by a random seed with
// probability (1/27)^L and the 2^32 space holds ~2^32 / 27^L matches. Past 7
// letters that expected count drops well below 1 (27^7 ≈ 1.0e10 > 2^32), so the
// word almost never has a monkey number — reject those before a doomed sweep.
const MAX_WORD_LENGTH = 7;

// "abc" -> [0, 1, 2]; non-lowercase letters are dropped, matching the original.
function stringToIndexArray(string) {
  return Array.from(string.toLowerCase())
    .filter((ch) => ch >= 'a' && ch <= 'z')
    .map((ch) => ch.charCodeAt(0) - 97);
}

function displayAnswer(seed, length) {
  return `ruby -e "srand(${seed});puts ${length}.times.map{rand(97..123).chr}.join"`;
}

const formatCount = (n) => n.toLocaleString();

// One decimal below 10% (where whole numbers would read 0 for a while), whole
// numbers above.
const formatPct = (p) => `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;

// Human-readable "time remaining" from a seconds estimate.
function formatEta(sec) {
  if (!isFinite(sec)) return 'estimating…';
  if (sec < 1) return '<1s';
  if (sec < 60) return `~${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `~${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `~${h}h ${m % 60}m`;
}

let workers = [];
function stopWorkers() {
  workers.forEach((w) => w.terminate());
  workers = [];
}

// Restore the pristine idle screen (idle monkey + form) after a search finishes.
function resetToIdle() {
  stopWorkers();
  monkeysEl.classList.add('hidden');
  monkeysEl.textContent = '';
  resultRow.classList.add('hidden');
  controlsRow.classList.add('hidden');
  progressEl.classList.add('hidden');
  progressFill.style.width = '0%';
  progressMeta.textContent = '';
  status.textContent = '';
  idleMonkey.classList.remove('hidden');
  form.hidden = false;
  input.focus();
  input.select();
}

// Disable "Go!" (and explain why) for empty input or words too long to ever have
// a monkey number. Runs live as the user types and once on load.
function validateInput() {
  const length = stringToIndexArray(input.value).length;
  if (length > MAX_WORD_LENGTH) {
    goButton.disabled = true;
    inputHint.textContent =
      `${length} letters is too unlikely to have a monkey number under 2³² — try ${MAX_WORD_LENGTH} letters or fewer.`;
    inputHint.classList.remove('hidden');
  } else {
    goButton.disabled = length === 0;
    inputHint.textContent = '';
    inputHint.classList.add('hidden');
  }
}

// One monkey card per worker; returns handles for live updates.
function buildMonkeys(count, word) {
  monkeysEl.textContent = '';
  const cards = [];
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'monkey-card';

    const sprite = document.createElement('div');
    sprite.className = 'typewriter-monkey mini-monkey animated';

    const best = document.createElement('div');
    best.className = 'monkey-best';
    const hit = document.createElement('span');
    hit.className = 'hit';
    const miss = document.createElement('span');
    miss.className = 'miss';
    miss.textContent = word; // the goal, faded; fills in as the monkey matches
    best.append(hit, miss);

    card.append(sprite, best);
    monkeysEl.append(card);
    cards.push({ card, sprite, hit, miss, best: 0 });
  }
  return cards;
}

// Show that this monkey has reproduced the first `len` letters of `word`.
function setClosest(card, word, len) {
  card.best = len;
  card.hit.textContent = word.slice(0, len);
  card.miss.textContent = word.slice(len);
}

input.addEventListener('input', validateInput);
startOverBtn.addEventListener('click', resetToIdle);
validateInput();

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const indices = stringToIndexArray(input.value);
  if (indices.length === 0 || indices.length > MAX_WORD_LENGTH) return; // nothing valid to search for
  const targetArray = Uint8Array.from(indices);
  const word = indices.map((i) => String.fromCharCode(97 + i)).join('');

  // Each generated letter is 1 of 27 equally likely values, so a hit takes ~27^L
  // seeds on average. Calibrate progress/ETA to that, capped at the space we sweep
  // (for 7-letter words 27^L already exceeds 2^32, so the cap keeps full-scan feel).
  const targetSpan = Math.min(27 ** indices.length, U32);

  stopWorkers();
  form.hidden = true;
  idleMonkey.classList.add('hidden');
  resultRow.classList.add('hidden');
  controlsRow.classList.add('hidden');

  const numWorkers = navigator.hardwareConcurrency || 4;
  const cards = buildMonkeys(numWorkers, word);
  monkeysEl.classList.remove('hidden');

  let tried = 0;
  let done = false;
  let exhaustedCount = 0;
  const startTime = performance.now();
  status.textContent = `Searching with ${numWorkers} monkeys…`;
  progressFill.style.width = '0%';
  progressMeta.textContent = 'Searching…';
  progressEl.classList.remove('hidden');

  // Progress messages arrive hundreds of times per second; coalesce the DOM
  // writes (fill width + meta line) to at most one per animation frame.
  let rafPending = false;
  function scheduleRender() {
    if (rafPending || done) return;
    rafPending = true;
    requestAnimationFrame(renderProgress);
  }
  function renderProgress() {
    rafPending = false;
    if (done) return;
    const frac = Math.min(tried / targetSpan, 1);
    const elapsed = (performance.now() - startTime) / 1000;
    const rate = elapsed > 0 ? tried / elapsed : 0; // seeds/sec
    const eta = rate > 0 ? Math.max(targetSpan - tried, 0) / rate : Infinity;
    // Hold the fill just shy of full while still grinding so it never parks at 100%.
    progressFill.style.width = `${(Math.min(frac, 0.99) * 100).toFixed(1)}%`;
    progressEl.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    const etaText = frac >= 1 ? 'any moment now…' : `${formatEta(eta)} left`;
    progressMeta.textContent =
      `Searching… ${formatCount(tried)} seeds · ${formatPct(frac * 100)} · ${etaText}`;
  }

  // Search is over (found or fully swept): stop everyone, retire the header
  // progress bar, and offer "Start over".
  function finish() {
    done = true;
    stopWorkers();
    progressEl.classList.add('hidden');
    controlsRow.classList.remove('hidden');
  }

  for (let i = 0; i < numWorkers; i++) {
    const card = cards[i];
    const worker = new Worker(new URL('./monkey.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      if (done && e.data.type !== 'completed') return;
      switch (e.data.type) {
        case 'completed': {
          if (done) break;
          finish();
          setClosest(card, word, word.length); // winner reached the full word
          card.card.classList.add('winner');
          result.textContent = displayAnswer(e.data.seed, targetArray.length);
          resultRow.classList.remove('hidden');
          status.textContent = `Found it — monkey number ${formatCount(e.data.seed)}.`;
          // Let the winner take a victory lap, then settle every monkey.
          setTimeout(() => cards.forEach((c) => c.sprite.classList.remove('animated')), 1200);
          break;
        }
        case 'progress': {
          tried += e.data.tried;
          if (e.data.best > card.best) setClosest(card, word, e.data.best);
          scheduleRender();
          break;
        }
        case 'exhausted': {
          // Every worker has swept its slice without a hit: no seed exists.
          exhaustedCount += 1;
          if (exhaustedCount < numWorkers) break;
          finish();
          cards.forEach((c) => c.sprite.classList.remove('animated'));
          status.textContent = `No monkey number under 2³² spells “${word}.” Try a shorter word.`;
          break;
        }
        default:
          break;
      }
    };

    worker.postMessage({ targetArray, start: i, stride: numWorkers });
    workers.push(worker);
  }
});
