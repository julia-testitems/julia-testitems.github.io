# Getting Started

The test item framework is a set of packages and tools that make it easy to write and run tests for Julia packages.

The main benefit is that you can structure tests into **test items** — independent `@testitem` blocks that can be run individually, in parallel, and across multiple surfaces: VS Code, the REPL, the command line, CI, and AI coding agents.

## Installation

Add the [TestItems.jl](https://github.com/julia-testitems/TestItems.jl) package to your project:

```julia
using Pkg
Pkg.add("TestItems")
```

## Writing Your First Test Item

A `@testitem` always has a name and a `begin ... end` block containing the test code:

```julia
@testitem "First tests" begin
    x = foo("bar")

    @test length(x) == 3
    @test x == "bar"
end
```

The code inside a `@testitem` must be self-contained — it cannot depend on code outside the block unless that code is explicitly imported. By default, `using Test` and `using YourPackage` are automatically executed, so anything exported from `Test` or your package is available directly.

Test items can be placed anywhere in your package:
- In the `test/` folder (recommended — see [Writing Tests](./writing-tests#where-to-place-test-items) for best practices on including them in `runtests.jl`)
- Inline in your `src/` files, right next to the code being tested
- In any `.jl` file in your project

See [Writing Tests](./writing-tests) for the full syntax reference.

To see all of this applied to a complete package — tests, `Pkg.test` compatibility, CI, formatting and docs — read the [Example](./example) walkthrough.

## Running Tests

### In VS Code

If you have the [Julia VS Code extension](https://www.julia-vscode.org/) installed, it automatically discovers all `@testitem`s in your project. You'll see:
- Run buttons next to each test item in the editor
- A test explorer in the Testing activity bar
- Inline test results and failure details

See [VS Code Integration](./vscode) for details.

### On the Command Line

[TestItemApp.jl](https://github.com/julia-vscode/TestItemApp.jl) installs a `juliati` command that runs every test item under a folder in parallel test processes:

```
juliati
```

::: warning Prerelease
TestItemApp.jl is currently a prerelease package and is not yet registered.
:::

See [Command Line](./cli) for installation, filtering, coverage, and JSON output.

### In the REPL

[DevREPL.jl](https://github.com/julia-vscode/DevREPL.jl) adds a `dev>` mode to the Julia REPL. Press `)` to enter it, then pick test items from a fuzzy list, rerun just the failures, and inspect results — all without leaving the terminal.

::: warning Prerelease
DevREPL.jl is currently a prerelease package and is not yet registered. The commands and their behavior may change before the first stable release.
:::

See [REPL Mode](./repl) for the full setup and usage.

### In CI

The [testitem-workflow](https://github.com/julia-testitems/testitem-workflow) provides a reusable GitHub Workflow that handles linting, testing across multiple Julia versions and platforms, documentation deployment, and more — all from a single workflow file. See [CI Integration](./ci) for the full setup, or [GitHub Actions](./actions) if you would rather assemble the individual actions into a pipeline of your own.

### From an AI Agent

[JuliaMCP.jl](https://github.com/julia-vscode/JuliaMCP.jl) is an MCP server that lets AI coding agents list and run test items, read structured failures, and evaluate code in a live Julia session. See [AI Agents (MCP)](./mcp). *(Prerelease)*

## Compatibility with Pkg.test

If you want your test items to also work with the traditional `Pkg.test()` workflow, add [TestItemRunner.jl](https://github.com/julia-vscode/TestItemRunner.jl) as a test dependency and create a `test/runtests.jl` file:

```julia
using TestItemRunner

@run_package_tests
```

This discovers and runs all `@testitem`s in your package via the standard `Pkg.test` entry point. See [Legacy Pkg.test Integration](./pkg-test) for filtering and for when this is worth doing.

## Building tools on top

Everything above is a front end over the same discovery and execution engines. If you are writing your own tool — a runner, an editor integration, a CI reporter — start with the [Integrating](../integrating/overview) chapter, which describes the [TestItemRuns.jl](../integrating/testitemruns) API, the lower-level Julia APIs, the language server protocol extension and the JSON-RPC protocol.
