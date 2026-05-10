# Development

This document describes how to develop, benchmark, and release `kill-port-now`.

## Architecture

`kill-port-now` has three layers:

1. **Native CLI**
   - `native/src/bin/kp.rs` kills processes by port.
   - `native/src/bin/fp.rs` checks whether a TCP port is free.
   - macOS uses `libproc`.
   - Linux uses `/proc`.
   - No external Rust crates.

2. **Native bin wrapper**
   - `bin/kp-native` is the only npm bin target.
   - `scripts/install-native.js` copies the matching `kp-rs` prebuild into that path during install.
   - If no prebuild exists, the wrapper falls back safely.

3. **JS API fallback**
   - `index.js` keeps the documented `kill-port` API shape.
   - `bin/kp-js` is the dependency-free Node CLI fallback.
   - It uses one targeted lookup instead of the old full socket scan.

## Development path

The implementation went through four steps:

1. Started with an API-compatible JS replacement.
2. Optimized the JS path with targeted `lsof`.
3. Explored no-`lsof` native lookup paths.
4. Settled on the native `kp` implementation.

The public benchmark stays focused on the package comparison: `kill-port@2.0.1` vs `kill-port-now`.

## Build

```sh
cargo build --release --manifest-path native/Cargo.toml
```

Local binaries:

```sh
native/target/release/kp-rs 3000
native/target/release/fp-rs 3000
```

## Test

```sh
npm test
cargo build --release --manifest-path native/Cargo.toml
npm run pack:dry
```

Test a packed install:

```sh
pkg=$(npm pack | tail -1)
tmp=$(mktemp -d)
npm install --prefix "$tmp" -g "$pkg" --silent
"$tmp/bin/kp" 3000
rm -rf "$tmp" "$pkg"
```

## Benchmark

```sh
npm run bench:native
open benchmarks/index.html
```

The benchmark runner:

- builds the Rust release binaries;
- installs `kill-port@2.0.1` in a temp directory;
- creates temporary TCP and UDP fixture servers;
- measures empty-port, UDP kill, and TCP kill scenarios;
- writes `benchmarks/data/latest.json` and `benchmarks/data/latest.js`.

## Prebuilds

Current bundled prebuilds:

- `prebuilds/darwin-arm64/`
- `prebuilds/darwin-x64/`

To refresh macOS arm64:

```sh
cargo build --release --manifest-path native/Cargo.toml
cp native/target/release/kp-rs prebuilds/darwin-arm64/kp-rs
strip -x prebuilds/darwin-arm64/kp-rs
```

To refresh macOS x64 from Apple Silicon, use rustup's Rust compiler, not the Homebrew `rustc`:

```sh
rustup target add x86_64-apple-darwin
RUSTC=$(rustup which rustc --toolchain stable) \
  rustup run stable cargo build --release \
  --manifest-path native/Cargo.toml \
  --target x86_64-apple-darwin
cp native/target/x86_64-apple-darwin/release/kp-rs prebuilds/darwin-x64/kp-rs
strip -x prebuilds/darwin-x64/kp-rs
```

## Release

```sh
npm test
cargo build --release --manifest-path native/Cargo.toml
npm run bench:native
npm run pack:dry
npm publish --dry-run
npm publish
```

Commit updated benchmark data with any benchmark claim changes.
