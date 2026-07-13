# Typsastra benchmark report

Generated: 2026-07-13T14:08:32.482Z<br>
Revision: `c547194` (working tree had uncommitted changes)

## Scope

This report measures CLI compiler process time, incremental spellcheck-range calculation, and built frontend artifact size. It does **not** claim to measure total Typsastra desktop memory or end-to-end WebView preview latency.

## Machine and tools

| Item | Value |
|---|---|
| OS | Windows_NT 10.0.26200 (x64) |
| CPU | Intel(R) Core(TM) Ultra 7 155H (22 logical CPUs) |
| Installed memory | 15.37 GiB |
| Bun | 1.3.14 |
| Typst | typst 0.15.0 (3ae52774) |
| Tinymist npm package | 0.12.16 (managed runtime not exercised by this harness) |

## Results

Each warm compiler result contains five fresh Typst CLI processes after a fixture-specific warmup.

| Workload | Minimum | Median | p95 / maximum |
|---|---:|---:|---:|
| One-page compile | 231.33 ms | 238.46 ms | 256.37 ms |
| 30-page compile | 267.25 ms | 273.26 ms | 283.84 ms |
| 100-page compile | 348.93 ms | 364.54 ms | 383.42 ms |
| 1,000 incremental range calculations | 12.77 ms | 21.15 ms | 33.59 ms |

- First-process one-page compile: **1,182.59 ms**. This does not clear OS filesystem caches.
- Largest submitted incremental spellcheck range: **32 UTF-16 units** from a 100,000-unit document.
- Built frontend `dist/` size: **3.17 MiB**. This is not installer size.

## Limitations

- The first-process compile does not clear operating-system filesystem caches.
- Typst CLI process timings are not equivalent to in-app Tinymist preview latency.
- Frontend `dist/` size is not installer size.
- Desktop, WebView, PDF renderer, GPU, and Tinymist memory are not measured by this harness.
- Results describe this machine and toolchain; they are not universal performance guarantees.

## Reproduce

From the repository root, with Typst available on `PATH`:

```sh
bun install --frozen-lockfile
bun run build
bun run benchmark:performance
```

The harness writes a Markdown report and raw JSON under the ignored `artifacts/performance/` directory. The raw data for this published run is committed at [`benchmarks/results/2026-07-13-windows.json`](../benchmarks/results/2026-07-13-windows.json).
