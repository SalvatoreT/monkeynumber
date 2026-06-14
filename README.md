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
npm run build      # wasm-pack build --target web --out-dir public/pkg --release
```

Run the Rust unit tests (MT19937 reference vectors, no WASM needed):

```shell
cargo test
```

## Deploy (Cloudflare Workers)

Deploys run in CI. Pushing to `main` triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which installs
Rust + wasm-pack, runs the tests, builds the WASM, and runs `wrangler deploy`.

### One-time setup

1. **API token** — create a Cloudflare API token from the *Edit Cloudflare Workers*
   template and add it to the repo as the `CLOUDFLARE_API_TOKEN` secret
   (Settings → Secrets and variables → Actions). Add `CLOUDFLARE_ACCOUNT_ID` as well if
   your token can see more than one account.
2. **Free the domain from Pages** — this project used to deploy via Cloudflare Pages.
   In the dashboard (Workers & Pages → the old Pages project), remove the
   `monkeynumber.xyz` custom domain, then **delete or disconnect** that Pages project so
   merges stop rebuilding it.
3. **Deploy** — push to `main` (or run the workflow manually). It creates/updates the
   `monkeynumber` Worker.
4. **Attach the domain to the Worker** — dashboard → the `monkeynumber` Worker →
   Settings → Domains & Routes → add `monkeynumber.xyz` as a custom domain.

After that, every push to `main` redeploys automatically.

### Manual deploy (optional)

With Rust + wasm-pack installed locally:

```shell
npm run deploy     # = wrangler deploy (builds the WASM via the wrangler build hook)
```
