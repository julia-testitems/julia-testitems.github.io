# REPL Runner

::: warning Prerelease
TestItemREPL.jl is currently a prerelease package. The API and behavior may change before the first stable release.
:::

[TestItemREPL.jl](https://github.com/julia-testitems/TestItemREPL.jl) provides an interactive REPL mode for running test items directly from the Julia terminal. It gives you live progress, filtering, background runs, and result inspection — all without leaving the REPL.

![REPL runner](/images/repl-main.png)

## Setup

Install TestItemREPL.jl into your global environment:

```julia
using Pkg
Pkg.add(url="https://github.com/julia-testitem/TestItemREPL.jl")
```

Then load it in the REPL:

```julia
using TestItemREPL
```

## Activating the Test Mode

Press `)` at the `julia>` prompt to enter the test REPL mode. The prompt changes to `test>`:

```
julia> )
test>
```

Press **Backspace** on an empty line to return to the normal `julia>` prompt.

## Commands

### `list` / `ls`

Discover and list all test items in a project.

```
test> list [path] [--tags=tag1,tag2]
```

- **`path`** — Directory to scan. Defaults to the current working directory.
- **`--tags=tag1,tag2`** — Filter by tags (comma-separated).

### `run`

Run tests synchronously, blocking the REPL until complete. Press **Esc** to cancel.

```
test> run [+channel] [path] [--workers=N] [--timeout=S] [--tags=tag1,tag2] [--coverage]
```

- **`path`** — Directory or partial test item name to filter by.
- **`+channel`** — Juliaup channel to use (e.g. `+lts`, `+release`, `+nightly`).
- **`--workers=N`** — Number of parallel worker processes. Default: `min(Sys.CPU_THREADS, 8)`.
- **`--timeout=S`** — Per-test-item timeout in seconds. Default: `300`.
- **`--tags=tag1,tag2`** — Filter by tags.
- **`--coverage`** — Enable code coverage measurement.

**Examples:**

```
test> run
test> run /path/to/myproject
test> run +lts --workers=4 --timeout=60
test> run --tags=unit,fast
```

### `run&`

Run tests asynchronously in the background. The REPL remains interactive so you can continue working.

```
test> run& [same options as run]
```

A run ID is printed when the background run starts. Use `status` to monitor progress and `results` to view results when complete.

### `status` / `st`

Show progress of the current background test run.

```
test> status
```

Displays elapsed time and live counts of passed, failed, errored, and skipped tests.

### `cancel`

Cancel an active background test run.

```
test> cancel [run_id]
```

Without an argument, cancels the current active run. Pass a run ID to cancel a specific run.

### `results` / `res`

Display test results from the last completed run, or a specific run by ID.

```
test> results [id] [--name=pattern] [--verbose] [--output]
```

- **`id`** — Run ID to display (supports prefix matching). Defaults to the last run.
- **`--name=pattern`** — Filter by test item name (case-insensitive substring match).
- **`--verbose`** — Show full per-profile details including messages and output.
- **`--output`** — Show only captured stdout/stderr for each test item.

The default output shows a summary with color-coded counts, details of any failures, and the five slowest tests.

### `process-log` / `plog`

Display the raw output log from a specific test process.

```
test> process-log <process_id>
```

### `help` / `?`

Show a summary of all available commands.

```
test> help
```

## Parallel Execution

By default, TestItemREPL uses up to `min(Sys.CPU_THREADS, 8)` worker processes. Override this with the `--workers` flag:

```
test> run --workers=4
test> run --workers=1   # serial execution
```

## Julia Version Selection

If you use [Juliaup](https://github.com/JuliaLang/juliaup), you can run tests against a different Julia version by specifying a channel:

```
test> run +lts
test> run +release
test> run +nightly
```
