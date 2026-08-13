# REPL Mode

::: warning Prerelease
[DevREPL.jl](https://github.com/julia-vscode/DevREPL.jl) is currently a prerelease package and is not yet registered. The commands and their behavior may change before the first stable release.
:::

DevREPL.jl adds a `dev>` mode to the Julia REPL for running test items from the terminal. It gives you a fuzzy test item picker, live progress, background runs, and a failure browser that jumps to your editor.

```
julia> )

dev> test failed
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

To have the `dev>` mode always available, add that line to `~/.julia/config/startup.jl`. DevREPL hooks into REPL initialization, so it works whether it is loaded before or after the REPL comes up.

## Activating the mode

Press `)` at the `julia>` prompt to enter the DevREPL mode. The prompt changes to `dev>`:

```
julia> )
dev>
```

The mode is sticky — it stays active between commands. Press **Backspace** on an empty line to return to the normal `julia>` prompt.

Tab completion works throughout: commands and subcommands, flag names, directories, and Juliaup channels.

Test item commands all live under `test`, which can be shortened to `t`.

## Running tests

### `test run`

Run test items, blocking the REPL until complete. Press **Esc** to cancel.

```
dev> test run [+channel] [path|name] [flags]
```

A positional argument that is a directory is used as the path to scan (default: the current working directory); anything else is treated as a case-insensitive substring filter on the test item name.

```
dev> test run /path/to/myproject     # run everything in a project
dev> test run parsing                # run items whose name contains "parsing"
dev> test run +lts --workers=4
dev> test run --tags=unit,fast
```

### `test pick`

Fuzzy-pick the test items to run from an interactive list. Space toggles an item, Enter runs the selection.

```
dev> test pick [query] [path] [flags]
```

A bare `test` with no arguments opens the picker too. This needs an interactive terminal; in a non-TTY session it reports an error instead.

### `test -`

Repeat the last test run with the same arguments.

### `test failed`

Rerun only the items that failed or errored in the last run. This is the fast inner loop: run everything once, then `test failed` until it is quiet.

### `test run&`

Run tests in the background. The REPL stays interactive so you can keep working.

```
dev> test run& [same options as test run]
```

Use `test status` to monitor progress and `test results` to view them when done. Completion is reported the next time you run a command.

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
dev> test run +lts
dev> test run +nightly --workers=2
```

## Inspecting results

### `test results`

Display results from the last completed run, or a specific run by ID.

```
dev> test results [id] [--name=pattern] [--verbose] [--output]
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
dev> test list [path] [--tags=t1,t2]
```

`ls` is a shorthand.

### `test runs`

Show the run history as a table of ID, start time, duration, status, test count, and path.

```
dev> test runs [--active]
```

Only the most recent 20 runs are kept.

### `test status`

Show the state and live progress of the current background run. `st` is a shorthand.

### `test cancel`

Cancel the active background run, or a specific one by ID.

```
dev> test cancel [id]
```

## Managing test processes

Test processes stay alive between runs so repeated runs start fast.

| Command | Description |
| --- | --- |
| `test procs` | List active test processes with their ID, package, and status. Aliases: `processes`, `ps`. |
| `test kill [process-id]` | Kill all test processes, or one by ID (prefix matching works). |
| `test plog <process-id>` | Show the raw captured output of a test process. Alias: `process-log`. |

`test plog` is what you want when a whole test process died before running anything — a precompilation error, for instance, whose cause never made it into a test result.

## `help`

```
dev> help
```

Shows a summary of every command. `?` is a shorthand.

## Renamed commands

The test commands used to sit at the top level and are now grouped under `test`. The old spellings are no longer accepted; DevREPL will point you at the replacement if you use one.

| Old | New |
| --- | --- |
| `run`, `run&` | `test run`, `test run&` |
| `list`, `ls` | `test list` |
| `status`, `st` | `test status` |
| `cancel` | `test cancel` |
| `results`, `res` | `test results` |
| `runs` | `test runs` |
| `processes`, `procs`, `ps` | `test procs` |
| `kill` | `test kill` |
| `plog`, `process-log` | `test plog` |
