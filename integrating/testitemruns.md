# TestItemRuns.jl API

::: warning Prerelease
[TestItemRuns.jl](https://github.com/julia-testitems/TestItemRuns.jl) is currently a prerelease package and is not yet registered. The API may change before the first stable release.
:::

TestItemRuns.jl is the public Julia API for discovering and running test items. Discovery is done by [JuliaWorkspaces.jl](https://github.com/julia-vscode/JuliaWorkspaces.jl), execution by [TestItemControllers.jl](https://github.com/julia-vscode/TestItemControllers.jl); TestItemRuns glues the two together and adds run, process and result management on top. It prints nothing by itself — front ends render its event stream.

The API has two tiers:

- **One call.** `run_tests(path)` discovers everything under a folder, runs it and returns a result. Discovery, the test session and shutdown are all internal.
- **Fine-grained control.** `discover_testitems` gives you the items to list, filter and select; a `TestSession` keeps a pool of test processes alive across runs; `run_async!` returns a `TestRun` you can watch, snapshot and cancel; a typed event stream reports progress; and process management lets you inspect and kill test processes. `run_tests` is a thin wrapper over this tier.

## Installation

TestItemRuns requires **Julia 1.12 or newer**:

```julia
using Pkg
Pkg.add(url="https://github.com/julia-testitems/TestItemRuns.jl")
```

It depends on JuliaWorkspaces.jl and TestItemControllers.jl and re-exports what you need from them: the result types, the JSON/JUnit/LCOV writers and the `CancellationTokens` module.

## One call: `run_tests`

```julia
using TestItemRuns

result = run_tests("path/to/MyPackage"; max_workers=4, timeout=600)

for t in result.testitems, p in t.profiles
    println(t.name, " → ", p.status)
end

write_json("results.json", result)
write_junit_xml("junit.xml", result; root=abspath("path/to/MyPackage"))

ok = all(p.status == :passed for t in result.testitems for p in t.profiles) &&
     isempty(result.definition_errors)
exit(ok ? 0 : 1)
```

`run_tests(path; kwargs...)` returns a `TestrunResult` (see [Result formats](./results)). Keyword arguments:

| Keyword | Default | Meaning |
|---|---|---|
| `filter` | `nothing` | A `TestItem -> Bool` predicate; only matching items run. |
| `profiles` | `[RunProfile("Default")]` | Every item runs once per [profile](#profiles). |
| `max_workers` | `min(Sys.CPU_THREADS, 8)` | Maximum number of parallel test processes. |
| `timeout` | `nothing` | Per-test-item timeout in seconds; `nothing` for none. |
| `julia_cmd`, `julia_args` | `"julia"`, `String[]` | How test processes are launched. |
| `julia_num_threads` | `nothing` | The test processes' `--threads` value (`"4"`, `"auto"`, `"4,1"`). |
| `check_bounds` | `nothing` | `nothing`/`"auto"` respects `@inbounds` and reuses ordinary precompile caches; `"yes"` forces bounds checks everywhere (the `Pkg.test` behavior) at the cost of a separate cache slot. See [`juliati --check-bounds`](../guide/cli#bounds-checking). |
| `gc_between_testitems` | `nothing` | Run a full GC between items; `nothing` turns it on when more than one test process is used. |
| `memory_threshold` | `nothing` | Recycle a test process once system memory use exceeds this fraction (0–1). |
| `schedule` | `:duration` | `:duration` (measured durations, past failures, warm setups) or `:contiguous` (chunk by position); see [Test Processes](../guide/test-processes#scheduling). |
| `fail_on_definition_error` | `true` | When discovery reports definition errors, run nothing; the errors are in the result either way. |
| `token` | `nothing` | A `CancellationToken`; see [Cancellation](#cancellation). |
| `on_event` | `nothing` | Receives a `DiscoveryFinished` event and then every [run event](#events). |
| `log_min_level` | `Logging.Warn` | Minimum level for log records emitted while the run is active (the controller logs its lifecycle at info level). `nothing` leaves the current logger in place. |
| `store_path` | `nothing` | JuliaWorkspaces on-disk store. |
| `active_project` | `nothing` | Project folder or file used as the fallback environment for files outside any project. As a test project it is used only if it has a manifest and that manifest `dev`s the package — see [Environments](../guide/environments). |

Discovery honors [`JuliaTestItems.toml`](../guide/configuration) exactly like every other surface. Test processes never inherit `JULIA_LOAD_PATH`, `JULIA_PROJECT` or `JULIA_DEPOT_PATH` from the host, so a tool installed as a Pkg app can run tests for arbitrary packages.

## Discovery

```julia
d = discover_testitems("path/to/MyPackage")      # a folder, a Vector of folders, or a JuliaWorkspace
d.testitems                                       # Vector{TestItem}
d.setups                                          # every @testmodule / @testsnippet
d.definition_errors                               # test items that could not be parsed

for item in d                                     # iterates testitems
    println(item.name, " @ ", item.filename, ":", item.line, " ", item.tags)
end
```

`discover_testitems` builds a fresh JuliaWorkspaces workspace over the given folders and returns a `Discovery` — a plain, immutable snapshot:

| Field | Meaning |
|---|---|
| `roots` | The folders that were scanned (empty for a caller-owned workspace with no `roots` given). |
| `testitems` | `Vector{TestItem}`, ordered by file and position. |
| `setups` | The `@testmodule`/`@testsnippet` definitions, needed by the test processes whichever items you select. |
| `definition_errors` | `Vector{DefinitionError}` — `uri`, `id`, `name`, `line`, `column`, `end_line`, `end_column`, `message`. |

Keyword arguments: `filter` (a `TestItem -> Bool`), `store_path`, `active_project` (path-based discovery only).

`discover_testitems(jw::JuliaWorkspaces.JuliaWorkspace; filter, roots)` works on a workspace you own and keep up to date yourself — a long-lived tool with a file watcher, for example. The workspace is not retained or locked; if you mutate it from another task, hold your own lock around the call.

### `TestItem`

A `TestItem` wraps the `TestItemControllers.TestItemDetail` in its `detail` field and exposes convenience properties:

| Property | Meaning |
|---|---|
| `id` | The [stable id](./overview#concepts-every-layer-shares), e.g. `MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats`. |
| `name` | The `@testitem` name. |
| `uri`, `filename` | File URI, and the file system path when it is a `file:` URI. |
| `line`, `column` | 1-based position of the `@testitem` call. |
| `package_name`, `package_uri`, `project_uri`, `env_content_hash` | The [environment](../guide/environments) discovery resolved for the file. |
| `tags` | `Vector{Symbol}` |
| `setups` | Names of the setups the item uses. |
| `code` | The body source text. |
| `skip` | `true`/`false`, or the source text of the `skip=` expression, which the test process evaluates just before running the item. |

`TestItemRuns.key(item)` returns `(item.id, item.package_uri)`, the pair that identifies an item uniquely.

### Selecting items

```julia
quick   = select(d; tags=[:quick], file_pattern="test/unit")   # AND of every criterion
parsers = filter(i -> startswith(i.name, "parser"), d)         # Base.filter works on a Discovery
mine    = select(d; ids=[item.id for item in failed_last_time])
```

`select(d; kwargs...)` returns a new `Discovery` restricted to matching items (setups and definition errors are kept):

| Keyword | Matches when |
|---|---|
| `ids` | `item.id` is in the collection |
| `keys` | `(id, package_uri)` is in the collection |
| `names` | the name is in the collection |
| `name_pattern` | a `Regex` or substring occurs in the name |
| `file_pattern` | a `Regex` or substring occurs in `filename` |
| `tags` | the item carries *any* of the given tags |
| `packages` | the package name is in the collection |
| `predicate` | an arbitrary `TestItem -> Bool` returns `true` |

`packages(d)` lists the distinct packages the items belong to.

## Profiles

A `RunProfile` is one named configuration; a run executes every item once per profile and merges the results per item, which is how a CI matrix ends up in one report:

```julia
profiles = [
    RunProfile("default"),
    RunProfile("coverage"; coverage=true),
    RunProfile("nightly"; julia_cmd="julia +nightly", env=Dict("JULIA_DEBUG" => "MyPackage")),
]
run_tests("."; profiles)
```

| Field | Meaning |
|---|---|
| `name` | Recorded in the results as `profile_name`. |
| `coverage` | Run in coverage mode; the result then carries per-file line coverage. |
| `env` | Environment variables for the test processes. A `nothing` value removes a variable. |
| `julia_cmd`, `julia_args`, `julia_num_threads`, `check_bounds` | Per-profile overrides; `nothing` means "use the run-level value". |

`RunProfile(name, coverage, env)` is the positional form. Whatever `env` says, `JULIA_LOAD_PATH`, `JULIA_PROJECT` and `JULIA_DEPOT_PATH` are cleared so test processes resolve their own environment.

## Sessions and runs

A `TestSession` owns one `TestItemController` and a pool of test processes that stays alive across runs — the second run of the same package revises the running processes instead of launching new ones (see [Test Processes](../guide/test-processes) for the reuse rules).

```julia
session = TestSession()

d = discover_testitems(".")
result = run!(session, d)                                  # blocking; returns TestrunResult
run = run_async!(session, select(d; tags=[:slow]))         # returns a TestRun immediately

run_progress(run)      # (; total, done, passed, failed, errored, skipped)
snapshot(run)          # partial TestrunResult while it is in flight
cancel!(run)           # remaining items are skipped, processes killed
result = fetch(run)    # or wait(run)

close(session)
```

`TestSession(; kwargs...)`:

| Keyword | Default | Meaning |
|---|---|---|
| `schedule` | `:duration` | Scheduling strategy for every run of the session. |
| `on_event` | `nothing` | A sink receiving every event of every run plus all process events. |
| `max_history` | `50` | How many finished runs `list_runs` retains; `nothing` for unbounded. |
| `reactor_pool` | `nothing` | `nothing` runs the controller reactor as an `@async` task; `:interactive` uses `Threads.@spawn :interactive`, so a REPL front end keeps making progress while user code saturates the default thread pool. |
| `log_min_level` | `nothing` | When given, the controller's own log records go to a `ConsoleLogger(stderr, level)`; otherwise the current logger is inherited. |

`run_async!(session, testitems; kwargs...)` takes a `Discovery` or a `Vector{TestItem}` and the same keywords as `run_tests` minus the discovery ones (`filter`, `store_path`, `active_project`, `schedule`), plus:

| Keyword | Meaning |
|---|---|
| `setups` | The setups the items may reference; defaults to the discovery's. |
| `on_event` | An event sink for this run only. |
| `id` | The run id (default: a fresh UUID); must be unique within the session. |
| `metadata` | A `Dict{String,Any}` stored on the run untouched — a place for your own bookkeeping such as the path that was run. |

`run!(session, testitems; kwargs...)` is `fetch(run_async!(...))`.

### `TestRun`

| Field / function | Meaning |
|---|---|
| `id`, `session`, `items`, `profiles` | What the run is. |
| `status` | `:running`, `:completed`, `:cancelled` or `:errored`. |
| `started_at`, `finished_at` | `DateTime`s; `finished_at` is `nothing` while running. |
| `result` | The `TestrunResult` once finished — partial when cancelled or errored. |
| `error` | The exception when `status == :errored`. |
| `params` | A `NamedTuple` of the run settings, so `run_async!(session, items; run.params...)` re-runs with the same configuration. |
| `metadata` | Yours. |
| `wait(run)`, `fetch(run)` | Block until finished; `fetch` returns the result and rethrows the error of an errored run. |
| `cancel!(run)`, `iscancelled(run)` | Request cancellation; the run then finishes normally with `status == :cancelled`. |
| `snapshot(run)` | The result so far, usable while in flight. |
| `run_progress(run)` | `(; total, done, passed, failed, errored, skipped)` — `total` counts (item, profile) units. |
| `subscribe!(run, f)`, `unsubscribe!(run, f)` | Add or remove an event sink while the run is in flight (an "attach" in a REPL front end). |

`list_runs(session)` returns the retained runs, newest first (running runs are never pruned); `get_run(session, id)` looks a run up by id or unique id prefix.

### Test processes

| Function | Meaning |
|---|---|
| `list_processes(session)` | The live test processes, pooled idle ones included, as `ProcessInfo`s: `id`, `package_name`, `package_uri`, `project_uri`, `profile`, `status` (`"Launching"`, `"Running"`, `"Idle"`, …), `created_at`, `test_env_id`. |
| `process_output(session, id)` | Everything a process wrote outside of test items (startup, precompilation). |
| `terminate_process!(session, id)` | Kill one process; an item it was running is reported as errored. |
| `terminate_all_processes!(session)` | Kill every process but keep the session usable; the next run launches fresh ones. |
| `close(session)` | Cancel active runs, shut every process down, stop the reactor. Idempotent. |

### A long-lived tool

The pieces compose into the loop every interactive front end runs:

```julia
using TestItemRuns

session = TestSession(; reactor_pool=:interactive)
d = discover_testitems(pwd())

first_run = run!(session, d; timeout=300)

failed_ids = [t.id for t in first_run.testitems if any(p.status in (:failed, :errored) for p in t.profiles)]
if !isempty(failed_ids)
    d = discover_testitems(pwd())                              # pick up edits made in between
    rerun = run_async!(session, select(d; ids=failed_ids); list_runs(session)[1].params...)
    while !istaskdone(rerun)
        p = run_progress(rerun)
        println("$(p.done)/$(p.total) — $(p.passed) passed, $(p.failed) failed")
        sleep(1)
    end
    fetch(rerun)
end

close(session)
```

Test processes launched for `first_run` are revised and reused for `rerun`.

## Events

Pass `on_event` to `run_tests`, `TestSession` or `run_async!`, or `subscribe!` to a run or session at any time. Every event is a small immutable struct:

| Event | Fields | When |
|---|---|---|
| `DiscoveryFinished` | `discovery` | `run_tests` only, before anything runs. |
| `RunStarted` | `run`, `n_items`, `n_units`, `n_profiles` | First event of a run; `n_units` is the number of `TestItemFinished` events to expect. |
| `TestItemStarted` | `run`, `item`, `profile` | |
| `OutputAppended` | `run`, `item`, `profile`, `output` | Live output of an item; the same text is also accumulated into the result. |
| `TestItemFinished` | `run`, `item`, `profile`, `status`, `duration`, `messages`, `perf`, `skip_reason` | The terminal event of one (item, profile) unit. `duration` is milliseconds, or `nothing` when the controller synthesised the result (timeout, crash); `messages` is `nothing` or a vector of `TestItemControllers.TestMessage`; `perf` is `nothing` or a `PerfStats`. |
| `ProcessCreated` | `id`, `package_name`, `package_uri`, `project_uri`, `profile`, `test_env_id` | A test process was launched. |
| `ProcessStatusChanged` | `id`, `status` | |
| `ProcessTerminated` | `id` | |
| `ProcessOutput` | `id`, `output` | Output outside of any test item. |
| `RunFinished` | `run`, `status`, `result` | Last event of a run; `status` is `:completed`, `:cancelled` or `:errored`. |

Delivery guarantees:

- Events are delivered **off the controller's reactor task**, in order, one at a time per sink. A slow sink delays only its own delivery, never test execution.
- Run-scoped events go to the run's sinks and to the session's sinks. Process events are session-scoped (a pooled process serves many runs); they go to the session's sinks and to every run active at that moment.
- `wait(run)`/`fetch(run)` do not return before every sink — the run's and the session's — has seen `RunFinished`.
- A sink that throws is logged at error level and skipped for that event; it does not affect the run.
- Sinks may be added after a run started; they see events from that point on.

A minimal progress printer:

```julia
report(::RunEvent) = nothing
report(ev::TestItemFinished) = println(ev.status == :passed ? "✓ " : "✗ ", ev.item.name)
report(ev::RunFinished) = println("done: ", run_progress(ev.run))

run_tests("."; on_event=report)
```

## Cancellation

```julia
using TestItemRuns.CancellationTokens
cts = CancellationTokenSource()
@async (sleep(30); cancel(cts))
result = run_tests("."; token=get_token(cts))     # returns normally with the partial result
```

`TestItemRuns.CancellationTokens` is the module TestItemControllers vendors, so tokens are interchangeable with every other consumer of that package. Inside a session, `cancel!(run)` does the same for one run and a caller-supplied `token` is linked to it, so either works. A cancelled run finishes with `status == :cancelled`; items that had not started are recorded as `:skipped`.

## Results

Every run produces a `TestrunResult` — the `TestItemControllers.Results` type: definition errors, one entry per test item with one entry per profile (`status`, `duration`, `messages`, `output`, `perf`), captured process outputs and, in coverage mode, per-file coverage. `write_json`/`read_json`, `write_junit_xml` and `write_lcov` are re-exported. The formats are documented in [Result formats](./results).

## Threading and logging

- The controller runs on its own reactor task; TestItemRuns' callbacks only do bookkeeping there and hand events to drain tasks, so your sinks never run on the reactor.
- In a REPL front end use `reactor_pool=:interactive` so the reactor keeps being scheduled while the user's own parallel code saturates the default thread pool.
- The controller logs its lifecycle at info level from the reactor task, and tasks inherit their logger when spawned — which is why `run_tests` installs its `log_min_level` logger around the whole run, and why `TestSession(; log_min_level)` wraps controller creation. If you manage logging yourself, pass `nothing`.

## Who uses it

- [`juliati`](../guide/cli) — `TestItemApp.run_tests` is a thin front end over `run_tests` with a console reporter as the event sink.
- [DevREPL](../guide/repl) — one `TestSession` per Julia session; `test run --bg`, `attach` and `cancel` are `run_async!`, `subscribe!` and `cancel!`.
- [JuliaMCP](../guide/mcp) — a `TestSession` with an unbounded history, discovery on its own file-watched workspace, MCP notifications as the event sink.
