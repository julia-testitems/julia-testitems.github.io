# Command Line

[TestItemRunner.jl](https://github.com/julia-vscode/TestItemRunner.jl) integrates test items with the standard `Pkg.test()` workflow, so you can run your test items from the command line or in any environment that calls `Pkg.test`.

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
