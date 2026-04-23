# NOVAjs

N.O.V.A (Not Optimized, Very Awful) is a programming language that transpiles to JavaScript. 

As a programmer whose only tool is a phone, I felt the need for an easy-to-write language to use in personal projects (which is why its original name was LazyJS), but in the end, it became a proof of concept where I added whatever crossed my mind.

I don't recommend using it in real projects, but I won't stop you either. Have fun!

You can check out the full documentation [here](https://novajs.netlify.app/) and test it [here](https://novajs.netlify.app/).


The language code was optimized by Claude Sonnet 4.6, so it's not as bad as it originally was. but it's still awful.

---

## Installation

```html
<script src="https://cdn.jsdelivr.net/gh/kazwtto/novajs@main/src/nova.min.js"></script>

<script type="text/novajs">
    print("I Hate JS!")
</script>
```

The runtime automatically detects and executes it. 

---

## The General Idea

NOVA reads your code, understands it (most of the time), and generates standard JavaScript just like TypeScript (but without the benefits and way more cursed).

```typescript
name = "world"
if name == "world" print("Hello, " + name + "!")
else print("Goodbye, World")
```

No mandatory semicolons. No mandatory parentheses in `if` statements. No mandatory `const`. NOVA trusts you. Maybe too much.

---

## Variables

Forget `let`, `const`, and `var`. But you can still use them if you want!

```typescript
let x = 10
x = 10              // also works → let x = 10
MAX_SPEED = 300     // ALLCAPS becomes const automatically

let name is "Ana"   // 'is' and '=' are interchangeable. No idea why you'd use this, but you can.
```

Types are optional — if you set them and violate them at runtime, NOVA politely screams:

```typescript
let age: number = 25
age = "twenty five"  // [NOVA] Type error: variable "age" expects number but got string
```

`any` disables checking. It's the equivalent of putting a band-aid on a sinking ship.

---

## Operators

`==` becomes `===`. Always. Because `0 == ""` being `true` is a crime against humanity.

```typescript
x == y     // ===  (always strict)
x ?= y     // ==   (loose, use wisely)
x and y    // &&
x or y     // ||
not x      // !
x ^ y      // ** (looks nicer)
x × y      // * (U+00D7, because why not?)
```

`and` and `or` exist because, for some reason, they make me feel more comfortable. Remember, I code on a phone, so avoiding switching virtual keyboard tabs is a blessing!

### Operator Overloading

`+`, `-`, `*`, and `/` behave differently depending on the types. Nonsensical combinations throw a `TypeError`.

```typescript
// +  adds, concatenates, or inserts — depends on the types
"ha" + "ha"       // "haha"
[1, 2] + 3        // [1, 2, 3]
{a:1} + {b:2}     // {a:1, b:2}

// -  subtracts, removes, or deletes
"abcde" - 2              // "abc"  (removes last 2 chars)
[1, null, 2] - null      // [1, 2]
{a:1, b:2} - ["a"]       // {b:2}

// * multiplies, repeats, or scales
"ha" * 3          // "hahaha"
2 * [1, 2, 3]     // [2, 4, 6]
{a:2, b:4} * 3    // {a:6, b:12}

// /  divides, splits, or partitions
"a-b-c" / "-"     // ["a", "b", "c"]
[1,2,3,4] / 2     // [[1,2],[3,4]]
{a:6, b:4} / 2    // {a:3, b:2}
```

---

## Functions

Three keywords because one wouldn't be enough: `func`, `function`, `fn`. Choose your favorite and be consistent (or don't).
`def` was not included because I don't like Python. Feel free to judge me.

```typescript
func add(a, b) {
    return a + b
}

fn double(x) x * 2       // one-liner, no return needed

fn greet(name = "world") {
    "Hello, " + name        // last expression is returned automatically
}

fn createPoint(x, y) { x: x, y: y }  // object literal body — NOVA is smart enough to tell the difference
```

Typed parameters are checked at runtime:

```typescript
func add(a: number, b: number) {
    a + b
}

add(1, "two")  // [NOVA] Type error: variable "b" expects number but got string
```

Arrow functions also work normally:

```typescript
let double = x => x * 2
let add    = (a, b) => a + b
let fetch  = async (url) => {
    res = await fetch(url)
    await res.json()
}
```

And you can also add types to functions!

```typescript
fn double(x: number): number x * 2            // one-liner
fn add(a, b): number { a + b }                // block, implicit return
fn find(id): string? { id == 1 ? "x" : null } // nullable
fn parse(s): number|null { s.number() }       // union
fn log(msg): void { print(msg) }              // void
```

---

## Arrays

On top of the usual stuff, arrays accept decimal indices for positional insertion — no `.splice()` needed:

```typescript
arr = [1, 2]
arr[0.5] = 3
print(arr)      // [1, 3, 2]

arr[0.5]        // null  (reading with a decimal index always returns null)
```

The decimal indicates where to insert: `arr[1.5] = x` puts `x` between index 1 and 2.

---

## Loops

NOVA has too many loops. Why? Because someone thought it'd be a good idea to reinvent the wheel. And because I could.
But don't be afraid, the classics are still available!

```typescript
// starts at 0, goes to 10
for i, 10 {
    print(i)
}

// custom start and end
for i, 1, 5 {
    print(i)   // 1, 2, 3, 4, 5
}

// custom step
for i: 2, 0, 10 {
    print(i)   // 0, 2, 4, 6, 8, 10
}

// multiplicative step
for i: *2, 1, 100 {
    print(i)   // 1, 2, 4, 8, 16, 32, 64
}

// range style (exclusive upper bound, Python-style)
for i range(10)        { ... }   // 0..9
for i range(1, 11)     { ... }   // 1..10
for i range(0, 10, 2)  { ... }   // 0, 2, 4, 6, 8

// classic
for item of list   { print(item) }
for key in object  { print(key) }

// and the old fashioned way, if you miss the pain
for i = 0; i < 10; i++ {
    print(i)
}
```

The classic `while` and `do` are also available.

---

## Method Syntax with `:`

`:` is an alias for `.` in method calls. 
I have absolutely no idea why you'd use this. But you can.

```typescript
arr: push(42)                                        // arr.push(42)
arr: filter(x => x > 2): map(x => x * 10)            // chaining

list(42: push)                                       // list.push(42)
stack("a": push, "b": push, "c": push)               // stack.push("a"); stack.push("b"); stack.push("c")
```

---

## `print`


```typescript
print("hello")                  // console.log
print("warning": warn)          // console.warn
print.table(data)               // console.table
print("a": log, "b": warn)      // separate calls, one line
```

---

## DOM and Canvas

NOVA has built-in `dom` and `canvas`, because writing `document.querySelector` all the time gets tiring and jQuery is way too good to be used alongside this atrocity:

```typescript
btn = dom.get("#btn")
btn.text("click me").style({ color: "red" }).on("click", e => print("clicked"))

cv = canvas("#game")
cv.size(800, 600)
cv.fill("#87CEEB").rect(0, 0, 800, 600)
cv.fill("#FFD700").circle(100, 300, 20)
cv.loop(ts => {
    cv.clear()
    // draw here
})
```

Canvas got a special spotlight because I make games in this language and I'm not a fan of libraries.

---

## Extras that Exist

- **String methods**: `.upper()`, `.lower()`, `.reverse()`, `.words()`, and others
- **Array methods**: `.first()`, `.last()`, `.shuffle()`, `.chunk()`, `.unique()`, and others
- **Object methods**: `.keys()`, `.values()`, `.pick()`, `.omit()`, `.invert()`, and others
- **Global math**: `clamp`, `lerp`, `dist`, `random`, `randomInt`, `smoothstep`, and others — no `Math.` needed
- **`file()` / `fileAsync()`**: loads JSON, CSV, or text directly
- **Optional types** with runtime checking
- **`try` without `catch`**: because sometimes you just want to ignore the error and move on

---

## How it works

1. You write NOVA
2. The Lexer tokenizes it
3. The Transpiler generates JavaScript
4. The browser executes it
5. You get happy (or not, because bugs are common)

If something goes wrong between steps 3 and 4, the error appears in the console prefixed with `[NOVA]` — so you know exactly who to blame.

---

## License

Do whatever you want.

---

*NOVAjs — because JavaScript already exists and isn't cursed enough.*