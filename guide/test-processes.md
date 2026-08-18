# Test Processes

Test items never run in the process that discovered them. They run in separate **test processes**, and everything on this page — how those processes are pooled, when they are recycled, how work is distributed over them, and what happens when a test item hangs — is handled by [TestItemControllers.jl](https://github.com/julia-vscode/TestItemControllers.jl), the engine underneath every surface.

That means it applies equally to [VS Code](./vscode), the [REPL](./repl), the [command line](./cli), [CI](./ci) and the [MCP server](./mcp). Where a surface exposes a setting for something described here, it is named in that section.

## Pooling and reuse

Test processes **outlive the run that created them**. When a run finishes, its processes stay alive and go back into a pool; the next run picks them up instead of starting fresh ones.

This is the single largest performance property of the framework, because the cost a test process pays at startup is not small: Julia itself has to start, the test environment has to be activated, and your package and all its dependencies have to be loaded. On a package of any size that is seconds, per process, and it is paid before a single `@test` has run. A pooled process has paid it already.

The pool is keyed by the *environment* a test item needs — its package and project (see [Environments](./environments) for how those are chosen), its Julia version, its environment variables, its coverage and bounds-checking settings. A run that asks for the same environment as the last one reuses its processes. A run that asks for something different gets new ones, and the old ones stay around for the next time they match.

Two things invalidate a pooled process rather than reusing it:

- **The environment changed.** If the content of the [chosen project's](./environments#step-2-which-project-supplies-the-manifest) `Project.toml` or `Manifest.toml` changed since the process was started, its loaded packages are stale in a way no amount of reloading can fix, and it is restarted.
- **You terminate it.** VS Code offers **Stop Test Process** in the Julia Workspace panel, DevREPL has [`test kill`](./repl#managing-test-processes). Both are the way out if a process gets into a state you do not trust.

### Revise-based hot reload

Editing your package does *not* invalidate a pooled process. Test processes run [Revise.jl](https://timholy.github.io/Revise.jl/stable/), and before each run the controller asks them to pick up the changes you made since the last one.

So the inner loop — edit a function, rerun the test item — costs a `Revise` pass plus the test itself. Not a process start, not a package load. This is what makes rerunning a single test item feel immediate in the editor, in `dev> test failed`, and from an AI agent, and it is why it is worth leaving test processes running between runs rather than reflexively killing them.

Revise has the limits it always has: changing a struct definition, or anything else it cannot apply to a running session, needs a fresh process.

### Coordinated precompilation

When several test processes start into an environment that has not been precompiled yet, they do not all race for the same precompile lock. One process is designated to precompile, the others wait for it and then start against the finished cache. The first run into a cold environment therefore costs one precompilation, not one per process.

## Memory

A pooled test process accumulates whatever your tests allocated and failed to release, and it does so *across* runs, for as long as the session lasts. That is the flip side of pooling, and there are two controls for it.

### GC between test items

A full garbage collection is run between test items. It is **on by default whenever more than one test process is used**, and off for a single process — with one process the tests are already serialized and the pause buys much less.

On the command line: `--gc-between-testitems` and `--no-gc-between-testitems`. In CI: the [`gc-between-testitems` input](./actions#julia-run-testitems).

Turning it off makes a suite of many small test items measurably faster. Turning it on is what keeps a long-lived process from drifting upward in memory use over a session.

### Memory-threshold recycling

The stronger control is to retire a process outright. Set a threshold as a fraction of system memory, and once total system memory use crosses it, the test process stops after the test item it is running:

```sh
juliati --memory-threshold 0.9
```

The exit is clean and deliberate, not a crash: the process finishes reporting its current item, shuts down, and the controller redistributes whatever it had left to the other processes and, if needed, starts a fresh one. No test item is lost, and no result is reported twice.

This is **off by default and experimental**. It watches total system memory rather than the process's own, so it will also react to memory pressure that has nothing to do with your tests — which is intentional for a machine that is about to start swapping, but means the threshold is a judgement call rather than a setting with a right answer. Start at `0.9`.

In CI: the [`memory-threshold` input](./actions#julia-run-testitems).

## Hang diagnostics

Every test item runs under a timeout — 1200 seconds by default on the [command line](./cli#options) and in [CI](./actions#julia-run-testitems), 300 in [DevREPL](./repl#run-flags). When it expires, the controller kills the test process and reports the item as errored.

A timed-out test item does not just leave one line behind. Shortly before the deadline, a watchdog **inside the test process** dumps a CPU profile and the backtraces of every task to disk. The controller reads that dump when its own timeout fires and attaches it to the timed-out item's output. So instead of "timed out after 1200s" you get the stack of exactly where the process was stuck — usually enough to name the culprit without reproducing the hang.

The watchdog runs on a thread of its own and avoids everything that a wedged process cannot service, so it works even when the test item has blocked the main thread, and it works the same way on Linux, macOS and Windows. This is switched on always; there is nothing to configure.

::: warning One case it cannot diagnose
A test item that neither allocates nor yields — a tight numeric loop, a blocking `ccall` — never reaches a safepoint, so no other Julia code in that process can run, the watchdog included. Nothing is dumped, and the controller's timeout is the backstop that ends the run. If a hang produces no diagnostics at all, that is the shape of it, and it is a strong hint about where to look.
:::

## Scheduling

With more than one test process, the controller has to decide which items go where. Two strategies exist, selected with `--schedule` on the command line and the [`schedule` input](./actions#julia-run-testitems) in CI.

### `duration` (default)

Test items are ordered and distributed using three things the controller knows from previous runs in the session:

- **Measured duration** — long items are placed first, so the run does not end waiting on one long test item that happened to be scheduled last.
- **Past failures** — items that failed last time are dealt out first, one per process, so you find out whether you fixed them without waiting for the whole suite.
- **Warm setups** — a [`@testmodule`](./writing-tests#test-modules-testmodule) is evaluated once per test process, so items sharing one are preferentially placed on a process that already has it, up to the point where the imbalance costs more than re-evaluating it would.

An item that has never run has no measured duration, so the first run of a suite has little to go on and the ordering improves from the second run onward.

### `contiguous`

The older behavior: split the test items into contiguous chunks by position and give one chunk to each process. It ignores durations, failures and setups entirely.

This exists as a diagnostic escape hatch. If a run behaves strangely — an ordering-dependent test, a suspicion that the scheduler is at fault — `--schedule contiguous` rules the scheduler out with one flag. It is not otherwise a good default, and there is no reason to leave it set.

Either way, processes that run out of work **steal** items from processes that still have a backlog, so a bad initial distribution self-corrects. What stealing cannot do is split a single test item, which is why duration-aware ordering matters more than the initial split does.
