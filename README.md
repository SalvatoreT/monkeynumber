# monkeynumber

Given enough time, get Shakespeare.

Type a word and [monkeynumber.xyz](https://monkeynumber.xyz) brute-forces a
Mersenne-Twister seed `S` such that

```shell
ruby -e "srand(S);puts L.times.map{rand(97..123).chr}.join"
```

prints your word (`L` = its length). That seed is the "monkey number."

## How it works

The search is the classic infinite-monkeys idea: try seed after seed until one
produces your target. The hot loop is an MT19937 generator written in **Rust and
compiled to WebAssembly** ([`src/lib.rs`](src/lib.rs)), run client-side across one
Web Worker per CPU core ([`public/monkey.worker.js`](public/monkey.worker.js)),
each sweeping a disjoint slice of the seed space. The generator is bit-exact with
Ruby's `srand`/`rand`, so the emitted command really does reproduce the word.

The site is plain HTML + the WASM module, served by a
[Cloudflare Workers static-assets](https://developers.cloudflare.com/workers/static-assets/)
Worker. No Jekyll, no jQuery, no Bootstrap.

> Practical limit: difficulty grows like `27^L`, so ~5-letter words solve quickly,
> 6 letters can take a while, and longer words are astronomically expensive
> (and may exceed the 32-bit seed space).

## Prerequisites

- [Rust](https://rustup.rs) with the WASM target: `rustup target add wasm32-unknown-unknown`
- [`wasm-pack`](https://drager.github.io/wasm-pack/): `cargo install wasm-pack`
- [Node.js](https://nodejs.org) (for Wrangler)

## Develop

```shell
npm install        # installs wrangler
npm run dev        # builds the WASM, then runs `wrangler dev` at http://localhost:8787
```

`npm run dev` rebuilds the WASM each time; to rebuild on its own:

```shell
npm run build      # scripts/build.sh — installs the toolchain on demand, then wasm-pack build
```

Run the Rust unit tests (MT19937 reference vectors, no WASM needed):

```shell
cargo test
```

## Deploy (Cloudflare Workers)

Deployment runs through [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/),
connected to this Git repo, using the **default commands** — no customization needed:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

`npm run build` ([`scripts/build.sh`](scripts/build.sh)) is self-contained: the Workers
Builds image ships Node but not Rust, so the script installs the Rust toolchain +
wasm-pack on demand (a fast no-op locally, where they already exist), then compiles the
WASM into `public/pkg/`. `npx wrangler deploy` then just uploads `public/` as static
assets — the deploy step needs no toolchain.

### One-time setup

1. **Connect the repo** — dashboard → Workers & Pages → Create → **Workers** →
   *Connect to Git* → pick this repo. Set the production branch to `main`. (Create a
   **Worker**, not a Pages project — the wrangler-config "Skipping file" warning in the
   build log is expected and harmless for a Workers build.)
2. **Custom domain** — attach `monkeynumber.xyz` to the `monkeynumber` Worker
   (Settings → Domains & Routes), and make sure the old Cloudflare Pages project is
   deleted/disconnected so it doesn't fight for the domain.

After that, every push to `main` redeploys automatically.

### Preview URLs

`wrangler.jsonc` sets `preview_urls: true` and `workers_dev: true`. Turn on
[non-production branch builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
in the Workers Builds settings and every PR / non-`main` branch gets a
`<branch>-monkeynumber.<subdomain>.workers.dev` preview link, posted back to the PR.

### Manual deploy (optional)

```shell
npm run deploy     # = npm run build (toolchain installed on demand) && wrangler deploy
```
