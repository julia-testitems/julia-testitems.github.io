# Command Line

::: warning Prerelease
[TestItemApp.jl](https://github.com/julia-vscode/TestItemApp.jl) is currently a prerelease package and is not yet registered. The command line interface may change before the first stable release.
:::

TestItemApp.jl installs a `juliati` executable that discovers every test item under a folder and runs them in parallel test processes. No editor, no `test/runtests.jl`, and no `julia --project -e '...'` incantation required.

Discovery and execution use exactly the same engines as the [VS Code extension](./vscode), so `juliati` finds the same test items the editor shows you and honors the same [`JuliaTestItems.toml`](./configuration) configuration.

## Installation

`juliati` is a [Julia app](https://pkgdocs.julialang.org/dev/apps/) and requires **Julia 1.12 or newer**:

```julia
using Pkg
Pkg.Apps.add(url="https://github.com/julia-vscode/TestItemApp.jl")
```

This installs the `juliati` executable into `~/.julia/bin`. Make sure that directory is on your `PATH`.

## Usage

Run all test items in the current directory:

```
juliati
```

Or point it at a package folder:

```
juliati path/to/MyPackage
```

`juliati` walks the given folder, finds every `@testitem` (along with `@testsnippet` and `@testmodule`), groups them by package, launches parallel test processes, and reports the results:

```
  Discovered 24 test item run(s) in 3 file(s)
  Launching test processes....
  Progress: 24/24 (23 passed, 1 failed)

24 tests ran, 23 passed, 1 failed.
```

There are no subcommands — running tests is the default action. The only other things `juliati` does are `--help` and `--version`.

## Options

Options can be written as `--opt value` or `--opt=value`.

| Option | Default | Description |
| --- | --- | --- |
| `--filter <expr>` | run everything | Julia expression over `name`, `tags`, `filename`, `package_name`; only items for which it evaluates to `true` are run. |
| `--timeout <seconds>` | no timeout | Per-test-item timeout. |
| `--max-workers <n>` | `min(Sys.CPU_THREADS, 8)` | Maximum number of parallel test processes. |
| `--progress <bar\|log\|none>` | `bar` | Progress output style. |
| `--coverage` | off | Run test processes in coverage mode. |
| `--results-json <path>` | not written | Write the full test run results as JSON to this file. |
| `--profile-name <name>` | `"Default"` | Profile name recorded in the results. |
| `--env <KEY=VALUE>` | — | Environment variable for test processes. Repeatable. |
| `--env-json <json>` | — | JSON object of environment variables for test processes; a `null` value removes the variable. |
| `--juliaup-channel <channel>` | — | Set `JULIAUP_CHANNEL` for test processes. |
| `--julia-cmd <path>` | `julia` | Julia executable used for test processes. |
| `--check-bounds <auto\|yes>` | `auto` | `--check-bounds` mode for test processes. See [below](#bounds-checking). |
| `--fail-on-detection-error` / `--no-fail-on-detection-error` | fail | Whether to refuse to run any tests when a test item fails to parse. |
| `--debug` | off | Enable debug logging. |
| `--help`, `--version` | — | Show help / version. |

## Filtering

`--filter` takes an arbitrary Julia expression that is evaluated for each test item with the variables `name`, `tags`, `filename`, and `package_name` in scope:

```sh
# Run a single test item by name
juliati --filter 'name == "my testitem"'

# Run everything tagged :fast that is not tagged :windows
juliati --filter ':fast in tags && !(:windows in tags)'

# Run only test items from one file
juliati --filter 'endswith(filename, "test_parsing.jl")'
```

This is the same filter language the [CI actions](./actions#julia-run-testitems) use.

## Progress output

`--progress` controls what you see while tests run:

- **`bar`** (default) — a live progress bar. Best for interactive use.
- **`log`** — one line per finished test item, which is what you want in CI where a redrawing bar just produces noise:
  ```
  ✓ Default test/test_parsing.jl:parse basics → passed (412ms)
  ✗ Default test/test_parsing.jl:parse edge cases → failed (1203ms)
  ```
- **`none`** — no progress, no summary, and no failure details. Use this when you only care about the exit code or the JSON results file.

## Parallel execution

By default `juliati` uses up to `min(Sys.CPU_THREADS, 8)` parallel test processes. Override it with `--max-workers`:

```sh
juliati --max-workers 4
juliati --max-workers 1   # serial execution
```

## Code coverage

`--coverage` runs the test processes in coverage mode:

```sh
juliati --coverage --results-json results.json
```

Coverage results are part of the JSON output. For a line-by-line view in the editor, use [VS Code](./vscode#code-coverage).

## Bounds checking

`--check-bounds` decides how the test processes treat `@inbounds`:

- **`auto`** (default) — respects `@inbounds` annotations and reuses your existing precompile caches, so runs start fast.
- **`yes`** — forces bounds checks everywhere, which is what `Pkg.test` does. This catches out-of-bounds bugs that `@inbounds` would otherwise hide, but it precompiles the environment into a separate cache slot, so the first run after switching is slow.

The [`julia-run-testitems` action](./actions#julia-run-testitems) defaults to `yes` instead, on the grounds that CI should prefer thoroughness over startup latency.

## JSON results

With `--results-json results.json` the complete run — every test item, its status, duration, failure messages with stack traces, and captured output — is written as JSON, suitable for further processing:

```sh
juliati --results-json results.json --progress log
```

This is the file the [`julia-report-ci-results` action](./actions#julia-report-ci-results) consumes to build a CI job summary.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All tests passed. |
| `1` | Test failures, errors, or test definition errors. |
| `2` | Usage error (an unknown option, a bad value, more than one path). |

That makes `juliati` usable directly as a CI step, or in a shell `&&` chain.

## Configuration

`juliati` reads no configuration file of its own — every option is a command line flag. What it *does* read is [`JuliaTestItems.toml`](./configuration), which controls where test items are looked for, and is shared with every other surface.

## Running under Pkg.test instead

If you need your test items to run through `Pkg.test()` — for registry checks or downstream integration testing — see [Legacy Pkg.test Integration](./pkg-test).
