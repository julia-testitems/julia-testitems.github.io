# Environments

Every test item runs inside a Julia environment, and which one that is decides which package versions your tests see. The rules are the same on every surface — [VS Code](./vscode), the [REPL](./repl), the [command line](./cli), [CI](./ci) and the [MCP server](./mcp) — because environment discovery is done by [JuliaWorkspaces.jl](https://github.com/julia-vscode/JuliaWorkspaces.jl) and activation by [TestItemControllers.jl](https://github.com/julia-vscode/TestItemControllers.jl), the engine underneath all of them. Where the surfaces differ is in one input to those rules — the *active environment* — and that difference is spelled out [below](#differences-between-surfaces).

The one-sentence version: **a test item runs in the same kind of sandbox that `Pkg.test` would build for the package that owns the file**, and the runner never activates, resolves into, or otherwise writes to any folder of yours while doing so.

## The short answer

| Where the test file lives | What the test item runs in |
| --- | --- |
| Inside a package that has a `test/Project.toml` | A sandbox built from `test/Project.toml`, with the package itself added; versions pinned by the package's `Manifest.toml` if there is one |
| Inside a package that lists test dependencies in `[extras]` / `[targets]` | A sandbox generated from those sections, exactly as `Pkg.test` would; versions pinned by the package's `Manifest.toml` if there is one |
| Inside a package that is `dev`ed by an enclosing project (or by the active environment) | The same sandbox, but versions come from *that project's* `Manifest.toml` instead of the package's own |
| Outside any package | Nothing — there is no package to build a test environment for, and the test item cannot run. See [Troubleshooting](#troubleshooting). |

The rest of this page explains how those rows are arrived at, and what happens in the corners.

## Step 1: which package owns the file

Every folder that contains a `Project.toml` (or `JuliaProject.toml`, which takes precedence) is classified as one of three things:

- **A package** — the project file has a `name`, a `uuid` and a valid `version`. This is what a test item needs.
- **A project** — the folder has a project file *and* a manifest file (`Manifest.toml`, `JuliaManifest.toml`, or a version-specific `Manifest-v1.x.toml`). A package folder that has a manifest is both a package and a project.
- **A plain environment** — a project file with no name/uuid and no manifest. This kind of folder plays no role in choosing a test environment.

For a given test file, the **innermost enclosing package folder** is the package the test item belongs to. Its name is what gets loaded with `using` when the test item runs with default imports, and its `Project.toml` is what the test dependencies are read from. Nesting is fine: in a monorepo where `lib/Inner` sits inside `Outer`, a file in `lib/Inner/test/` belongs to `Inner`, not `Outer`.

## Step 2: which project supplies the manifest

Belonging to a package says *which* package to test. It does not by itself say which *versions* of the package's dependencies to use. That comes from a **project** — a folder with a manifest — and it is chosen like this:

1. Take the **innermost enclosing project** of the test file (a folder with both a project file and a manifest). For an ordinary package with a checked-in `Manifest.toml`, that is the package folder itself.
2. If there is no enclosing project, take the **active environment**, if the surface you are using has one and it is a real project — that is, it has a manifest. An active environment without a manifest is ignored. Which surfaces have an active environment, and where it comes from, is described in the [next section](#the-active-environment-as-fallback).
3. Whatever project step 1 or 2 produced is kept only if it is **the package folder itself**, or a project whose manifest **`dev`s the package** (has it as a `path`-tracked dependency). A project that merely *contains* the package on disk, or that has the package as a regular registered dependency, does not count.
4. If nothing survives, the test item runs with the package folder alone as its source. Since a package folder with its own manifest would already have been picked up in step 1, this means a package without a manifest, and its dependencies are resolved fresh (see [Step 3](#step-3-with-or-without-a-manifest)).

The point of rule 3 is that the manifest actually has to describe the code you are testing. If your workspace environment `dev`s `MyPackage` at `~/code/MyPackage`, its manifest is a faithful description of the dependency graph the package sees, and using it means your tests see the same versions your REPL does. If it does not `dev` the package, using its manifest would pin versions for a graph the package is not part of, so it is left out.

::: tip Monorepos
An outer project whose manifest `dev`s several packages inside it works the way you would hope: a test item in any of those packages uses the outer manifest for its versions, and the sandbox is built for the specific package that owns the file. Each package still gets its own test dependencies from its own `test/Project.toml` or `[extras]`.
:::

## The active environment as fallback

Step 2 above mentions the *active environment*. It is the one place where surfaces differ, because each has a different idea of what "active" means.

### VS Code

The environment shown in the status bar — the one selected through **Julia: Change Current Environment**, or set with the `julia.environmentPath` setting — is passed to the language server, and the language server hands it to the workspace as the active environment. So if you point VS Code at an environment that has a manifest and `dev`s the package you are editing, that manifest decides the versions your test items run against, even though the package folder itself has none.

Two caveats follow from the rules above. If the package folder (or a folder between it and the file) has its own manifest, that wins and the selected environment is not consulted at all. And if the selected environment has no manifest, or does not `dev` the package, it plays no part and the rules fall through to the package folder.

### `dev>` REPL

[DevREPL](./repl) uses the REPL session's own active project (`Base.active_project()`), under the same conditions. Start Julia with `--project=@myworkspace` where `myworkspace` `dev`s your package, and `test run` will use that workspace's manifest.

### `juliati` and the GitHub Action

The [command line runner](./cli) — and therefore the [`julia-run-testitems` action](./actions), which is built on it — has **no active environment**. Only folder discovery applies. Whatever `JULIA_PROJECT` is set to in your shell, and whatever environment `juliati` itself was launched from, is irrelevant to which environment the test items run in.

`juliati` also actively strips `JULIA_PROJECT`, `JULIA_LOAD_PATH` and `JULIA_DEPOT_PATH` from the environment of the test processes it starts, so the shell they inherit from cannot leak an environment into them. If you need one of those to reach the test process — a custom depot path, say — pass it explicitly with `--env JULIA_DEPOT_PATH=...` or `--env-json`.

### Differences between surfaces

| | VS Code | `dev>` REPL | `juliati` / Action |
| --- | --- | --- | --- |
| Active environment considered as fallback project | The environment selected in the status bar / `julia.environmentPath` | The REPL session's `Base.active_project()` | None |
| `JULIA_PROJECT`, `JULIA_LOAD_PATH`, `JULIA_DEPOT_PATH` in test processes | Inherited from the VS Code / language server process | Inherited from the REPL process | Removed; re-add with `--env` |
| Adding environment variables | — | — | `--env`, `--env-json`; the action's `env` input |
| Default `--check-bounds` | `auto` (unless the extension is configured otherwise) | `auto` | `juliati`: `auto`; action: `yes` (see [Bounds checking](./cli#bounds-checking)) |

None of these change *how* an environment is built once it has been chosen — that part is identical everywhere.

## Step 3: with or without a manifest

Once the source — a project or the bare package folder — is known, the runner mirrors it into a throwaway environment of its own before doing anything with it. This mirroring is what guarantees that no `Manifest.toml` is ever written into your tree, and it is where the presence or absence of a manifest matters:

| Source has… | What happens |
| --- | --- |
| A manifest | It is copied over, `dev` paths made absolute, and used as-is. Your tests see **exactly the versions the manifest pins**, and nothing is re-resolved. Version-specific manifests (`Manifest-v1.11.toml`, `JuliaManifest-v1.11.toml`) are preferred over plain `Manifest.toml`, matching `Pkg` — with one wrinkle: discovery looks for the variant matching the Julia that runs the *discovery* (VS Code's language server, `juliati` itself), while the test process picks the variant matching *its* Julia. With `+channel` runs the two can differ; keep a plain `Manifest.toml` alongside if you rely on this. |
| No manifest | Nothing is written next to your `Project.toml`. Instead the mirror is **resolved fresh** — the newest versions that satisfy your `[compat]` bounds — and that resolution lives only in the throwaway environment. Every new test process for that environment resolves again, so two runs a week apart can see different versions. If you want reproducibility, check in a manifest. |
| A manifest this Julia cannot read | On Julia older than 1.7, format-2 manifests are converted to format 1 automatically. If the manifest still cannot be parsed by the running Julia's `Pkg`, it is dropped and the environment is resolved fresh as if there were none. |

Two version notes for older Julia releases: on Julia < 1.11 there is no `[sources]` section, so a manifest-less package is bound into the mirror by an ordinary `Pkg.develop` instead — same result, slightly slower. On Julia < 1.7 the manifest downgrade above applies.

`LocalPreferences.toml` (or `JuliaLocalPreferences.toml`) next to the source project is honoured: it is copied alongside the mirror and additionally made visible through `LOAD_PATH`, so `Preferences.jl`-based settings reach the test process the way they would in `Pkg.test`.

## Step 4: the test target

With the mirror active, the runner does what `Pkg.test` does — through the same code, in fact: it uses a vendored copy of [TestEnv.jl](https://github.com/JuliaTesting/TestEnv.jl), which is `Pkg.test`'s sandbox logic extracted into a package. For the package that owns the file:

- **If `test/Project.toml` exists**, that project is the test environment. The package itself is added to it, and versions of anything shared with the main environment are carried over from the manifest chosen in Step 3.
- **Otherwise**, a test project is generated from the `[extras]` and `[targets]` sections of the package's own `Project.toml` (`test = ["Test", "..."]`), again with the package added and manifest versions carried over.

Either way the result is written to a temporary directory, resolved, and precompiled. If the versions pinned by the manifest cannot all be kept together with the test dependencies, the environment is re-resolved with a warning — `Could not use exact versions of packages in manifest, re-resolving` — which is the same warning `Pkg.test` prints in that situation.

`[extras]` and `[targets]` are always read from the *real* package `Project.toml`, so a package that keeps its test dependencies there does not need to do anything special.

## What the test process sees

A few concrete facts, for when a test item asks questions about its own surroundings:

- **`Base.active_project()`** points at the temporary test sandbox, not at your package folder — just as it does under `Pkg.test`. Nothing is passed on the command line as `--project`; the environment is switched in after the process has started.
- **`pwd()`** is the directory of the file that contains the test item.
- **`LOAD_PATH`** is whatever the process was started with — normally the default `["@", "@v#.#", "@stdlib"]`, so your global environment is stacked underneath the sandbox exactly as under `Pkg.test` — plus, if you have a `LocalPreferences.toml`, one extra entry that carries your preferences.
- **Calling `Pkg.activate` or `cd` inside a test item** does not affect the next test item on the same process; both are restored after every item.
- **`--check-bounds`** is passed only if it is `yes` (the `Pkg.test` behaviour, at the cost of a separate precompile cache); the default `auto` omits the flag entirely so the test process can share precompile caches with your normal sessions. See [Bounds checking](./cli#bounds-checking).
- **Coverage** runs pass `--code-coverage=user`; normal runs pass `--code-coverage=none`.
- **Environment variables** are those of the process that started the run, plus whatever the surface adds — with the [`juliati` exceptions](#juliati-and-the-github-action) above.

## When environments are created and recreated

An environment is materialized once per test process, when the process starts. Test processes are pooled and reused across runs (see [Test Processes](./test-processes)), and the pool is keyed by everything above — package, project, Julia binary and flags, environment variables, coverage mode, bounds checking. A run that asks for the same combination reuses a process that already has the environment loaded, which is why the second run is fast.

If the content of the chosen project's `Project.toml` or `Manifest.toml` changes between runs, the pooled process is not reused: its environment was resolved against the old content, and it is restarted rather than patched. Edits to your source code do not have that effect — those are picked up by Revise.

When several processes start into the same cold environment, one of them precompiles and the others wait for it, so a cold start costs one precompilation, not one per process.

## Legacy `Pkg.test` integration

[TestItemRunner.jl](https://github.com/julia-vscode/TestItemRunner.jl) — the [legacy `Pkg.test` integration](./pkg-test) — does none of the above, and it is worth being explicit about that, because it is the one runner whose environment is *not* chosen by the framework.

- **It does no environment resolution at all.** `@run_package_tests` runs every test item **in the process that called it**, in whatever environment is active there. Under `Pkg.test` that is the sandbox `Pkg` built from `test/Project.toml` or `[extras]`/`[targets]` — so the end result matches Steps 3 and 4 above, but because `Pkg` did the work, not because TestItemRunner did. Called from a REPL, it runs in the REPL's environment, and it is up to you that the package and the test dependencies are loadable there.
- **The package is the one whose `test/runtests.jl` you are in.** `@run_package_tests` takes the folder above `runtests.jl`, reads its `Project.toml`/`JuliaProject.toml`, and uses that `name` for every test item's default `using`. Nested packages inside that folder are not detected; their test items also get `using OuterPackage`. Manifests, enclosing projects and the active environment are never inspected.
- **No test processes.** There is no pool, no `--check-bounds` or coverage flag handling, no `env_content_hash` — the flags are whatever `Pkg.test` passed to the process (`--check-bounds=yes` among them).
- **What is the same:** each test item runs in a fresh module, `pwd()` is set to the test file's directory while it runs, and `Base.active_project()` is `Pkg.test`'s temporary sandbox — the same shape a test item sees under the other runners.

If you use both — `juliati` day to day and `Pkg.test` for registries and downstream CI — the environments agree whenever the package's own `test/Project.toml` or `[extras]` plus its `Manifest.toml` describe what you want. Where they can diverge is the [active-environment fallback](#the-active-environment-as-fallback): a workspace manifest that VS Code or the REPL uses for versions is invisible to `Pkg.test`.

## Troubleshooting

**"Cannot activate an environment"** — the test file is not inside a package folder (a folder whose `Project.toml` has `name`, `uuid` and `version`). Test items are compiled and run against a package's test environment, so a `@testitem` in a loose script or in a folder with only a bare `Project.toml` has nothing to run in. Move the file into a package, or give the folder a proper package `Project.toml`.

**Tests see different versions than my REPL** — your REPL's environment is not being used as the fallback project. Check that it has a `Manifest.toml`, that it `dev`s the package (not `add`s it), and that the surface you are on has an active environment at all — `juliati` never does. Alternatively check in a manifest in the package folder itself.

**"Could not use exact versions of packages in manifest, re-resolving"** — the manifest and the test dependencies could not be satisfied together, so the test environment was resolved fresh. Usually a `[compat]` entry in `test/Project.toml` or `[extras]` conflicts with what the manifest pins.

**A whole process fails before any test item runs** — this is nearly always precompilation of the freshly built environment failing. `test log <id>` in the [REPL](./repl#managing-test-processes) or the Julia Workspace panel in VS Code shows the process's raw output with the actual error.

**I ran the tests and now there is a new `Manifest.toml` in my package** — the test runner did not write it; it never resolves into your folders. Something else did (`Pkg.test`, `Pkg.instantiate`, or an editor action).
