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
| `--timeout <seconds\|none>` | `1200` | Per-test-item timeout in seconds. `none` disables it. |
| `--max-workers <n>` | `min(Sys.CPU_THREADS, 8)` | Maximum number of parallel test processes. |
| `--threads <n\|auto\|n,m>` | Julia's own default | Value for the test processes' `--threads`. |
| `--progress <bar\|log\|none>` | `bar` | Progress output style. |
| `--output <issues\|all\|none>` | `issues` | Which captured test item output is echoed to the console. Output is always captured into the results regardless. See [below](#test-item-output). |
| `--stream` | off | Print test item output live as it is produced instead of when the item finishes. Requires `--max-workers 1`. |
| `--coverage` | off | Run test processes in coverage mode. |
| `--coverage-lcov <path>` | not written | Write the merged coverage of the run to this file in LCOV format. Implies `--coverage`. |
| `--gc-between-testitems` / `--no-gc-between-testitems` | on with more than one test process | Run a full GC between test items. See [Test Processes](./test-processes#gc-between-test-items). |
| `--memory-threshold <frac>` | off | Recycle a test process once system memory use exceeds this fraction (0–1). See [Test Processes](./test-processes#memory-threshold-recycling). |
| `--schedule <duration\|contiguous>` | `duration` | How test items are distributed over test processes. See [Test Processes](./test-processes#scheduling). |
| `--results-json <path>` | not written | Write the full test run results as JSON to this file. |
| `--junit-xml <path>` | not written | Write the test run results as JUnit XML to this file. |
| `--profile-name <name>` | `"Default"` | Profile name recorded in the results. |
| `--env <KEY=VALUE>` | — | Environment variable for test processes. Repeatable. |
| `--env-json <json>` | — | JSON object of environment variables for test processes; a `null` value removes the variable. Note that `JULIA_PROJECT`, `JULIA_LOAD_PATH` and `JULIA_DEPOT_PATH` are removed from test processes unless set here — see [Environments](./environments#juliati-and-the-github-action). |
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
  ⊘ Default test/test_parsing.jl:parse on 1.12 → skipped
  ```
- **`none`** — no progress, no summary, and no failure details. Use this when you only care about the exit code or the JSON results file.

A test item whose [`skip`](./writing-tests#skipping-test-items) keyword evaluated to `true` is marked `⊘` and counted separately, both in the progress line and in the summary:

```
  Progress: 24/24 (22 passed, 1 failed, 1 skipped)

24 tests ran, 22 passed, 1 failed, 1 skipped.
```

Counts that are zero are left out, which is why a clean run still reads `24 tests ran, 24 passed.`

## Test item output

Every test item's captured output always reaches `--results-json` and `--junit-xml`. `--output` only controls what is echoed to the console:

- **`issues`** (default) — print it alongside the failure detail of failing items.
- **`all`** — print it for every item as it finishes.
- **`none`** — print none of it.

For debugging a single test item, `--stream` prints its output as it happens rather than after it finishes. Because output from several test processes would interleave arbitrarily, it requires `--max-workers 1`:

```sh
juliati --filter 'name == "the slow one"' --max-workers 1 --stream --progress log
```

## Parallel execution

By default `juliati` uses up to `min(Sys.CPU_THREADS, 8)` parallel test processes. Override it with `--max-workers`:

```sh
juliati --max-workers 4
juliati --max-workers 1   # serial execution
```

`--threads` sets the `--threads` value of the test processes themselves, in any form `julia` accepts (`4`, `auto`, `2,1`). Left unset, they use Julia's own default.

Test processes are pooled and outlive a single run, which is what makes repeated runs start fast. How they are reused, recycled and scheduled is described in [Test Processes](./test-processes).

## Code coverage

`--coverage` runs the test processes in coverage mode, attributed per test item:

```sh
juliati --coverage --results-json results.json
```

Coverage results are part of the JSON output. `--coverage-lcov` additionally writes the merged coverage of the whole run in LCOV format, which is what Codecov, Coveralls and `genhtml` consume:

```sh
juliati --coverage-lcov lcov.info
```

It implies `--coverage`, so it is the only flag you need. For a line-by-line view in the editor, use [VS Code](./vscode#code-coverage).

## Bounds checking

`--check-bounds` decides how the test processes treat `@inbounds`:

- **`auto`** (default) — respects `@inbounds` annotations and reuses your existing precompile caches, so runs start fast.
- **`yes`** — forces bounds checks everywhere, which is what `Pkg.test` does. This catches out-of-bounds bugs that `@inbounds` would otherwise hide, but it precompiles the environment into a separate cache slot, so the first run after switching is slow.

The [`julia-run-testitems` action](./actions#julia-run-testitems) defaults to `yes` instead, on the grounds that CI should prefer thoroughness over startup latency.

## JSON results

With `--results-json results.json` the complete run — every test item, its status, duration, performance statistics, failure messages with stack traces, and captured output — is written as JSON, suitable for further processing:

```sh
juliati --results-json results.json --progress log
```

This is the file the [`julia-report-ci-results` action](./actions#julia-report-ci-results) consumes to build a CI job summary.

## JUnit XML

`--junit-xml junit.xml` writes the same run as JUnit XML, which most CI systems ingest natively:

```sh
juliati --junit-xml junit.xml
```

One `<testsuite>` per source file, one `<testcase>` per (test item, profile), with captured output in `<system-out>` and per-item performance statistics as `<properties>`. The JSON results are richer; the JUnit XML is far more portable. Writing both is fine.

## Test item ids

Both output formats identify each test item by an id that looks like this:

```
MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats
```

That is `<package>/<path>::<name>`. The package is its name plus the first eight hex digits
of its UUID — the name is what you recognise, and the UUID fragment separates two different
packages that happen to share a name, such as a vendored copy beside a dev checkout. The path
is relative to the package root and always uses `/`, so an id is identical on Windows and
Linux, and identical in a dev checkout and on a CI runner. That last property is what makes
ids usable for tracking a test across runs.

Ids are stable under editing: inserting or removing other test items does not change them.
The one exception is two test items sharing a name in one file, which is a definition error —
every occurrence is then suffixed `#1`, `#2`, … so each stays individually addressable.

An id identifies a test item **within its package**, not within a workspace. The same package
checked out into two folders produces the same id from both, deliberately: two checkouts
differ only by location, and location differs between your machine and CI, so an id cannot be
both unique across a workspace and portable across machines. Where the difference matters —
the console output, the `uri` field in the JSON results, and the `classname` in the JUnit XML —
the file path distinguishes them.

::: tip
The progress output above shows `test/test_parsing.jl:parse basics`, which is a display
form, not an id. Ids appear in `--results-json` and `--junit-xml`.
:::

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
