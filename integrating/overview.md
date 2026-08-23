# Integrating with test items

Every surface in this guide — the [VS Code extension](../guide/vscode), the [`juliati`](../guide/cli) command line, the [`dev>` REPL mode](../guide/repl), the [MCP server](../guide/mcp), the [GitHub Actions](../guide/actions) — is a front end over the same two engines: discovery finds `@testitem`s in source files, execution runs them in managed Julia test processes. This chapter is for people building the *next* front end: a custom runner, an editor integration, a CI reporter, an agent tool.

## The layers

| Layer | Package | What it does |
|---|---|---|
| Macros | [TestItems.jl](https://github.com/julia-vscode/TestItems.jl) | Defines `@testitem`, `@testmodule`, `@testsnippet`. At runtime the macros are no-ops; every other layer reads the source text. |
| Discovery | [JuliaWorkspaces.jl](https://github.com/julia-vscode/JuliaWorkspaces.jl) (using [TestItemDetection.jl](https://github.com/julia-testitems/TestItemDetection.jl)) | Parses files, finds test items, setups and definition errors, resolves which package and environment each file belongs to, applies [`JuliaTestItems.toml`](../guide/configuration). |
| Execution | [TestItemControllers.jl](https://github.com/julia-vscode/TestItemControllers.jl) | Launches and pools test processes, schedules work, reports results, collects coverage, handles timeouts and cancellation. See [Test Processes](../guide/test-processes) for its runtime behavior. |
| Runs | [TestItemRuns.jl](https://github.com/julia-testitems/TestItemRuns.jl) *(prerelease)* | Glues discovery and execution into one Julia API: one-call `run_tests`, plus sessions, runs, events, process and result management. |
| Front ends | VS Code, `juliati`, DevREPL, JuliaMCP, the actions | Rendering, command lines, editor UI. |

The VS Code extension talks to the two engines over the wire — the [language server protocol extension](./language-server) for discovery and the [TestItemControllers JSON-RPC protocol](./jsonrpc) for execution. The Julia front ends (`juliati`, DevREPL, JuliaMCP) go through TestItemRuns.

## Which API should I use?

| You want to… | Use |
|---|---|
| Run test items from Julia — a script, a task runner, an agent tool — and get a result object | [TestItemRuns.jl](./testitemruns): `run_tests(path)` |
| Build a long-lived Julia tool that runs test items repeatedly, reuses test processes, cancels runs, lists processes | [TestItemRuns.jl](./testitemruns): `TestSession`, `run_async!`, events |
| Own discovery yourself (your own workspace, file watching, custom selection) but still execute through the standard engine | [TestItemRuns.jl](./testitemruns) with `discover_testitems(jw)`, or the raw [JuliaWorkspaces + TestItemControllers APIs](./julia-apis) |
| Do custom scheduling, drive `TestItemControllers` callbacks directly, or embed the controller in another Julia process model | [JuliaWorkspaces + TestItemControllers Julia APIs](./julia-apis) |
| Show test items in an editor that already runs the Julia language server | [Language server protocol extension](./language-server) for discovery, [JSON-RPC](./jsonrpc) for execution |
| Run test items from a non-Julia host process | [TestItemControllers JSON-RPC](./jsonrpc) |
| Consume results in dashboards, CI annotations, coverage services | [Result formats](./results): JSON, JUnit XML, LCOV |

::: tip Start with TestItemRuns
Unless you have a reason to be lower down, use TestItemRuns. It is what `juliati`, DevREPL and JuliaMCP are built on, so anything those tools can do — parallel runs, coverage, per-item timeouts, cancellation, live progress, process reuse — is available with a few lines of Julia.
:::

## Concepts every layer shares

A few ideas show up under different names in every API below. Knowing them once saves reading each page twice.

**Test item ids.** Discovery assigns each `@testitem` a stable id of the form `MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats` — package name, the first eight characters of the package UUID, the file path relative to the package root (always `/`-separated), and the item name. Two items with the same name in one file get `#1`, `#2` suffixes (and a definition error). Ids are **scoped to a package, not to a workspace**: the same package checked out into two folders mints the same ids from both. Anything that needs uniqueness keys on the pair `(id, package uri)` — which is why every execution API carries a package or environment id alongside the item id. The [`juliati` page](../guide/cli#test-item-ids) has more on stability guarantees.

**Test environments.** A test item runs against a *package* (whose code it tests) inside a *project* (which supplies the manifest). Discovery resolves both per file — see [Environments](../guide/environments) — and hands them on as `package_name`, `package_uri`, `project_uri` and an `env_content_hash` that changes when the environment's Project/Manifest change. The execution engine pools test processes per environment and, when the hash changes, restarts them instead of reusing them.

**Profiles and modes.** A run executes each item under one or more *profiles* — a name plus a Julia command, environment variables and a *mode* (`Normal` or `Coverage`). Results are merged per item across profiles, which is how a CI matrix ends up in one report.

**Timeouts.** Timeouts are per test item, in seconds. An item that exceeds it is reported as errored with no duration; the test process is recycled.

**Cancellation.** Cancelling a run is not an error: items that had not started are reported as skipped, running processes are killed, and the run finishes normally with a partial result. Every API tells you the run was cancelled through its status, never through an exception.

**One terminal result per unit.** For every (item, environment) pair a run reports exactly one of passed / failed / errored / skipped, preceded by at most one "started". Work stealing between test processes is speculative, but the engine discards the duplicate, so consumers never see two results for one unit.

## Packages and status

| Package | Repository | Status |
|---|---|---|
| TestItems.jl | [julia-vscode/TestItems.jl](https://github.com/julia-vscode/TestItems.jl) | registered |
| JuliaWorkspaces.jl | [julia-vscode/JuliaWorkspaces.jl](https://github.com/julia-vscode/JuliaWorkspaces.jl) | registered |
| TestItemControllers.jl | [julia-vscode/TestItemControllers.jl](https://github.com/julia-vscode/TestItemControllers.jl) · [docs](https://julia-testitems.org/TestItemControllers.jl/) | registered |
| TestItemRuns.jl | [julia-testitems/TestItemRuns.jl](https://github.com/julia-testitems/TestItemRuns.jl) | prerelease |
| TestItemApp.jl (`juliati`) | [julia-testitems/TestItemApp.jl](https://github.com/julia-testitems/TestItemApp.jl) | registered |
| DevREPL.jl | [julia-vscode/DevREPL.jl](https://github.com/julia-vscode/DevREPL.jl) | prerelease |
| JuliaMCP.jl | [julia-vscode/JuliaMCP.jl](https://github.com/julia-vscode/JuliaMCP.jl) | prerelease |
| LanguageServer.jl | [julia-vscode/LanguageServer.jl](https://github.com/julia-vscode/LanguageServer.jl) | registered |

::: warning Interfaces may still change
The prerelease packages, and the wire protocols described in this chapter, are what today's tools use, but they are not yet frozen. Pin versions and expect to follow along until the first stable releases.
:::
