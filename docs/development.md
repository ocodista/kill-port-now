# Development

This document describes how to develop, benchmark, and release `kill-port-now`.

## Architecture

`kill-port-now` has two layers:

1. **Native binary**
   - `native/src/bin/kp.rs` frees ports by killing matching processes.
   - `native/src/bin/fp.rs` checks whether a TCP port is free.
   - `native/src/core/` validates ports, normalizes protocols/signals, deduplicates processes, and owns kill helpers.
   - `native/src/platform/` contains the platform-specific socket lookup implementations.
   - macOS uses `libproc`.
   - Linux uses `/proc/net/*` plus `/proc/<pid>/fd` inode mapping.
   - Windows uses `iphlpapi.dll` tables and `TerminateProcess()`.

2. **Node launcher/API**
   - `bin/kp.js` is the npm bin target.
   - `index.js` keeps the documented `kill-port` API shape.
   - Both call the native binary and parse its JSON output.
   - There is no `lsof`, shell, or JS kill fallback. Missing native binaries fail loudly.

The package does not run `preinstall`, `install`, or `postinstall` scripts.

## Product model

Ports are user-facing; protocols are implementation details. The default command:

```sh
kp 3000
```

means “free local port 3000” across TCP and UDP. Protocol filters are escape hatches:

```sh
kp 3000 --tcp-only
kp 3000 --udp-only
```

## Project layout

- `bin/` contains the published Node launcher.
- `benchmarks/` contains the benchmark dashboard, data, fixtures, and runner scripts.
- `native/` contains the Rust crate and native prebuilds.
- `test/` contains the Node test suite.

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
cargo test --manifest-path native/Cargo.toml
cargo build --release --manifest-path native/Cargo.toml
npm test
npm run pack:dry
```

Test a packed install:

```sh
pkg=$(npm pack | tail -1)
tmp=$(mktemp -d)
npm install --prefix "$tmp" -g "$pkg" --silent
"$tmp/bin/kp" 3000 --dry-run --json
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
- uses `benchmarks/fixtures/` to start temporary TCP and UDP servers;
- measures empty-port, UDP kill, and TCP kill scenarios;
- writes `benchmarks/data/latest.json` and `benchmarks/data/latest.js`.

## Prebuilds

Current bundled prebuilds:

- `native/prebuilds/darwin-arm64/`
- `native/prebuilds/darwin-x64/`
- `native/prebuilds/linux-x64-gnu/`

Target prebuild names:

- `darwin-arm64`
- `darwin-x64`
- `linux-x64-gnu`
- `linux-arm64-gnu`
- `linux-x64-musl`
- `linux-arm64-musl`
- `windows-x64-msvc`
- `windows-arm64-msvc`

To refresh macOS arm64:

```sh
cargo build --release --manifest-path native/Cargo.toml
cp native/target/release/kp-rs native/prebuilds/darwin-arm64/kp-rs
strip -x native/prebuilds/darwin-arm64/kp-rs
```

To refresh macOS x64 from Apple Silicon, use rustup's Rust compiler, not the Homebrew `rustc`:

```sh
rustup target add x86_64-apple-darwin
RUSTC=$(rustup which rustc --toolchain stable) \
  rustup run stable cargo build --release \
  --manifest-path native/Cargo.toml \
  --target x86_64-apple-darwin
cp native/target/x86_64-apple-darwin/release/kp-rs native/prebuilds/darwin-x64/kp-rs
strip -x native/prebuilds/darwin-x64/kp-rs
```

To refresh Linux x64 GNU from any Docker host:

```sh
mkdir -p native/prebuilds/linux-x64-gnu
docker run --rm --platform linux/amd64 \
  -v "$PWD":/work -w /work rust:1.91.1-slim-bullseye \
  sh -lc 'export PATH=/usr/local/cargo/bin:$PATH; \
    cargo build --release --manifest-path native/Cargo.toml && \
    cp native/target/release/kp-rs native/prebuilds/linux-x64-gnu/kp-rs && \
    strip native/prebuilds/linux-x64-gnu/kp-rs && \
    chmod 755 native/prebuilds/linux-x64-gnu/kp-rs'
```

## Release

```sh
cargo test --manifest-path native/Cargo.toml
cargo build --release --manifest-path native/Cargo.toml
npm test
npm run bench:native
npm run pack:dry
npm publish --dry-run
npm publish
```

Commit updated benchmark data with any benchmark claim changes.
