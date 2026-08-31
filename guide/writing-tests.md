# Writing Tests

## The `@testitem` Macro

A `@testitem` defines an independent, self-contained test:

```julia
@testitem "My test" begin
    @test 1 + 1 == 2
end
```

Each `@testitem` has a **name** (a string) and a **code block**. The code inside must be self-contained — it cannot depend on variables or functions defined outside the block.

### Keyword Arguments

Between the name and the code block, a `@testitem` accepts four keyword arguments:

| Keyword | Type | Default | Description |
|---|---|---|---|
| `tags` | `Vector{Symbol}` | `[]` | Tags for filtering which test items to run. See [Tags](#tags). |
| `setup` | `Vector{Symbol}` | `[]` | Names of `@testmodule` or `@testsnippet` definitions to evaluate before the test item runs. See [Sharing Code Across Test Items](#sharing-code-across-test-items). |
| `default_imports` | `Bool` | `true` | Whether to automatically `using Test` and `using YourPackage` before the test code. See [Default Imports](#default-imports). |
| `skip` | `Bool` or expression | `false` | When `true`, the test item is not run and is reported as skipped. See [Skipping Test Items](#skipping-test-items). |

Any other keyword argument is a test definition error, and is [reported as a diagnostic](./configuration#reporting-problems-in-test-items) rather than silently ignored.

### Default Imports

By default, every `@testitem` automatically runs `using Test` and `using YourPackage`, so you can use `@test`, `@testset`, and anything exported from your package directly.

To disable this behavior:

```julia
@testitem "No default imports" default_imports=false begin
    using MyPackage, Test

    @test foo("bar") == "bar"
end
```

## Where to Place Test Items

Test items can appear **anywhere** in your package — in the `test/` folder, inline in `src/`, or in any other `.jl` file.

### In the Test Folder (Recommended)

The recommended approach is to put `@testitem` blocks into `.jl` files in your `test/` folder and `include` them from `test/runtests.jl`:

```
test/
  test_foo.jl    # contains @testitem blocks
  test_bar.jl    # contains @testitem blocks
  runtests.jl
```

```julia
# test/runtests.jl
using TestItemRunner

@run_package_tests

include("test_foo.jl")
include("test_bar.jl")
```

The test item framework discovers `@testitem`s by scanning `.jl` files — it does **not** rely on `include` for discovery, and none of the runners need a `runtests.jl` at all.

A `runtests.jl` is still worth having for two reasons: it keeps your package working with `Pkg.test()` (see [Legacy Pkg.test Integration](./pkg-test)), and `include`ing your test files means Julia parses them, catching syntax errors and typos that would otherwise go undetected until that particular test item ran. The `include`d files are evaluated but the `@testitem` macro is a no-op at include time, so there is no performance cost.

### Inline in Source Code

You can also place test items right next to the code they test. Add `TestItems` as a dependency so you have access to the `@testitem` macro:

```julia
module MyPackage

using TestItems

export foo

foo(x) = x

@testitem "foo tests" begin
    @test foo("bar") == "bar"
    @test length(foo("bar")) == 3
end

end
```

Inline test items are automatically discovered — no additional configuration needed.

If you need to keep some files *out* of discovery — vendored sources, generated
code, scratch files — see [Configuration](./configuration).

## Tags

Tags let you categorize and filter test items:

```julia
@testitem "Database tests" tags=[:slow, :database] begin
    # ...
end

@testitem "Unit tests" tags=[:fast] begin
    # ...
end
```

Tags are `Symbol`s and can be used to filter which tests to run on every surface. See the [VS Code](./vscode#filtering-by-tags), [REPL](./repl#run-flags), [command line](./cli#filtering), [CI](./ci), and [Pkg.test](./pkg-test#filtering) guides for filtering details.

## Skipping Test Items

The `skip` keyword marks a test item as one that should not run. It is still discovered, still shown in the test tree, and reported as **skipped** rather than quietly disappearing:

```julia
@testitem "not ready yet" skip=true begin
    @test false
end
```

`skip` also accepts an arbitrary expression that evaluates to a `Bool`:

```julia
@testitem "needs a recent Julia" skip=(VERSION < v"1.11") begin
    @test contains_new_feature()
end

@testitem "posix only" skip=Sys.iswindows() begin
    @test run(`ls`).exitcode == 0
end
```

::: tip The expression runs in the test process
A `skip` expression is evaluated **in the test process**, immediately before the test item would have run — not by whatever discovered the test item.

That is the whole point of it. The test processes may be running a different Julia version than the editor, the REPL or the CI runner driving them (`juliati --julia-cmd`, DevREPL's `+channel`, and a CI matrix all do exactly that), and on a remote or containerized setup they may not even be running on the same operating system. `VERSION` and `Sys.iswindows()` in a `skip` expression answer for the process that would actually run the test, which is the only answer that is ever correct.
:::

This is also why `skip` is not just a tag plus a filter: tags are literals resolved when the file is parsed, whereas `skip` is a question that can only be answered where the test runs.

## Sharing Code Across Test Items

By default, test items are fully independent. When you need to share setup code, the framework provides two mechanisms: **test snippets** and **test modules**.

### Test Snippets (`@testsnippet`)

A `@testsnippet` is a block of code that gets inlined into each test item that uses it. The snippet code runs every time the test item runs.

```julia
@testsnippet DatabaseSetup begin
    db = connect_to_test_database()
    populate_test_data!(db)
end
```

Use it from a test item via the `setup` keyword:

```julia
@testitem "Query tests" setup=[DatabaseSetup] begin
    results = query(db, "SELECT * FROM users")
    @test length(results) > 0
end
```

The code from `DatabaseSetup` runs before the test item's own code, and all variables defined in the snippet (like `db`) are available in the test item's scope.

### Test Modules (`@testmodule`)

A `@testmodule` defines a Julia module that is evaluated **once per test process** and shared across all test items that reference it:

```julia
@testmodule HeavySetup begin
    const LARGE_DATASET = load_dataset("testdata/large.csv")
end
```

Use it from a test item:

```julia
@testitem "Dataset tests" setup=[HeavySetup] begin
    @test length(HeavySetup.LARGE_DATASET) > 1000
end
```

Note the key differences from snippets:
- Access members with the module name prefix: `HeavySetup.LARGE_DATASET`
- The module code runs **once per process**, not once per test item
- Ideal for expensive setup like loading large datasets or starting services

### Snippets vs Modules

| | `@testsnippet` | `@testmodule` |
|---|---|---|
| **Runs** | Every time a test item using it runs | Once per test process |
| **Access** | Variables directly in scope | Prefixed with module name |
| **Use for** | Lightweight setup, test fixtures | Expensive setup, shared resources |

Both `@testsnippet` and `@testmodule` can appear in any `.jl` file in your package, just like `@testitem`.

## Large Data and `const`

Every test item runs in a module of its own, and Julia cannot unload a module. Once a test item has finished its globals are set to `nothing`, so that whatever they pointed at can be collected — otherwise a run would hold on to every array every test item ever created.

A `const` cannot be released that way. On Julia 1.12 and later a constant's binding keeps its old value alive for the rest of the process, so the test item below costs 800 MB for the whole run rather than just for its own duration:

```julia
@testitem "expensive" begin
    const data = rand(100_000_000)   # stays in memory until the process exits

    @test size(data) == (100_000_000,)
end
```

Binding the same array to a plain global instead lets it be collected as soon as the test item finishes:

```julia
@testitem "expensive" begin
    data = rand(100_000_000)         # released when the test item finishes

    @test size(data) == (100_000_000,)
end
```

This only matters for large objects. A `const` holding a number, a symbol or a small configuration object is not worth thinking about.
