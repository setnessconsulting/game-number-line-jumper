# games-site static-web release

GAME-293 defines the public release boundary between this repository and
`setnessconsulting/games-site`.

## Ownership

- `game-number-line-jumper` owns source, tests, the production build, and immutable release identity.
- `games-site` owns the arcade card, launch route, selected production version, promotion, and rollback.
- The game must not import games-site internals and games-site must not rebuild the game from source.

## Build contract

The production Vite build uses a relative base (`./`). The generated `dist/index.html` therefore
loads scripts, styles, and other assets relative to the versioned artifact directory instead of
assuming domain-root hosting.

For an immutable release version:

```text
npm ci
npm run test:ci
npm run release:evidence -- --version <version>
```

The evidence command rebuilds `dist/` and writes
`release-evidence/number-line-jumper-<version>.json`. The manifest records:

- exact source Git SHA;
- `package-lock.json` SHA-256;
- deterministic aggregate build SHA-256;
- immutable release version;
- entry document (`index.html`);
- target asset prefix (`/game-assets/number-line-jumper/<version>`);
- every published file path, byte size, and SHA-256.

Generated evidence is not committed automatically. GAME-224 decides which release-evidence record is
preserved as the final accepted candidate.

## Publication

A qualified build is uploaded without mutation under the private R2 object prefix:

```text
number-line-jumper/<version>/
```

The public site serves that immutable object set through:

```text
/game-assets/number-line-jumper/<version>/
```

Publication alone does not make the game playable. The corresponding `games-site` catalog entry
remains `coming-soon` until a release is qualified and the owner intentionally promotes an exact
version.

## Promotion and rollback

Promotion is a reviewed `games-site` change that:

1. changes the Number Line Jumper entry to `playable`;
2. records a `static-web` release with the exact immutable version and `index.html` entry file;
3. passes games-site CI and hosted route verification.

Rollback changes only the selected games-site version pointer back to a prior known-good immutable
version. Published version directories are never overwritten or deleted as part of rollback.

## Privacy

The hosted build must remain free of accounts, third-party trackers, Sentry/browser observability,
and remote gameplay telemetry. Ordinary first-party requests for the immutable HTML, JavaScript,
CSS, fonts, and images under the games-site asset prefix are expected delivery traffic, not gameplay
telemetry.
