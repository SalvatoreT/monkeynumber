// Main thread: collect the target word, fan the search out across one WASM
// worker per CPU core, and render the winning seed as a runnable Ruby command.

const form = document.getElementById('word-input-form');
const input = document.getElementById('target-word-input');
const resultRow = document.getElementById('monkey-result-row');
const result = document.getElementById('monkey-result');
const status = document.getElementById('monkey-status');
const monkeys = document.querySelectorAll('.typewriter-monkey');

// "abc" -> [0, 1, 2]; non-lowercase-letters are dropped, matching the original.
function stringToIndexArray(string) {
  return Array.from(string.toLowerCase())
    .filter((ch) => ch >= 'a' && ch <= 'z')
    .map((ch) => ch.charCodeAt(0) - 97);
}

function displayAnswer(seed, length) {
  return `ruby -e "srand(${seed});puts ${length}.times.map{rand(97..123).chr}.join"`;
}

function startAnimation() {
  monkeys.forEach((m) => m.classList.add('animated'));
}

function stopAnimation() {
  setTimeout(() => monkeys.forEach((m) => m.classList.remove('animated')), 1000);
}

let workers = [];

function stopWorkers() {
  workers.forEach((w) => w.terminate());
  workers = [];
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const indices = stringToIndexArray(input.value);
  if (indices.length === 0) return; // nothing to search for
  const targetArray = Uint8Array.from(indices);

  stopWorkers();
  form.hidden = true;
  resultRow.classList.add('hidden');
  startAnimation();

  const numWorkers = navigator.hardwareConcurrency || 4;
  let tried = 0;
  let done = false;

  const formatCount = (n) => n.toLocaleString();
  if (status) status.textContent = 'Searching…';

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(new URL('./monkey.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      if (done) return;
      switch (e.data.type) {
        case 'completed':
          done = true;
          stopWorkers();
          result.textContent = displayAnswer(e.data.seed, targetArray.length);
          resultRow.classList.remove('hidden');
          if (status) status.textContent = `Found it — monkey number ${formatCount(e.data.seed)}.`;
          stopAnimation();
          break;
        case 'progress':
          tried += e.data.tried;
          if (status) status.textContent = `Searching… ${formatCount(tried)} seeds tried`;
          break;
        default:
          break;
      }
    };

    worker.postMessage({ targetArray, start: i, stride: numWorkers });
    workers.push(worker);
  }
});
