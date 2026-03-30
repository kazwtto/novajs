# NOVAjs

N.O.V.A (Not Optimized, Very Awful) é uma linguagem de programação que transpila para JavaScript. 

Como programdor que tem como unica ferramenta o celular, me veio a necessidade uma linguagem facil de escrever para ser usada em projetos pessoais (por isso, seu nome era LazyJS originalmente), mas no fim, ela se tornou uma prova de conceito, naqual eu adicionava qualquer coisa que passava minha cabeça.


Não recomendo usar em projetos reais, mas também não impeço. Divirta-se!

---

## Instalação

```html
<script src="path/to/nova-lang.js"></script>

<script type="text/novajs">
  print("I Hate JS!")
</script>
```

O runtime detecta e executa automaticamente. 

---

## A ideia geral

NOVA lê seu código, entende (na maioria das vezes), e gera JavaScript padrão assim como TypeScript (mas sem os beneficios e mais amaldiçoado).

```typescript
name = "world"
if name == "world" print("Hello, " + name + "!")
else print("Goodbye, World")
```

Sem ponto e vírgula obrigatório. Sem parênteses obrigatórios no `if`. Sem `const` obrigatório. NOVA confia em você. Talvez demais.

---

## Variáveis

Esqueça `let`, `const` e `var`. Mas você ainda pode usar, se quiser!

```typescript
let x = 10
x = 10              // also works → let x = 10
MAX_SPEED = 300     // ALLCAPS becomes const automatically

let name is "Ana"   // 'is' and '=' are interchangeable. No idea why you'd use this, but you can.
```

Tipos são opcionais — se você colocar e violar em runtime, NOVA grita educadamente:

```typescript
let age: number = 25
age = "twenty five"  // [NOVA] Type error: variable "age" expects number but got string
```

`any` desativa a checagem. É o equivalente a colocar um band-aid num navio afundando.

---

## Operadores

`==` vai pra `===`. Sempre. Porque `0 == ""` sendo `true` é um crime contra a humanidade.

```typescript
x == y     // ===  (always strict)
x ?= y     // ==   (loose, use wisely)
x and y    // &&
x or y     // ||
not x      // !
x ^ y      // **  (looks nicer)
x × y      // *   (U+00D7, because why not?)
```

`and` e `or` existem porque, de alguma era, me deixa mais confortavél usa-los. 
Lembre-se, eu programo pelo celular, então evitar trocar a aba do teclado virtual é uma benção!

### Sobrecarga de Operadores

`+`, `-`, `*` e `/` se comportam diferente dependendo dos tipos. Combinações que não fazem sentido lançam `TypeError`.

```typescript
// +  adds, concatenates, or inserts — depends on the types
"ha" + "ha"       // "haha"
[1, 2] + 3        // [1, 2, 3]
{a:1} + {b:2}     // {a:1, b:2}

// -  subtracts, removes, or deletes
"abcde" - 2              // "abc"  (removes last 2 chars)
[1, null, 2] - null      // [1, 2]
{a:1, b:2} - ["a"]       // {b:2}

// *  multiplies, repeats, or scales
"ha" * 3          // "hahaha"
2 * [1, 2, 3]     // [2, 4, 6]
{a:2, b:4} * 3    // {a:6, b:12}

// /  divides, splits, or partitions
"a-b-c" / "-"     // ["a", "b", "c"]
[1,2,3,4] / 2     // [[1,2],[3,4]]
{a:6, b:4} / 2    // {a:3, b:2}
```

---

## Funções

Três keywords porque uma não seria suficiente: `func`, `function`, `fn`. Escolha a sua favorita e seja consistente (ou não).
`def` não foi incluso porque não gosto de Python. Sinta-se livre para me julgar.

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

Parâmetros tipados são checados em runtime:

```typescript
func add(a: number, b: number) {
  a + b
}

add(1, "two")  // [NOVA] Type error: variable "b" expects number but got string
```


Arrow functions também funcionam normalmente:

```typescript
let double = x => x * 2
let add    = (a, b) => a + b
let fetch  = async (url) => {
  res = await fetch(url)
  await res.json()
}
```


E você também pode adicionar tipagem nas funções!

```typescript
fn double(x: number): number x * 2            // one-liner
fn add(a, b): number { a + b }                // block, implicit return
fn find(id): string? { id == 1 ? "x" : null } // nullable
fn parse(s): number|null { s.number() }       // union
fn log(msg): void { print(msg) }              // void
```

---

## Arrays

Além do normal, arrays aceitam índices decimais para inserção posicional — sem `.splice()`:

```typescript
arr = [1, 2]
arr[0.5] = 3
print(arr)      // [1, 3, 2]

arr[0.5]        // null  (reading with a decimal index always returns null)
```

O decimal indica onde inserir: `arr[1.5] = x` coloca `x` entre o índice 1 e 2.

---

## Loops

NOVA tem loops demais. Por quê? Porque alguém achou que seria uma boa ideia reinventar a roda. E porque deu pra fazer.
Mas não tenha medo, os classicos ainda estão disponivéis!

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

Os classicos `while` e `do` também estão disponivéis.

---

## Sintaxe de Método com `:`

`:` é um alias pra `.` em chamadas de método. 
Não faço a menor ideia por que você usaria isso. Mas pode.

```typescript
arr: push(42)                                        // arr.push(42)
arr: filter(x => x > 2): map(x => x * 10)           // chaining

list(42: push)                                       // list.push(42)
stack("a": push, "b": push, "c": push)               // stack.push("a"); stack.push("b"); stack.push("c")
```

---

## `print`

Mais que `console.log`:

```typescript
print("hello")                  // console.log
print("warning": warn)          // console.warn
print.table(data)               // console.table
print("a": log, "b": warn)      // separate calls, one line
```

---

## DOM e Canvas

NOVA tem `dom` e `canvas` built-in, porque `document.querySelector` toda hora cansa e jQuery é bom demais para ser usado em conjunto com essa atrocidade:

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

Canvas ganhou um destaque especial porque faço jogos e com essa linguagem e não sou fã de bibliotecas.

---

## Extras que existem

- **Métodos em strings**: `.upper()`, `.lower()`, `.reverse()`, `.words()`, e outros
- **Métodos em arrays**: `.first()`, `.last()`, `.shuffle()`, `.chunk()`, `.unique()`, e outros
- **Métodos em objetos**: `.keys()`, `.values()`, `.pick()`, `.omit()`, `.invert()`, e outros
- **Matemática global**: `clamp`, `lerp`, `dist`, `random`, `randomInt`, `smoothstep`, e outros — sem `Math.`
- **`file()` / `fileAsync()`**: carrega JSON, CSV ou texto direto
- **Tipos opcionais** com checagem em runtime
- **`try` sem `catch`**: porque às vezes você só quer ignorar o erro e seguir em frente

---

## Como funciona

1. Você escreve NOVA
2. O Lexer tokeniza
3. O Transpiler gera JavaScript
4. O browser executa
5. Você fica feliz (ou não, porque bugs são comuns)

Se algo der errado entre os passos 3 e 4, o erro aparece no console com `[NOVA]` na frente — para você saber exatamente quem culpar.

---

## Licença

Faça o que quiser.

---

*NOVAjs — porque JavaScript já existe e não está amaldiçoado o suficiente.*
