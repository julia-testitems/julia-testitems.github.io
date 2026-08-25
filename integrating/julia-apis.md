# JuliaWorkspaces and TestItemControllers

[TestItemRuns.jl](./testitemruns) is a thin layer over two registered packages: [JuliaWorkspaces.jl](https://github.com/julia-vscode/JuliaWorkspaces.jl) discovers test items, [TestItemControllers.jl](https://github.com/julia-vscode/TestItemControllers.jl) runs them. Drop down to them when TestItemRuns' model does not fit — you keep a workspace alive and updated yourself and only want discovery, you want to drive the controller's callbacks directly, or you are embedding execution in a process model TestItemRuns does not anticipate.

::: tip Reference documentation
This page describes the shape of the two APIs and how they fit together. The authoritative signatures are the docstrings: TestItemControllers publishes them at [julia-testitems.org/TestItemControllers.jl](https://julia-testitems.org/TestItemControllers.jl/), JuliaWorkspaces at [julia-vscode.org/JuliaWorkspaces.jl](https://www.julia-vscode.org/JuliaWorkspaces.jl/dev/).
:::

## Discovery with JuliaWorkspaces

A `JuliaWorkspace` holds a set of source files plus the projects and packages found among them, and derives test items, environments, diagnostics and more from that on demand (it is a [Salsa](https://github.com/RelationalAI-oss/Salsa.jl)-style incremental computation, so re-querying after a small edit is cheap).

### Creating and updating a workspace

```julia
using JuliaWorkspaces

jw = workspace_from_folders(["path/to/MyPackage"])       # scan folders from disk, once

# …or build and maintain one yourself:
jw = JuliaWorkspace()
add_folder_from_disc!(jw, "path/to/MyPackage")
add_file_from_disc!(jw, "path/to/MyPackage/test/new_tests.jl")   # a file appeared
update_file_from_disc!(jw, "path/to/MyPackage/test/parsing_tests.jl")   # a file changed
remove_file!(jw, JuliaWorkspaces.filepath2uri("path/to/MyPackage/test/old_tests.jl"))  # a file went away
set_active_project!(jw, JuliaWorkspaces.filepath2uri("path/to/some/env"))   # fallback env; as a test project only if it has a manifest that devs the package
```

`workspace_from_folders(folders; store_path, …)` is what every one-shot tool uses; a long-lived tool (an editor, an MCP server) keeps one workspace and feeds it file changes. The workspace is **not thread-safe**: hold your own lock around every call if a file watcher and a request handler both touch it.

### Querying test items

```julia
for (uri, details) in pairs(get_test_items(jw))         # Dict{URI,TestDetails}, every file
    env = get_test_env(jw, uri)                          # JuliaTestEnv for that file
    text = get_text_file(jw, uri)                        # TextFile: the source
    for item in details.testitems
        pos = position_at(text.content, first(item.range))       # byte offset → Position(line, column), 1-based
        code = text.content.content[item.code_range]
        @show item.id item.name pos.line env.package_name
    end
end
get_test_items(jw, uri)                                  # one file
```

| Type | Fields |
|---|---|
| `TestDetails` | `testitems::Vector{TestItemDetail}`, `testsetups::Vector{TestSetupDetail}`, `testerrors::Vector{TestErrorDetail}` |
| `TestItemDetail` | `uri`, `id`, `name`, `code`, `range`, `code_range` (both `UnitRange{Int}` of **byte offsets**), `option_default_imports::Bool`, `option_tags::Vector{Symbol}`, `option_setup::Vector{Symbol}`, `option_skip::Union{Bool,String}` |
| `TestSetupDetail` | `uri`, `name::Symbol`, `kind::Symbol` (`:module` or `:snippet`), `code`, `range`, `code_range` |
| `TestErrorDetail` | `uri`, `id`, `name`, `message`, `range` |
| `JuliaTestEnv` | `package_name`, `package_uri`, `project_uri`, `env_content_hash` — each `nothing` when unknown |

Notes:

- Ranges are byte offsets into the file; use `position_at(text.content, offset)` to get 1-based `line`/`column`. Ranges are how the LSP layer and TestItemControllers get their positions.
- `option_skip` is either a `Bool` or the *source text* of the `skip=` expression, which the test process evaluates just before running the item.
- Test items outside a Julia package produce only a `TestErrorDetail` ("Test items must be defined inside a Julia package").
- `id` is package-scoped (`MyPkg@a1b2c3d4/test/file.jl::name`); identify items by `(id, package_uri)`. See [the shared concepts](./overview#concepts-every-layer-shares).
- `get_test_env` implements the environment rules of [Environments](../guide/environments): the file's owning package, the project that supplies the manifest (or the active project when no folder above the file has both a project file and a manifest — and either way only if it is the package folder or `dev`s the package), and a content hash that changes when any file the environment is built from changes.
- Discovery honors [`JuliaTestItems.toml`](../guide/configuration).

## Execution with TestItemControllers

TestItemControllers runs test items in managed Julia child processes. You give it environments, items, work units and setups; it launches or reuses processes, distributes the work, and reports back through callbacks. The controller is a single-threaded, event-driven reactor: you start it on a task and talk to it through `execute_testrun`, `terminate_test_process` and `shutdown`.

### Callbacks

```julia
using TestItemControllers

callbacks = ControllerCallbacks(
    on_testitem_started = (run_id, item_id, env_id) -> nothing,
    on_testitem_passed  = (run_id, item_id, env_id, duration, perf=nothing) -> nothing,
    on_testitem_failed  = (run_id, item_id, env_id, messages, duration, perf=nothing) -> nothing,
    on_testitem_errored = (run_id, item_id, env_id, messages, duration, perf=nothing) -> nothing,
    on_testitem_skipped = (run_id, item_id, env_id, reason=nothing) -> nothing,
    on_append_output    = (run_id, item_id, env_id, output) -> nothing,   # item_id === nothing → process-level output
    on_attach_debugger  = (run_id, debug_pipe_name) -> nothing,
    # optional:
    on_process_created        = (id, env_id) -> nothing,
    on_process_terminated     = id -> nothing,
    on_process_status_changed = (id, status) -> nothing,   # "Launching", "Revising", "Running", "Idle", …
    on_process_output         = (id, output) -> nothing,
)
```

The seven test item and output callbacks are required, the four process callbacks optional. `duration` is milliseconds, or `nothing` when the controller synthesised the result (timeout, crash, environment activation failure). `messages` is a `Vector{TestMessage}` (`message`, `expected_output`, `actual_output`, `uri`, `line`, `column`, `stack_trace`); `perf` a `PerfStats` (`elapsed`, `bytes`, `allocs`, `gctime`, `compile_time`, `recompile_time`). The trailing `perf`/`reason` arguments are optional — a callback that does not accept them is called without them.

**Callbacks run on the reactor task.** Do not block in them and do not touch shared state without a lock; hand the data to a channel and process it elsewhere (which is exactly what TestItemRuns does). Every (item, environment) unit produces exactly one terminal callback, preceded by at most one `started`.

### Controller lifecycle

```julia
ctrl = TestItemController(callbacks; schedule=:duration, log_level=:Info)
reactor = @async run(ctrl)                       # the reactor loop; keep this task alive
# … execute_testrun(...) as often as you like …
shutdown(ctrl)                                    # kills every process; returns immediately
wait_for_shutdown(ctrl, reactor)                  # blocks until the reactor and every process task are gone
```

`TestItemController(callbacks; error_handler_file=nothing, crash_reporting_pipename=nothing, log_level=:Info, schedule=:duration, shutdown_grace_seconds=30.0)`. Processes that do not exit within the grace period are force-killed. `terminate_test_process(ctrl, id)` kills one process; an item it was running is reported as errored.

### Data types

| Type | Fields (positional constructor order) |
|---|---|
| `TestEnvironment` | `id`, `julia_cmd`, `julia_args::Vector{String}`, `julia_num_threads::Union{Nothing,String}`, `julia_env::Dict{String,Union{String,Nothing}}` (a `nothing` value removes the variable), `mode` (`"Normal"`, `"Coverage"`, `"Debug"`), `package_name`, `package_uri`, `project_uri`, `env_content_hash`, `check_bounds` (`nothing`/`"auto"`/`"yes"`) |
| `TestItemDetail` | `id`, `uri`, `label`, `package_name`, `package_uri`, `option_default_imports::Bool`, `test_setups::Vector{String}`, `line`, `column`, `code`, `code_line`, `code_column`, `option_skip::Union{Bool,String}=false` |
| `TestSetupDetail` | `package_uri`, `name`, `kind` (`"module"`/`"snippet"`), `uri`, `line`, `column`, `code` |
| `TestRunItem` | `testitem_id`, `test_env_id`, `timeout::Union{Nothing,Float64}` (seconds), `log_level::Symbol` |

The pool key for process reuse is the environment minus its content hash — `project_uri`, `package_uri`, `package_name`, `julia_cmd`, `julia_args`, `julia_num_threads`, `mode`, `julia_env`, `check_bounds`. A pooled process is **revised** (Revise) when a run arrives with the same `env_content_hash` and **restarted** when the hash changed. See [Test Processes](../guide/test-processes).

### Running

```julia
coverage = execute_testrun(ctrl, run_id, test_envs, test_items, work_units, test_setups, max_processes, token;
                           coverage_root_uris=nothing, gc_between_testitems=nothing, memory_threshold=nothing)
```

Blocks until every work unit has a terminal result (or the run was cancelled), then returns the merged coverage — a `Vector{FileCoverage}` (`uri`, `coverage::Vector{Union{Int,Nothing}}`, one entry per line) when some environment used `"Coverage"` mode, `nothing` otherwise. Results themselves arrive only through the callbacks. `token` is a `TestItemControllers.CancellationTokens.CancellationToken` or `nothing`; cancelling reports the remaining units as skipped, kills the run's processes and makes the call return normally.

- `test_items` must be unique by `(id, package_uri)`; `execute_testrun` throws otherwise.
- `coverage_root_uris` restricts which files are instrumented — pass the package uris, or nothing is collected.
- `gc_between_testitems=nothing` means "on when more than one process is used"; `memory_threshold` is a fraction of system memory above which a process is recycled.
- Several `execute_testrun` calls may be in flight on one controller (from different tasks); processes are shared through the pool.

### Putting it together

The bridge from discovery to execution — the same code that lives in TestItemRuns' `discover_testitems` and `run_async!`:

```julia
using JuliaWorkspaces, TestItemControllers, UUIDs

jw = workspace_from_folders([pkg_path])
items = TestItemDetail[]; setups = TestSetupDetail[]; envs = Dict{String,TestEnvironment}()
for (uri, details) in pairs(get_test_items(jw))
    env = get_test_env(jw, uri); text = get_text_file(jw, uri)
    env.package_uri === nothing && continue
    pkg_uri = string(env.package_uri)
    tenv = get!(envs, pkg_uri) do
        TestEnvironment(string(uuid4()), "julia", String[], nothing,
            Dict{String,Union{String,Nothing}}("JULIA_PROJECT" => nothing, "JULIA_LOAD_PATH" => nothing, "JULIA_DEPOT_PATH" => nothing),
            "Normal", something(env.package_name, ""), pkg_uri,
            env.project_uri === nothing ? nothing : string(env.project_uri),
            env.env_content_hash, nothing)
    end
    for it in details.testitems
        p = position_at(text.content, first(it.range)); c = position_at(text.content, first(it.code_range))
        push!(items, TestItemDetail(it.id, string(it.uri), it.name, tenv.package_name, pkg_uri,
            it.option_default_imports, string.(it.option_setup), p.line, p.column,
            text.content.content[it.code_range], c.line, c.column, it.option_skip))
    end
    for s in details.testsetups
        p = position_at(text.content, first(s.code_range))
        push!(setups, TestSetupDetail(pkg_uri, string(s.name), string(s.kind), string(uri), p.line, p.column,
            text.content.content[s.code_range]))
    end
end
env_by_pkg = Dict(e.package_uri => e.id for e in values(envs))
work = [TestRunItem(i.id, env_by_pkg[i.package_uri], 300.0, :Info) for i in items]

ctrl = TestItemController(callbacks)
reactor = @async run(ctrl)
try
    execute_testrun(ctrl, string(uuid4()), collect(values(envs)), items, work, setups, 4, nothing)
finally
    shutdown(ctrl); wait_for_shutdown(ctrl, reactor)
end
```

If you find yourself writing this, TestItemRuns' `discover_testitems`/`TestSession` are the maintained version of it.

### Results, JUnit and LCOV

TestItemControllers also owns the aggregated result type (`TestItemControllers.Results.TestrunResult`) and its writers, `write_json`/`read_json`, `write_junit_xml`, `write_lcov`. Callback-driven consumers build a `TestrunResult` themselves (TestItemRuns does this for you); the formats are described in [Result formats](./results).

### Scheduling

`TestItemControllers.schedule_testitems(items, workers; setup_costs, worker_setups)` is the assignment algorithm behind `schedule=:duration` — parallel-machine scheduling with job families for shared `@testmodule` setups, previously failed items first. It is public (though not exported) for tools that want to plan a run without a controller; see the [Test Processes](../guide/test-processes#scheduling) page for the behavior and the TestItemControllers docs for the signature.
