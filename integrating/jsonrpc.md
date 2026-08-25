# TestItemControllers JSON-RPC protocol

[TestItemControllers.jl](https://github.com/julia-vscode/TestItemControllers.jl) can be driven from outside Julia: a host process launches a Julia process running `JSONRPCTestItemController`, connects a pair of streams to it, and speaks JSON-RPC 2.0. That is how the [VS Code extension](../guide/vscode) runs test items, and it is the integration path for any editor or tool that is not written in Julia. Everything the Julia API can do — process pooling, parallel execution, coverage, timeouts, debugging hooks — is available over the wire.

::: warning Interfaces may still change
The protocol is what the VS Code extension uses today and is documented as such; it is not yet frozen. The canonical reference is the [JSONRPC API section](https://julia-testitems.org/TestItemControllers.jl/jsonrpc-api/) of the TestItemControllers documentation.
:::

## Transport and launch

Framing is JSON-RPC 2.0 with `Content-Length` headers, exactly like the Language Server Protocol. All field names are camelCase.

TestItemControllers ships no executable; the host starts Julia with a small entry script in an environment where TestItemControllers is installed (it vendors its own dependencies, so that environment needs nothing else) and connects a pair of streams. The VS Code extension uses the child's stdio — which means the script must make sure nothing else ever writes to stdout:

```julia
# controller_main.jl — launched as `julia --startup-file=no --history-file=no controller_main.jl`
using TestItemControllers

conn_in, conn_out = stdin, stdout
redirect_stdout(stderr)              # stray package output must not corrupt the JSON-RPC stream
redirect_stdin()

ctrl = JSONRPCTestItemController(conn_in, conn_out;
    error_handler_file = nothing,        # optional Julia file loaded into every test process (custom error handling)
    crash_reporting_pipename = nothing)  # optional named pipe for crash diagnostics
run(ctrl)                                # blocks until shutdown or until the connection closes
```

Any other pair of streams — a named pipe opened with `Sockets.connect`, a TCP socket — works the same way. `run` starts the JSON-RPC message loop and the controller reactor. Each incoming request is served on its own task, so a `terminateTestProcess` is handled while a `createTestRun` is still blocking. When the connection closes without a `shutdown`, the controller shuts itself down the same way, so test processes never outlive their client. TestItemControllers requires Julia 1.12 or newer for the controller process; test processes can run older Julia versions.

## Requests (client → controller)

### `createTestRun`

Start a run. **The request blocks until every work unit has a terminal result** (or the run was cancelled through `shutdown`); progress arrives as notifications in the meantime. Several `createTestRun` requests may be in flight at once; they share the process pool.

| Field | Type | Meaning |
|---|---|---|
| `testRunId` | string | Unique per run; echoed in every notification. |
| `testEnvironments` | `TestEnvironment[]` | The Julia process configurations. |
| `testItems` | `TestItemDetail[]` | Every item referenced by `workUnits`; unique by `(id, packageUri)`. |
| `workUnits` | `TestRunItem[]` | The (item, environment) pairs to execute — an item runs once per environment it is paired with. |
| `testSetups` | `TestSetupDetail[]` | Every `@testmodule`/`@testsnippet` the items may use. |
| `maxProcessCount` | integer | Upper bound on concurrent test processes for this run. |
| `coverageRootUris` | string[], optional | URI prefixes to collect coverage for (pass the package URIs; without roots nothing is collected). |

Response:

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"success"` on normal completion. |
| `coverage` | `FileCoverage[]`, optional | Merged coverage when some environment used `"Coverage"` mode. `FileCoverage` is `{ "uri": string, "coverage": (integer \| null)[] }`, one entry per source line, `null` for lines that cannot be instrumented. |

#### `TestEnvironment`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Referenced by `workUnits` and every notification (`testEnvId`). |
| `juliaCmd` | string | Executable, e.g. `"julia"` or a `juliaup` channel command. |
| `juliaArgs` | string[] | Extra command line arguments. |
| `juliaNumThreads` | string, optional | The `--threads` value (`"4"`, `"auto"`, `"4,1"`). |
| `juliaEnv` | object of string → string \| null | Environment variables; `null` removes a variable. Clear `JULIA_PROJECT`, `JULIA_LOAD_PATH` and `JULIA_DEPOT_PATH` unless you mean them. |
| `mode` | string | `"Normal"`, `"Coverage"` or `"Debug"`. |
| `packageName`, `packageUri` | string | The package under test. |
| `projectUri` | string, optional | The project supplying the manifest ([Environments](../guide/environments)). |
| `envContentHash` | string, optional | Changes when any file the environment is built from changes — the chosen project's Project/Manifest, the package's own pair, and the package's `test/Project.toml`/`test/Manifest.toml`. A pooled process is revised when it matches and restarted when it differs. |
| `checkBounds` | string, optional | `"auto"` (default) or `"yes"`; see [`juliati --check-bounds`](../guide/cli#bounds-checking). |

These are exactly the values the language server returns from [`julia/getTestEnv`](./language-server#julia-gettestenv-client-→-server).

#### `TestItemDetail`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | The [stable id](./overview#concepts-every-layer-shares). |
| `uri` | string | The file. |
| `label` | string | The item name. |
| `packageName`, `packageUri` | string | Must match a `TestEnvironment`. |
| `useDefaultUsings` | boolean | The `default_imports` option. |
| `testSetups` | string[] | Names of setups the item uses. |
| `line`, `column` | integer | 1-based position of the `@testitem` call. |
| `code` | string | The body source. |
| `codeLine`, `codeColumn` | integer | 1-based position of the body — where `code` starts, so error locations map back to the file. |
| `optionSkip` | boolean or string, optional | `true`/`false`, or the source text of the `skip=` expression to evaluate in the test process. Absent means `false`. |

#### `TestRunItem`

| Field | Type | Meaning |
|---|---|---|
| `testitemId` | string | Note the lowercase `i`. |
| `testEnvId` | string | |
| `timeout` | number, optional | Per-item timeout in **seconds**. |
| `logLevel` | string | `"Info"`, `"Debug"`, … — the log level of the test process for this item. |

#### `TestSetupDetail`

`packageUri`, `name`, `kind` (`"module"` or `"snippet"`), `uri`, `line`, `column` (1-based position of the setup body), `code`.

### `terminateTestProcess`

`{ "testProcessId": string }` → `null`. Kills one test process; an item it was running is reported as errored, and the pool launches a replacement when the next run needs one.

## Notifications (client → controller)

### `shutdown`

No parameters. Cancels every active run (their remaining items are reported as skipped), terminates every test process — force-killing any that does not exit within the grace period — and lets `run` return. Sending it before closing the connection is preferable to just disconnecting: the client still gets the `testProcessTerminated` notifications.

There is no per-run cancel message: to stop one run early, terminate its processes with `terminateTestProcess`, or shut the controller down.

## Notifications (controller → client)

Fire-and-forget progress events. Every test item notification carries `testRunId`, `testItemId` and `testEnvId`; **identify an item by `(testItemId, testEnvId)`**, never by `testItemId` alone (ids are package-scoped, so two checkouts of a package mint the same ids). Each work unit produces exactly one terminal notification — `testItemPassed`, `testItemFailed`, `testItemErrored` or `testItemSkipped` — preceded by at most one `testItemStarted`.

| Method | Params | Meaning |
|---|---|---|
| `testItemStarted` | `testRunId`, `testItemId`, `testEnvId` | |
| `testItemPassed` | + `duration` (number, ms, optional), `perf` (`PerfStats`, optional) | |
| `testItemFailed` | + `messages` (`TestMessage[]`), `duration`, `perf` | `@test` failures. |
| `testItemErrored` | + `messages`, `duration`, `perf` | Exceptions, timeouts, crashes, environment activation failures. `duration` is absent when the controller synthesised the result. |
| `testItemSkipped` | + `reason` (string, optional) | `reason` is the source of the `skip=` expression that evaluated to `true`; absent for cancellation. |
| `appendOutput` | `testRunId`, `testItemId` (optional), `testEnvId`, `output` | Captured stdout/stderr; `testItemId` absent for process-level output. |
| `testProcessCreated` | `id`, `packageName`, `packageUri` (opt), `projectUri` (opt), `coverage` (boolean), `env` (object) | |
| `testProcessStatusChanged` | `id`, `status` | `"Launching"`, `"Activating"`, `"Revising"`, `"Running"`, `"Idle"`, … |
| `testProcessOutput` | `id`, `output` | Output outside of any test item. |
| `testProcessTerminated` | `id` | |
| `launchDebugger` | `testRunId`, `debugPipeName` | A `"Debug"`-mode environment is ready for a debug adapter to attach on the named pipe. |

**`TestMessage`**: `message` (string), `expectedOutput`, `actualOutput`, `uri`, `line`, `column` (all optional; positions are **1-based**, unlike LSP ranges), `stackTrace` (`{ "label", "uri"?, "line"?, "column"? }[]`, optional).

**`PerfStats`**: `elapsed`, `bytes`, `allocs`, `gctime`, `compileTime`, `recompileTime` — each optional; times in milliseconds.

## A complete exchange

One environment, one item, one process, annotated:

```jsonc
// → client
{"jsonrpc":"2.0","id":1,"method":"createTestRun","params":{
  "testRunId":"run-1",
  "testEnvironments":[{"id":"env-1","juliaCmd":"julia","juliaArgs":[],"juliaNumThreads":null,
     "juliaEnv":{"JULIA_PROJECT":null,"JULIA_LOAD_PATH":null,"JULIA_DEPOT_PATH":null},
     "mode":"Normal","packageName":"MyPkg","packageUri":"file:///home/me/MyPkg",
     "projectUri":"file:///home/me/MyPkg","envContentHash":"x1a2b3c4","checkBounds":null}],
  "testItems":[{"id":"MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats",
     "uri":"file:///home/me/MyPkg/test/parsing_tests.jl","label":"parses floats",
     "packageName":"MyPkg","packageUri":"file:///home/me/MyPkg","useDefaultUsings":true,
     "testSetups":[],"line":3,"column":1,"code":"\n    @test parse(Float64, \"1.5\") == 1.5\n",
     "codeLine":3,"codeColumn":41,"optionSkip":false}],
  "workUnits":[{"testitemId":"MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats",
     "testEnvId":"env-1","timeout":300,"logLevel":"Info"}],
  "testSetups":[],"maxProcessCount":1}}

// ← controller
{"jsonrpc":"2.0","method":"testProcessCreated","params":{"id":"p-1","packageName":"MyPkg",
  "packageUri":"file:///home/me/MyPkg","projectUri":"file:///home/me/MyPkg","coverage":false,
  "env":{"JULIA_PROJECT":null,"JULIA_LOAD_PATH":null,"JULIA_DEPOT_PATH":null}}}
{"jsonrpc":"2.0","method":"testProcessStatusChanged","params":{"id":"p-1","status":"Launching"}}
{"jsonrpc":"2.0","method":"testProcessOutput","params":{"id":"p-1","output":"Precompiling MyPkg...\n"}}
{"jsonrpc":"2.0","method":"testProcessStatusChanged","params":{"id":"p-1","status":"Running"}}
{"jsonrpc":"2.0","method":"testItemStarted","params":{"testRunId":"run-1",
  "testItemId":"MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats","testEnvId":"env-1"}}
{"jsonrpc":"2.0","method":"appendOutput","params":{"testRunId":"run-1",
  "testItemId":"MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats","testEnvId":"env-1",
  "output":"Test Summary: | Pass  Total\nparses floats |    1      1\n"}}
{"jsonrpc":"2.0","method":"testItemPassed","params":{"testRunId":"run-1",
  "testItemId":"MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats","testEnvId":"env-1",
  "duration":12.4,"perf":{"elapsed":12.4,"bytes":20480,"allocs":312,"gctime":0.0}}}
{"jsonrpc":"2.0","method":"testProcessStatusChanged","params":{"id":"p-1","status":"Idle"}}
{"jsonrpc":"2.0","id":1,"result":{"status":"success"}}

// the process stays pooled; a second createTestRun for the same environment reuses it
// → client, at the end
{"jsonrpc":"2.0","method":"shutdown"}
// ← controller
{"jsonrpc":"2.0","method":"testProcessTerminated","params":{"id":"p-1"}}
```

## Behind the controller

The controller in turn talks to each test process over its own JSON-RPC connection (`activateEnv`, `testserver/revise`, `testserver/runTestItems`, …). That protocol is internal — a host never sees it — and is described in the [internals section](https://julia-testitems.org/TestItemControllers.jl/internals/) of the TestItemControllers documentation, together with the reactor design, the process state machine and how output is demultiplexed. [Test Processes](../guide/test-processes) describes the observable behavior: pooling, Revise, precompilation, GC, memory recycling, hang diagnostics and scheduling.
