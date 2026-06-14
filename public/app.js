// Main thread: collect the target word, fan the search out across one WASM worker
// per CPU core, render one monkey per worker showing how close it has gotten to
// the target, and show the winning seed as a runnable Ruby command.

const form = document.getElementById('word-input-form');
const input = document.getElementById('target-word-input');
const idleMonkey = document.getElementById('idle-monkey');
const monkeysEl = document.getElementById('monkeys');
const resultRow = document.getElementById('monkey-result-row');
const result = document.getElementById('monkey-result');
const status = document.getElementById('monkey-status');

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

let workers = [];
function stopWorkers() {
  workers.forEach((w) => w.terminate());
  workers = [];
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

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const indices = stringToIndexArray(input.value);
  if (indices.length === 0) return; // nothing to search for
  const targetArray = Uint8Array.from(indices);
  const word = indices.map((i) => String.fromCharCode(97 + i)).join('');

  stopWorkers();
  form.hidden = true;
  idleMonkey.classList.add('hidden');
  resultRow.classList.add('hidden');

  const numWorkers = navigator.hardwareConcurrency || 4;
  const cards = buildMonkeys(numWorkers, word);
  monkeysEl.classList.remove('hidden');

  let tried = 0;
  let done = false;
  status.textContent = `Searching with ${numWorkers} monkeys…`;

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
          done = true;
          stopWorkers();
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
          status.textContent = `Searching… ${formatCount(tried)} seeds tried`;
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
