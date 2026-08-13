# REPL Mode

::: warning Prerelease
[DevREPL.jl](https://github.com/julia-vscode/DevREPL.jl) is currently a prerelease package and is not yet registered. The commands and their behavior may change before the first stable release.
:::

DevREPL.jl adds a `test>` mode to the Julia REPL for running test items from the terminal. It gives you a fuzzy test item picker, live progress, background runs, a failure browser that jumps to your editor, and — because it is already loaded — linting and formatting.

```
julia> )

test> test failed
  Discovered 2 test item(s) in 1 file(s)
2 tests ran, 2 passed.
```

## Setup

Install DevREPL.jl into your **global** environment, so it is available in every session:

```julia
using Pkg
Pkg.add(url="https://github.com/julia-vscode/DevREPL.jl")
```

Then load it:

```julia
using DevREPL
```

To have the `test>` mode always available, add that line to `~/.julia/config/startup.jl`. DevREPL hooks into REPL initialization, so it works whether it is loaded before or after the REPL comes up.

## Activating the test mode

Press `)` at the `julia>` prompt to enter the test REPL mode. The prompt changes to `test>`:

```
julia> )
test>
```

The mode is sticky — it stays active between commands. Press **Backspace** on an empty line to return to the normal `julia>` prompt.

Tab completion works throughout: commands and subcommands, flag names, directories, and Juliaup channels.

## Running tests

### `test`

Run test items, blocking the REPL until complete. Press **Esc** to cancel.

```
test> test [+channel] [path|name] [flags]
```

A positional argument that is a directory is used as the path to scan (default: the current working directory); anything else is treated as a case-insensitive substring filter on the test item name.

```
test> test                          # opens the picker (see below)
test> test /path/to/myproject       # run everything in a project
test> test parsing                  # run items whose name contains "parsing"
test> test +lts --workers=4
test> test --tags=unit,fast
```

`t` is a shorthand for `test`.

### `test pick`

Fuzzy-pick the test items to run from an interactive list. Space toggles an item, Enter runs the selection.

```
test> test pick [query] [path] [flags]
```

A bare `test` with no arguments opens the picker too. This needs an interactive terminal; in a non-TTY session it reports an error instead.

### `test -`

Repeat the last test run with the same arguments.

### `test failed`

Rerun only the items that failed or errored in the last run. This is the fast inner loop: run everything once, then `test failed` until it is quiet.

### `test&`

Run tests in the background. The REPL stays interactive so you can keep working.

```
test> test& [same options as test]
```

Use `test status` to monitor progress and `test results` to view them when done. Completion is reported the next time you run a command.

`t&` is a shorthand for `test&`.

## Run flags

| Flag | Default | Description |
| --- | --- | --- |
| `--tags=t1,t2` | — | Only run items carrying at least one of these tags. |
| `--workers=N` | `min(Sys.CPU_THREADS, 8)` | Maximum number of parallel worker processes. |
| `--timeout=S` | `300` | Per-test-item timeout in seconds. |
| `--coverage` | off | Enable code coverage measurement. |
| `+channel` | current Julia | Juliaup channel to run the tests under, e.g. `+lts`, `+release`, `+nightly`. |

::: warning Flags need an `=`
Write `--workers=4`, not `--workers 4`. Only the `--key=value` and bare `--flag` forms are parsed; a space-separated value is read as a positional argument instead.
:::

`+channel` requires [Juliaup](https://github.com/JuliaLang/juliaup), and the channel has to be installed already:

```
test> test +lts
test> test +nightly --workers=2
```

## Inspecting results

### `test results`

Display results from the last completed run, or a specific run by ID.

```
test> test results [id] [--name=pattern] [--verbose] [--output]
```

- **`id`** — run ID to display (prefix matching works). Defaults to the last run.
- **`--name=pattern`** — filter by test item name (case-insensitive substring match).
- **`--verbose`** — show full per-profile details including messages and output.
- **`--output`** — show only captured stdout/stderr for each test item.

The default output is a summary with color-coded counts followed by the details of any failures. `res` is a shorthand.

### `@`

Browse the failures of the last run interactively. For each failure you can go back to the list, **open it in your editor** (honoring `JULIA_EDITOR`), or quit. In a non-TTY session it simply prints all failures.

### `test list`

List the discovered test items with their location and tags, without running anything.

```
test> test list [path] [--tags=t1,t2]
```

`ls` is a shorthand.

### `test runs`

Show the run history as a table of ID, start time, duration, status, test count, and path.

```
test> test runs [--active]
```

Only the most recent 20 runs are kept.

### `test status`

Show the state and live progress of the current background run. `st` is a shorthand.

### `test cancel`

Cancel the active background run, or a specific one by ID.

```
test> test cancel [id]
```

## Managing test processes

Test processes stay alive between runs so repeated runs start fast.

| Command | Description |
| --- | --- |
| `test procs` | List active test processes with their ID, package, and status. Aliases: `processes`, `ps`. |
| `test kill [process-id]` | Kill all test processes, or one by ID (prefix matching works). |
| `test plog <process-id>` | Show the raw captured output of a test process. Alias: `process-log`. |

`test plog` is what you want when a whole test process died before running anything — a precompilation error, for instance, whose cause never made it into a test result.

## Linting and formatting

Since DevREPL already has the analysis engine loaded, it also exposes it directly.

### `lint`

```
test> lint [path]
```

Lints a folder (default: the current working directory), reporting `file:line:col: severity: message [rule-id]` with a count summary. Respects [`JuliaLint.toml`](./configuration#reporting-problems-in-test-items).

### `format`

```
test> format [path]
test> format --check [path]
```

`format` reformats a file or an entire folder **in place**. `format --check` changes nothing and only reports which files would be reformatted — the right choice if you want to look before you leap. Both honor your `JuliaFormat.toml` configuration, including its exclusions.

## `help`

```
test> help
```

Shows a summary of every command. `?` is a shorthand.

## Renamed commands

The test commands used to sit at the top level and are now grouped under `test`. The old spellings are no longer accepted; DevREPL will point you at the replacement if you use one.

| Old | New |
| --- | --- |
| `run`, `run&` | `test`, `test&` |
| `list`, `ls` | `test list` |
| `status`, `st` | `test status` |
| `cancel` | `test cancel` |
| `results`, `res` | `test results` |
| `runs` | `test runs` |
| `processes`, `procs`, `ps` | `test procs` |
| `kill` | `test kill` |
| `plog`, `process-log` | `test plog` |
