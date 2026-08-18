# Legacy Pkg.test Integration

[TestItemRunner.jl](https://github.com/julia-vscode/TestItemRunner.jl) integrates test items with the standard `Pkg.test()` workflow, so your `@testitem`s run from the usual `test/runtests.jl` entry point.

::: tip Which should I use?
For running tests yourself — locally or in CI — prefer the [`juliati` command line runner](./cli). It is faster to invoke, runs test items in parallel by default, and gives you per-item results.

`Pkg.test` integration still matters when something *else* insists on calling `Pkg.test()`: package registries and their automated checks, downstream integration testing, `] test` habits, and any CI you have not migrated. Keeping a `test/runtests.jl` around costs you nothing and makes your package behave like every other Julia package.
:::

The two approaches are not exclusive. The same `@testitem` blocks work under both, so a package can ship a `runtests.jl` for compatibility while you use `juliati` day to day. They also build the same kind of test environment — see [Environments](./environments) for what test items run in outside of `Pkg.test`.

## Setup

1. Add TestItemRunner.jl as a test dependency:
   ```julia
   # In your package directory
   using Pkg
   Pkg.activate("test")
   Pkg.add("TestItemRunner")
   ```

2. Create or update `test/runtests.jl`:
   ```julia
   using TestItemRunner

   @run_package_tests
   ```

Now `Pkg.test()` will discover and run all `@testitem`s in your package.

## Filtering

Pass a `filter` function to `@run_package_tests`:

```julia
using TestItemRunner

# Skip tests tagged :skipci
@run_package_tests filter=ti->!(:skipci in ti.tags)
```

The filter function receives a named tuple with metadata about each test item:

- `filename` — full path of the file where the test item is defined
- `name` — the name of the test item
- `tags` — a `Vector{Symbol}` of tags

You can write arbitrarily complex filter conditions:

```julia
# Run only tests tagged :fast
@run_package_tests filter=ti->(:fast in ti.tags)

# Run tests from a specific file
@run_package_tests filter=ti->(endswith(ti.filename, "test_foo.jl"))

# Combine conditions
@run_package_tests filter=ti->(!(:skipci in ti.tags) && endswith(ti.filename, "test_foo.jl"))
```

Note that this is a Julia *function* taking a named tuple, whereas `juliati --filter` takes an [expression](./cli#filtering) over the same variables — the concepts match, but the syntax differs.
