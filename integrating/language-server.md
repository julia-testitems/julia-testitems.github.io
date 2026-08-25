# Language Server Protocol extension

The Julia [language server](https://github.com/julia-vscode/LanguageServer.jl) already keeps a JuliaWorkspaces workspace of every open folder up to date as files are edited, created and deleted. Editors that run it can therefore get test item discovery for free: the server pushes the test items of every file to the client through a small extension of the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/), and answers one request for the environment a file's test items should run in. This is how the [VS Code extension](../guide/vscode) populates its Testing view; the same messages work from any LSP client.

Execution is a separate concern: an editor that has the test items runs them through the [TestItemControllers JSON-RPC protocol](./jsonrpc) (what VS Code does) or, if it can host Julia code, through [TestItemRuns](./testitemruns).

::: warning Interfaces may still change
These messages are what LanguageServer.jl and the VS Code extension use today; they are not part of the LSP standard and may change between releases.
:::

## Opting in

The server only publishes test items when the client asks for them in `initializationOptions` of the `initialize` request:

```json
{
  "initializationOptions": {
    "julialangTestItemIdentification": true
  }
}
```

There is no client capability to declare. Without the flag, discovery still runs internally but no `julia/publishTests` notification is ever sent.

## `julia/publishTests` (server → client)

Sent for a file whenever the server's view of that file's test items changes. Each notification is the **complete state of one file** — replace whatever you had for that URI, do not merge.

```json
{
  "jsonrpc": "2.0",
  "method": "julia/publishTests",
  "params": {
    "uri": "file:///home/me/MyPkg/test/parsing_tests.jl",
    "version": 7,
    "testItemDetails": [
      {
        "id": "MyPkg@a1b2c3d4/test/parsing_tests.jl::parses floats",
        "label": "parses floats",
        "range": { "start": { "line": 2, "character": 0 }, "end": { "line": 4, "character": 3 } },
        "code": "\n    @test parse(Float64, \"1.5\") == 1.5\n",
        "codeRange": { "start": { "line": 2, "character": 40 }, "end": { "line": 4, "character": 0 } },
        "optionDefaultImports": true,
        "optionTags": ["parsing"],
        "optionSetup": ["Fixtures"],
        "optionSkip": false
      }
    ],
    "testSetupDetails": [
      {
        "name": "Fixtures",
        "kind": "module",
        "range": { "start": { "line": 6, "character": 0 }, "end": { "line": 9, "character": 3 } },
        "code": "\n    const data = [1, 2, 3]\n",
        "codeRange": { "start": { "line": 6, "character": 21 }, "end": { "line": 9, "character": 0 } }
      }
    ],
    "testErrorDetails": []
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `uri` | string | The file. |
| `version` | integer, optional | The `textDocument/didChange` version the items were computed from, when the file is open in the editor. Absent for files the server only knows from disk, and for deletions. |
| `testItemDetails` | `TestItemDetail[]` | |
| `testSetupDetails` | `TestSetupDetail[]` | `@testmodule` and `@testsnippet` definitions. |
| `testErrorDetails` | `TestErrorDetail[]` | Definition errors. |

**`TestItemDetail`**

| Field | Type | Meaning |
|---|---|---|
| `id` | string | The [stable id](./overview#concepts-every-layer-shares) (`Pkg@uuid8/relpath::label`, `#N` suffix for duplicate names within a file). |
| `label` | string | The `@testitem` name. |
| `range` | `Range` | The whole `@testitem` call — where an editor puts its run gutter decoration. |
| `code` | string | The source text of the body. |
| `codeRange` | `Range` | The span of the body only. |
| `optionDefaultImports` | boolean | The `default_imports` keyword (default `true`). |
| `optionTags` | string[] | `tags=[...]`, symbols as strings. |
| `optionSetup` | string[] | `setup=[...]` names. |
| `optionSkip` | boolean or string | `true`/`false` for a literal `skip=`; otherwise the source text of the expression, which the test process evaluates just before the item would run. |

**`TestSetupDetail`**: `name` (string), `kind` (`"module"` or `"snippet"`), `range`, `code`, `codeRange`. Setups have no id; they are addressed by name within a package.

**`TestErrorDetail`**: `id` (string, `<uri>:error<N>`), `label` (the item or setup name involved), `range`, `error` (a human-readable message such as `The test item name "x" is used more than once in this file. Test item names must be unique within a file.`).

`Range` is the standard LSP range — `{ "start": {"line", "character"}, "end": {...} }` with **0-based lines and 0-based UTF-16 code-unit characters**, end-exclusive — as everywhere else in the protocol.

### When it is sent

- Immediately after `textDocument/didOpen`, `textDocument/didChange` and `workspace/didChangeWatchedFiles` for the affected files, whenever their test items actually changed (the server hashes the result and does not resend identical state).
- From a debounced sweep over the whole workspace after any workspace mutation (0.4 s after the last change, at most 3 s after the first), which also picks up indirect changes — a `JuliaTestItems.toml` edit that excludes a folder, a `Project.toml` change that moves files into a different package.
- A file that no longer has test items — deleted, excluded by configuration, or an unsaved buffer that was closed — gets a final notification with all three arrays empty and no `version`.

Register watchers for `Project.toml`, `JuliaProject.toml`, `Manifest.toml`, `JuliaManifest.toml` and `JuliaTestItems.toml` (the VS Code extension does) so the server learns about environment and configuration changes.

## `julia/getTestEnv` (client → server)

Asks which environment the test items of a file should run in.

```json
{ "jsonrpc": "2.0", "id": 12, "method": "julia/getTestEnv",
  "params": { "uri": "file:///home/me/MyPkg/test/parsing_tests.jl" } }
```

Result:

| Field | Type | Meaning |
|---|---|---|
| `packageName` | string, optional | The package the file belongs to. |
| `packageUri` | string, optional | URI of the package root folder. |
| `projectUri` | string, optional | URI of the project that supplies the manifest — see [Environments](../guide/environments). |
| `envContentHash` | string, optional | Changes when any file the environment is built from changes: the chosen project's Project/Manifest, the package's own pair, and the package's `test/Project.toml`/`test/Manifest.toml`. |

Each field is absent when unknown (a file outside any package has none). The four values are exactly the `packageName`, `packageUri`, `projectUri` and `envContentHash` fields of a TestItemControllers [`TestEnvironment`](./jsonrpc#testenvironment).

## `julia/setEnvironmentPath` (client → server)

`{ "envPath": "/path/to/environment" }` — tells the server which Julia environment the editor considers active. It becomes the fallback environment for files outside any project, and the fallback test project when no folder above the file is a project — that is, when none has both a project file and a manifest. As a test project it is subject to the same rule as any other: it is used only if it is the package folder itself or its manifest `dev`s the package ([Environments](../guide/environments) explains the rules).

## From publish to run

An editor integration built on these messages does the following:

1. Initialize the server with `julialangTestItemIdentification: true` and, when the user picks one, send `julia/setEnvironmentPath`.
2. Maintain a per-URI store from `julia/publishTests`; render `testItemDetails` as a tree (file → item), `testErrorDetails` as diagnostics, `range` as the run gutter.
3. To run a selection: for each file involved, request `julia/getTestEnv`; group items by `(packageUri, projectUri, envContentHash)`; build one `TestEnvironment` per group and one `TestItemDetail` per item for a `createTestRun` request to a [TestItemControllers](./jsonrpc) process. Convert the LSP `range`/`codeRange` starts to the 1-based `line`/`column`/`codeLine`/`codeColumn` the controller takes, pass `code`, `optionSetup` as `testSetups`, `optionDefaultImports` as `useDefaultUsings`, `optionSkip` as `optionSkip`, and include every `testSetupDetails` entry of the package as `TestSetupDetail`s (with `kind` and the setup's `codeRange` start).
4. Key results by `(testItemId, testEnvId)` — the same item id can appear under two package URIs.

This is what the [Julia VS Code extension](https://github.com/julia-vscode/julia-vscode) does; its test controller is a good reference implementation for another editor.
