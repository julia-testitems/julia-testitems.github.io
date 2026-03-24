# Getting Started

The test item framework is a set of packages and tools that make it easy to write and run tests for Julia packages.

The main benefit is that you can structure tests into **test items** — independent `@testitem` blocks that can be run individually, in parallel, and across multiple surfaces: VS Code, the command line, and CI.

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

## Running Tests

### In VS Code

If you have the [Julia VS Code extension](https://www.julia-vscode.org/) installed, it automatically discovers all `@testitem`s in your project. You'll see:
- Run buttons next to each test item in the editor
- A test explorer in the Testing activity bar
- Inline test results and failure details

See [VS Code Integration](./vscode) for details.

### In the REPL

[TestItemREPL.jl](https://github.com/julia-vscode/TestItemREPL.jl) lets you run test items interactively from the Julia REPL. It provides an interactive interface with live progress, filtering by name or tag, and result inspection — all without leaving the terminal.

::: warning Prerelease
TestItemREPL.jl is currently a prerelease package. The API and behavior may change before the first stable release.
:::

See [REPL Runner](./repl) for the full setup and usage.

### In CI

The [testitem-workflow](https://github.com/julia-testitems/testitem-workflow) provides a reusable GitHub Workflow that handles testing across multiple Julia versions and platforms, documentation deployment, and more — all from a single workflow file. See [CI Integration](./ci) for the full setup.

## Compatibility with Pkg.test

If you want your test items to also work with the traditional `Pkg.test()` workflow, add [TestItemRunner.jl](https://github.com/julia-vscode/TestItemRunner.jl) as a test dependency and create a `test/runtests.jl` file:

```julia
using TestItemRunner

@run_package_tests
```

This discovers and runs all `@testitem`s in your package via the standard `Pkg.test` entry point.
