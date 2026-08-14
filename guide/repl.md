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

Test item commands all live under `test`, which can be shortened to `t`. A
subcommand is always required — a bare `test`, or a word that is not one of the
subcommands below, lists the available commands and does nothing else.

## Running tests

### `test run`

Run test items, blocking the REPL until complete.

```
dev> test run [+channel] [path|name] [flags]
```

While the run is on screen, two keys work:

| Key | Effect |
| --- | --- |
| **Esc** | Cancel the run. |
| **b** | Send the run to the background and return to the prompt. It keeps going; pick it back up with [`test attach`](#test-attach). |

Both are shown above the progress bar while a run is in flight.

A positional argument that is a directory is used as the path to scan (default: the current working directory); anything else is treated as a case-insensitive substring filter on the test item name. `--name=` is the explicit spelling of that filter, and is how you match a name that happens to look like a path.

```
dev> test run /path/to/myproject     # run everything in a project
dev> test run parsing                # run items whose name contains "parsing"
dev> test run --name=parsing         # the same, explicitly
dev> test run +lts --workers=4
dev> test run --tags=unit,fast
```

The run reports what detection found before it reports what the filters kept:

```
dev> test run zzzz
  Discovered 184 test item(s) in 14 file(s)
  Selected 0 of 184 after filtering on name "zzzz"
  No test item matched the filter on name "zzzz". Use 'test list' to see what is there.
```

### `test pick`

Fuzzy-pick the test items to run from an interactive list. Space toggles an item, Enter runs the selection.

```
dev> test pick [query] [path] [flags]
```

This needs an interactive terminal; in a non-TTY session it reports an error instead.

### `test repeat`

Repeat the last test run with the same arguments.

### `test failed`

Rerun only the items that failed or errored in the last run. This is the fast inner loop: run everything once, then `test failed` until it is quiet.

### `test run --bg`

Run tests in the background. The REPL stays interactive so you can keep working.

```
dev> test run --bg [same options as test run]
```

Use `test status` to monitor progress and `test results` to view them when done. Completion is reported once, the next time you run a command.

Several background runs can be in flight at once. Each is identified by its run number, and commands that act on a run take that number: `test attach 8`, `test cancel 8`. When exactly one run is active the number can be omitted; when more than one is, it is required rather than guessed.

The worker allowance is shared rather than multiplied — a second concurrent run takes what is left of the budget instead of claiming a full set of its own, so background runs do not quietly fill the machine with Julia processes. An explicit `--workers=N` overrides that.

### `test attach`

Bring a background run back to the foreground — progress on screen, **Esc** to cancel, **b** to detach again. This is the counterpart to `b`: between them a run can move between foreground and background as often as you like, without ever being interrupted.

```
dev> test attach [id]
```

The run itself is unaffected either way; attaching only turns its progress display back on. Attaching to a run that has already finished shows its results instead.

## Run flags

| Flag | Default | Description |
| --- | --- | --- |
| `--name=pattern` | — | Only run items whose name contains this substring (case-insensitive). |
| `--tags=t1,t2` | — | Only run items carrying at least one of these tags. |
| `--workers=N` | `min(Sys.CPU_THREADS, 8)` | Maximum number of parallel worker processes. |
| `--timeout=S` | `300` | Per-test-item timeout in seconds. Note this is shorter than the `1200` that [`juliati`](./cli#options) and the [CI action](./actions#julia-run-testitems) default to — an interactive run is better off telling you something is stuck. |
| `--coverage` | off | Enable code coverage measurement. |
| `--bg` | off | Run in the background instead of blocking the REPL. |
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

### `test failures`

Browse the failures of the last run interactively. For each failure you can go back to the list, **open it in your editor** (honoring `JULIA_EDITOR`), or quit. In a non-TTY session it simply prints all failures.

### `test list`

List the discovered test items with their location and tags, without running anything.

```
dev> test list [path] [--tags=t1,t2]
```

`ls` is a shorthand.

### `test history`

Show the run history as a table of ID, start time, duration, status, test count, and path.

```
dev> test history [--active]
```

Status is one of `running`, `completed`, `cancelled` or `errored`. Only the most recent 20 runs are kept.

### `test status`

Show every run currently in progress, with its live progress. `st` is a shorthand.

```
dev> test status
Active runs:

  #     Elapsed   Progress    Detail
  ────────────────────────────────────────────────────────────
  2     10.5s     14/184      14 passed
  1     10.5s     36/184      36 passed

2 runs active. 'test attach <id>' to watch one, 'test cancel <id>' to stop one.
```

A run whose test items have all reported but which is still shutting down shows `finishing…`.

### `test cancel`

Cancel a run. With one run active the id may be omitted; with several it is required.

```
dev> test cancel [id]
```

A cancelled run is recorded as `cancelled` in `test history`, distinct from one that ran to completion.

## Managing test processes

Test processes stay alive between runs so repeated runs start fast. Process ids are shown shortened; every command that takes one matches on a prefix, so the short form is what you type.

| Command | Description |
| --- | --- |
| `test procs` | List active test processes with their ID, package, status and uptime. Alias: `ps`. |
| `test kill [process-id]` | Kill all test processes, or one by ID (prefix matching works). |
| `test log <process-id>` | Show the raw captured output of a test process. |

`test log` is what you want when a whole test process died before running anything — a precompilation error, for instance, whose cause never made it into a test result.

Killing test processes is rarely what you want, because they are what makes the second run of anything fast. See [Test Processes](./test-processes) for how they are pooled, reloaded with Revise, and recycled.

## `help`

```
dev> help
```

Shows a summary of every command. `?` is a shorthand.

## Command summary

| Command | Aliases |
| --- | --- |
| `test run [path\|name] [flags]` | — |
| `test run --bg` | — |
| `test attach [id]` | — |
| `test pick [query] [path]` | — |
| `test failed` | — |
| `test repeat` | — |
| `test list [path]` | `test ls` |
| `test results [id]` | `test res` |
| `test failures` | — |
| `test history [--active]` | — |
| `test status` | `test st` |
| `test cancel [id]` | — |
| `test procs` | `test ps` |
| `test kill [id]` | — |
| `test log <id>` | — |
| `lint [path]`, `format [path]` | — |
| `help` | `?` |

`test` itself can be shortened to `t` throughout.
