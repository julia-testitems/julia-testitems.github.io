# Writing Tests

## The `@testitem` Macro

A `@testitem` defines an independent, self-contained test:

```julia
@testitem "My test" begin
    @test 1 + 1 == 2
end
```

Each `@testitem` has a **name** (a string) and a **code block**. The code inside must be self-contained — it cannot depend on variables or functions defined outside the block.

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

The test item framework discovers `@testitem`s by scanning `.jl` files — it does **not** rely on `include` for discovery. However, including your test files in `runtests.jl` is still recommended because Julia will parse them and catch syntax errors, typos, and other issues that would otherwise go undetected until the test item actually runs. The `include`d files are evaluated but the `@testitem` macro is a no-op at include time, so there is no performance cost.

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

Tags are `Symbol`s and can be used to filter which tests to run in VS Code, on the command line, and in CI. See the [VS Code](./vscode), [CLI](./cli), and [CI](./ci) guides for filtering details.

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
