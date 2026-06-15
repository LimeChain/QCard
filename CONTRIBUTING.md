# Contributing to QCard

QCard is a proof of concept, so this guide is intentionally short. The one rule that matters: **all changes land through a reviewed pull request — nothing is pushed straight to `main`.**

## How changes get in

1. Branch off `main` (or fork the repo if you don't have write access).
2. Make your change. Keep the PR small and focused on one thing.
3. Open a pull request against `main`.
4. A code owner (see [`CODEOWNERS`](.github/CODEOWNERS)) reviews it. **Their approval is required** before the PR can merge.
5. Once approved and green, it merges into `main`.

`main` is the protected default branch: direct pushes are blocked, and a code-owner review is mandatory. Don't merge your own PR without an approving review.

## Working on it

Clone with submodules — the contracts won't build without them:

```bash
git clone --recurse-submodules https://github.com/LimeChain/qcard.git
git submodule update --init --recursive   # if you already cloned without them
```

The repo has three parts:

- **Frontend** — Next.js / TypeScript app in `src/`. Install with `npm install`, run with `npm run dev`, build with `npm run build`.
- **Smart contracts** — Foundry / Solidity workspace in `contracts/`. From that directory, build with `forge build` and test with `forge test`.
- **Falcon backend** — Python signer in `scripts/` used for HCA Falcon leaves. Set it up once with `./scripts/setup-falcon.sh`.

Before you open a PR, make sure the code builds and tests pass for whichever part you touched.

## A few expectations

- Write a PR description that says **what** changed and **why**.
- You own everything you submit, including AI-assisted code — if you can't explain a line, don't ship it.
- Take extra care with the high-risk areas: the PQC signature schemes (Lamport / Falcon-ETH / ML-DSA-ETH), the on-chain verifier and account contracts, and browser-side seed/key generation. **Never commit secrets, private keys, or mnemonics** — `.env*` and seed files are git-ignored, keep them that way.

That's it. Thanks for contributing.
