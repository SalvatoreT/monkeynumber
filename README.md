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

Deployment runs through [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/),
connected to this Git repo. The build image doesn't ship Rust, so the **build
command installs it** (via rustup) before `wrangler deploy` compiles the WASM.

### One-time setup

1. **Connect the repo** — dashboard → Workers & Pages → Create → **Workers** →
   *Connect to Git* → pick this repo. Set the production branch to `main`. (Create a
   **Worker**, not a Pages project — the wrangler-config "Skipping file" warning in the
   build log is expected and harmless for a Workers build.)
2. **Build command** — installs the toolchain the image lacks. Each step must be on the
   same line as the rest (the `. "$HOME/.cargo/env"` is required, or the next command
   fails with `cargo: not found`):

   ```shell
   curl https://sh.rustup.rs -sSf | sh -s -- -y && . "$HOME/.cargo/env" && rustup target add wasm32-unknown-unknown && cargo install wasm-pack
   ```

3. **Deploy command** — re-source cargo (separate shell), then deploy:

   ```shell
   . "$HOME/.cargo/env" && npx wrangler deploy
   ```

   `wrangler deploy` runs the `build.command` hook in `wrangler.jsonc`, which builds
   the WASM into `public/pkg/`, then uploads `public/` as static assets. (Don't put
   `wasm-pack build` in the build command — the deploy step builds it.)
4. **Stop the old Pages deploy** — remove the `monkeynumber.xyz` custom domain from the
   old Cloudflare Pages project and disable its automatic deployments (or delete it).
5. **Move the domain to the Worker** — the `monkeynumber` Worker → Settings →
   Domains & Routes → add `monkeynumber.xyz` as a custom domain.

After that, every push to `main` redeploys automatically.

### Preview URLs

`wrangler.jsonc` sets `preview_urls: true` and `workers_dev: true`. Turn on
[non-production branch builds](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
in the Workers Builds settings and every PR / non-`main` branch gets a
`<branch>-monkeynumber.<subdomain>.workers.dev` preview link, posted back to the PR.

### Manual deploy (optional)

With Rust + wasm-pack installed locally:

```shell
npm run deploy     # = wrangler deploy (builds the WASM via the wrangler build hook)
```
