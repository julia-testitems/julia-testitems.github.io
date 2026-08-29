# Example

[TestItemExamplePackage.jl](https://github.com/julia-testitems/TestItemExamplePackage.jl) is a deliberately tiny package that exists for one reason: to show, file by file, what it takes to move a freshly generated Julia package onto the test item stack. It ends up with `@testitem` tests, `Pkg.test` compatibility, the [reusable CI workflow](./ci) with an active format check, and Documenter docs deployed by that same workflow.

This page walks through every change that was made to the bare repository. Each section shows the actual file that was added, so you can copy it into your own package.

::: tip Read it next to the repository
Everything below is a verbatim copy of what is in the repository. If the two ever disagree, the repository wins.
:::

## The starting point

The package was created with `Pkg.generate("TestItemExamplePackage")` and contains exactly two files:

```toml
# Project.toml
name = "TestItemExamplePackage"
uuid = "d5163d8a-30d8-45f6-a98f-5aa01283b29f"
version = "0.1.0"
authors = ["David Anthoff <anthoff@berkeley.edu>"]
```

```julia
# src/TestItemExamplePackage.jl
module TestItemExamplePackage

greet() = print("Hello World!")

end # module TestItemExamplePackage
```

To have something worth testing, the package gained a small amount of real code: three temperature types (`Celsius`, `Fahrenheit`, `Kelvin`), the conversions `to_celsius`, `to_fahrenheit` and `to_kelvin`, an `isapprox` method that compares across scales, and constructors that throw a `DomainError` below absolute zero. None of that matters for the rest of this page — the interesting part is everything around `src/`.

## Add the test dependencies

The only change to `Project.toml` is a `julia` compat bound plus a test target:

```toml
name = "TestItemExamplePackage"
uuid = "d5163d8a-30d8-45f6-a98f-5aa01283b29f"
version = "0.1.0"
authors = ["David Anthoff <anthoff@berkeley.edu>"]

[compat]
julia = "1.10"

[extras]
Test = "8dfed614-e22c-5e08-85e1-65c5234f0b40"
TestItemRunner = "f8b46487-2199-4994-9208-9a1283c18c0a"

[targets]
test = ["Test", "TestItemRunner"]
```

Two things worth noticing:

- **The package itself gains no dependency.** All test items live under `test/`, where the runners provide `@testitem`, `@testsnippet` and `@testmodule`. Only `test/runtests.jl` needs [TestItemRunner.jl](https://github.com/julia-vscode/TestItemRunner.jl), and it gets it through the `test` target.
- **The `julia` compat bound is not optional.** The CI workflow derives its version matrix from it (see [Julia Version Matrix](./ci#julia-version-matrix)); without one, the `compute-test-matrix` job fails.

## Write test items

All tests are `.jl` files in `test/`. Discovery works by scanning for `@testitem` blocks, so the file names are free — the example uses `test_conversions.jl` and `test_shared_module.jl`.

`test/test_conversions.jl` shows the everyday features: a [`@testsnippet`](./writing-tests#test-snippets-testsnippet) with sample data, [tags](./writing-tests#tags) for `:fast` and `:slow`, and a [`skip`](./writing-tests#skipping-test-items) expression that is evaluated in the test process:

```julia
# A snippet is re-evaluated in every test item that lists it in `setup`.
@testsnippet SampleTemps begin
    # (celsius, fahrenheit, kelvin) triples with well-known values
    samples = [
        (0.0, 32.0, 273.15),
        (100.0, 212.0, 373.15),
        (-40.0, -40.0, 233.15),
        (37.0, 98.6, 310.15),
    ]
end

@testitem "Celsius to Fahrenheit" setup = [SampleTemps] tags = [:fast] begin
    for (c, f, _) in samples
        @test to_fahrenheit(Celsius(c)).value ≈ f
    end
end

@testitem "Fahrenheit to Celsius" setup = [SampleTemps] tags = [:fast] begin
    for (c, f, _) in samples
        @test to_celsius(Fahrenheit(f)).value ≈ c
    end
end

@testitem "Kelvin round trips" setup = [SampleTemps] tags = [:fast] begin
    for (c, f, k) in samples
        @test to_kelvin(Celsius(c)).value ≈ k
        @test to_kelvin(Fahrenheit(f)).value ≈ k
        @test to_celsius(Kelvin(k)).value ≈ c
        @test to_fahrenheit(Kelvin(k)).value ≈ f
    end
end

@testitem "Cross-scale comparison" tags = [:fast] begin
    @test Celsius(100) ≈ Fahrenheit(212)
    @test Kelvin(0) ≈ Celsius(-273.15)
    @test !(Celsius(0) ≈ Fahrenheit(0))
end

@testitem "Below absolute zero is rejected" tags = [:fast] begin
    @test_throws DomainError Celsius(-300)
    @test_throws DomainError Fahrenheit(-500)
    @test_throws DomainError Kelvin(-1)
    @test Kelvin(0).value == 0.0
end

@testitem "Round trip over a large range" tags = [:slow] begin
    for c in -273.15:0.01:1000.0
        t = Celsius(c)
        @test to_celsius(to_fahrenheit(t)).value ≈ c atol = 1.0e-9
        @test to_celsius(to_kelvin(t)).value ≈ c atol = 1.0e-9
    end
end

@testitem "Greeting" begin
    @test greet() == "Hello World!"
end

# `skip` takes an arbitrary expression that is evaluated in the test process,
# so it answers for the Julia version that would actually run the test item.
@testitem "Uses a Julia 1.11 feature" skip = (VERSION < v"1.11") begin
    @test length(Memory{Float64}(undef, 3)) == 3
end
```

Note that `using Test` and `using TestItemExamplePackage` are implicit in every test item — that is why the code above can call `to_fahrenheit` and `@test` without importing anything.

`test/test_shared_module.jl` shows a [`@testmodule`](./writing-tests#test-modules-testmodule): unlike a snippet it is evaluated once per test process and shared, which is what you want for expensive fixtures.

```julia
# A test module is evaluated once per test process and shared by every test
# item that lists it in `setup`. Use it for fixtures that are expensive to build.
@testmodule Fixtures begin
    using TestItemExamplePackage

    const boiling = Celsius(100)
    const freezing = Celsius(0)

    # Pretend this table is expensive to compute.
    const table = Dict(c => to_fahrenheit(Celsius(c)) for c in -50:50)
end

@testitem "Fixture constants" setup = [Fixtures] begin
    @test to_fahrenheit(Fixtures.boiling).value ≈ 212
    @test to_kelvin(Fixtures.freezing).value ≈ 273.15
end

@testitem "Fixture table" setup = [Fixtures] begin
    @test length(Fixtures.table) == 101
    @test Fixtures.table[0].value ≈ 32
    @test Fixtures.table[-40].value ≈ -40
end
```

Test items could also be placed [inline in `src/`](./writing-tests#inline-in-source-code), but the example deliberately keeps them in `test/`: it keeps the package free of a test-only dependency and keeps test code out of the shipped module.

## Keep `Pkg.test` working

`test/runtests.jl` makes the same test items run under plain `Pkg.test()`, so registries, downstream packages and `] test` habits keep working:

```julia
using TestItemRunner

@run_package_tests

# Not needed for discovery, but including the files means `Pkg.test` parses
# them and catches syntax errors early.
include("test_conversions.jl")
include("test_shared_module.jl")
```

The `include` lines are optional — nothing in the test item framework relies on them — but they are cheap and catch typos in files that would otherwise only be parsed when a runner gets to them. See [Legacy Pkg.test Integration](./pkg-test) for filtering.

## Add CI

A single workflow file, `.github/workflows/juliaci.yml`, brings in the [reusable workflow](./ci#reusable-workflow-recommended):

```yaml
name: Julia CI

on:
  push: {branches: [main, master], tags: ['**']}
  pull_request: {types: [opened, synchronize, reopened, ready_for_review, converted_to_draft]}
  issue_comment: {types: [created]}
  workflow_dispatch:
    inputs:
      feature:
        type: choice
        description: What to run
        options: [DocDeploy, LintAndTest, TagBot]

jobs:
  julia-ci:
    uses: julia-testitems/testitem-workflow/.github/workflows/juliaci.yml@v2
    permissions: write-all
    secrets:
      codecov_token: ${{ secrets.CODECOV_TOKEN }}
```

That is the whole CI configuration. It runs lint, the format check, tests on every Julia version and platform compatible with `julia = "1.10"`, coverage upload, one aggregated results report, docs deployment, and TagBot — see the [Jobs](./ci#jobs) table for what each does.

Two things happen outside the repository:

- Add a `CODECOV_TOKEN` repository secret (Settings → Secrets and variables → Actions). Without it the coverage upload step fails; everything else still runs.
- If you want the format check to be active, add a `JuliaFormat.toml` — next section.

The example also adds `.github/dependabot.yml`, because the workflow leaves dependency updates to Dependabot rather than running CompatHelper (see [CI Integration](./ci#quick-start)):

```yaml
version: 2
updates:
  - package-ecosystem: "julia"
    directory: "/"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

## Turn on the format check

The workflow's `format` job is a no-op until the repository contains a `JuliaFormat.toml`. The example opts in with a one-liner at the repository root:

```toml
style = "runic"
```

An empty file would also do — it enables the check with the default `minimal` style. See [Formatting](./ci#formatting).

From then on, CI fails with a diff whenever a file is not formatted. To check locally before pushing, run the same tool the CI job uses:

```
juliaformat --check --diff .
```

and `juliaformat .` to rewrite files in place.

## Add documentation

The `deploy-docs` job runs whenever the repository has a `docs/make.jl`; that file's existence is the switch. The example uses a standard Documenter setup.

`docs/Project.toml`:

```toml
[deps]
Documenter = "e30172f5-a6a5-5a46-863b-614d45cd2de4"
TestItemExamplePackage = "d5163d8a-30d8-45f6-a98f-5aa01283b29f"

[sources]
TestItemExamplePackage = {path = ".."}

[compat]
Documenter = "1"
```

`docs/make.jl`:

```julia
using Documenter, TestItemExamplePackage

makedocs(
    sitename = "TestItemExamplePackage.jl",
    modules = [TestItemExamplePackage],
    pages = [
        "Home" => "index.md",
        "API" => "api.md",
    ],
)

deploydocs(
    repo = "github.com/julia-testitems/TestItemExamplePackage.jl.git",
    push_preview = true,
)
```

plus `docs/src/index.md` and `docs/src/api.md` (the latter is a single `@autodocs` block).

The workflow passes `GITHUB_TOKEN` to `deploydocs`, which is enough for Documenter to push to the `gh-pages` branch — no `DOCUMENTER_KEY` deploy key is required. The one manual step is to point GitHub Pages at the `gh-pages` branch in the repository settings after the first deployment has created it.

To build locally:

```
julia --project=docs -e 'using Pkg; Pkg.instantiate(); include("docs/make.jl")'
```

## Run it

With everything in place, the same test items are available on every surface:

- **Command line** — `juliati` in the repository root runs all ten test items in parallel; `juliati --filter ':fast in tags'` runs just the fast ones. See [Command Line](./cli).
- **VS Code** — open the folder and the test items appear in the Testing sidebar with run buttons in the editor. See [VS Code](./vscode).
- **REPL** — `dev> test run` from the `dev>` mode, or `test pick` to choose interactively. See [REPL](./repl).
- **CI** — every push and pull request runs the workflow above; failed test items show up as inline annotations and in one aggregated job summary.
- **`Pkg.test`** — `] test TestItemExamplePackage` still works, via `runtests.jl`.

## Summary

| File | Purpose | Guide page |
| --- | --- | --- |
| `Project.toml` | `[compat] julia`, `Test`/`TestItemRunner` test target | [Getting Started](./getting-started) |
| `test/test_*.jl` | The `@testitem`s, snippets and modules | [Writing Tests](./writing-tests) |
| `test/runtests.jl` | `Pkg.test` compatibility | [Legacy Pkg.test](./pkg-test) |
| `.github/workflows/juliaci.yml` | Lint, format, test matrix, coverage, docs, TagBot | [CI Integration](./ci) |
| `.github/dependabot.yml` | Dependency updates | [CI Integration](./ci) |
| `JuliaFormat.toml` | Opts in to the format check | [Formatting](./ci#formatting) |
| `docs/` | Documenter site, deployed by the workflow | [CI Integration](./ci#jobs) |
