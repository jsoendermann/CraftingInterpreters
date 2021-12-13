import { argv, exit, stdin, stdout } from 'process'
import { readFileSync } from 'fs'
import { createInterface } from 'readline'

class Interpreter implements Visitor<Object> {
  interpret(expr: Expr) {
    try {
      const value = this.evaluate(expr)
      console.log(JSON.stringify(value))
    } catch (e) {
      throw e
    }
  }

  visitLiteralExpr(expr: Literal) {
    return expr.value
  }

  visitGroupingExpr(expr: Grouping) {
    return this.evaluate(expr)
  }

  private evaluate(expr: Expr) {
    return expr.accept(this)
  }

  visitUnaryExpr(expr: Unary) {
    const right = this.evaluate(expr.right)

    switch (expr.operator.type) {
      case TokenType.MINUS:
        return -Number(right)
      case TokenType.BANG:
        return !this.isTruthy(right)
    }

    // unreachable
  }

  private isTruthy(object: any): boolean {
    if (object == null) return false
    if (typeof object === 'boolean') return object
    return true
  }

  visitBinaryExpr(expr: Binary) {
    const left = this.evaluate(expr.left)
    const right = this.evaluate(expr.right)

    switch (expr.operator.type) {
      case TokenType.GREATER:
        return left > right
      case TokenType.GREATER_EQUAL:
        return left >= right
      case TokenType.LESS:
        return left < right
      case TokenType.LESS_EQUAL:
        return left <= right

      case TokenType.BANG_EQUAL:
        return left !== right
      case TokenType.EQUAL_EQUAL:
        return left === right

      case TokenType.MINUS:
        return left - right
      case TokenType.SLASH:
        return left / right
      case TokenType.STAR:
        return left + right
      case TokenType.PLUS: {
        return left + right
      }
    }
  }
}

class Parser {
  private current = 0

  constructor(private tokens: Token[]) {}

  public parse() {
    try {
      return this.expression()
    } catch (error) {
      return null
    }
  }

  private expression() {
    return this.equality()
  }

  private equality() {
    let expr = this.comparison()
    while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
      const operator = this.previous()
      const right = this.comparison()
      expr = new Binary(expr, operator, right)
    }
    return expr
  }

  private comparison() {
    let expr = this.term()

    while (
      this.match(
        TokenType.GREATER,
        TokenType.GREATER_EQUAL,
        TokenType.LESS,
        TokenType.LESS_EQUAL,
      )
    ) {
      const operator = this.previous()
      const right = this.term()
      expr = new Binary(expr, operator, right)
    }

    return expr
  }

  private term() {
    let expr = this.factor()

    while (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous()
      const right = this.factor()
      expr = new Binary(expr, operator, right)
    }

    return expr
  }

  private factor() {
    let expr = this.unary()

    while (this.match(TokenType.SLASH, TokenType.STAR)) {
      const operator = this.previous()
      const right = this.unary()
      expr = new Binary(expr, operator, right)
    }

    return expr
  }

  private unary() {
    if (this.match(TokenType.BANG, TokenType.MINUS)) {
      const operator = this.previous()
      const right = this.unary()
      return new Unary(operator, right)
    }

    return this.primary()
  }

  private primary() {
    if (this.match(TokenType.FALSE)) return new Literal(false)
    if (this.match(TokenType.TRUE)) return new Literal(true)
    if (this.match(TokenType.NIL)) return new Literal(null)

    if (this.match(TokenType.NUMBER, TokenType.STRING)) {
      return new Literal(this.previous().literal)
    }

    if (this.match(TokenType.LEFT_PAREN)) {
      const expr = this.expression()
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after expression")
      return new Grouping(expr)
    }

    throw this.error(this.peek(), 'Expect expression')
  }

  private match(...types: TokenType[]) {
    for (const type of types) {
      if (this.check(type)) {
        this.advance()
        return true
      }
    }
    return false
  }

  private check(type: TokenType) {
    if (this.isAtEnd()) return false
    return this.peek().type === type
  }

  private advance() {
    if (!this.isAtEnd()) this.current++
    return this.previous()
  }

  private isAtEnd() {
    return this.peek().type === TokenType.EOF
  }

  private peek() {
    return this.tokens[this.current]
  }

  private previous() {
    return this.tokens[this.current - 1]
  }

  private consume(type: TokenType, message: string) {
    if (this.check(type)) {
      return this.advance()
    }
    throw this.error(this.peek(), message)
  }

  private error(token: Token, message: string) {
    if (token.type === TokenType.EOF) {
      report(token.line, ' at end', message)
    } else {
      report(token.line, ` at '${token.lexeme}''`, message)
    }
    return new Error('Parse error')
  }

  private synchronize() {
    this.advance()
    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.SEMICOLON) return

      switch (this.peek().type) {
        case TokenType.CLASS:
        case TokenType.FOR:
        case TokenType.FUN:
        case TokenType.IF:
        case TokenType.PRINT:
        case TokenType.RETURN:
        case TokenType.VAR:
        case TokenType.WHILE:
          return
      }
      this.advance()
    }
  }
}

interface Visitor<R> {
  visitBinaryExpr(expr: Binary): R
  visitGroupingExpr(expr: Grouping): R
  visitLiteralExpr(expr: Literal): R
  visitUnaryExpr(expr: Unary): R
}

abstract class Expr {
  abstract accept<R>(visitor: Visitor<R>): R
}

class Binary extends Expr {
  constructor(public left: Expr, public operator: Token, public right: Expr) {
    super()
  }

  accept<R>(visitor: Visitor<R>): R {
    return visitor.visitBinaryExpr(this)
  }
}

class Grouping extends Expr {
  constructor(public expr: Expr) {
    super()
  }

  accept<R>(visitor: Visitor<R>): R {
    return visitor.visitGroupingExpr(this)
  }
}

class Literal extends Expr {
  constructor(public value: any) {
    super()
  }

  accept<R>(visitor: Visitor<R>): R {
    return visitor.visitLiteralExpr(this)
  }
}

class Unary extends Expr {
  constructor(public operator: Token, public right: Expr) {
    super()
  }

  accept<R>(visitor: Visitor<R>): R {
    return visitor.visitUnaryExpr(this)
  }
}

class AstPrinter implements Visitor<string> {
  print(expr: Expr): string {
    return expr.accept(this)
  }

  parenthesize(name: string, ...exprs: Expr[]): string {
    let s = '(' + name
    for (const expr of exprs) {
      s += ' ' + expr.accept(this)
    }
    s += ')'

    return s
  }

  visitBinaryExpr(expr: Binary): string {
    return this.parenthesize(expr.operator.lexeme, expr.left, expr.right)
  }

  visitGroupingExpr(expr: Grouping): string {
    return this.parenthesize('group', expr.expr)
  }

  visitLiteralExpr(expr: Literal): string {
    if (expr.value === null) {
      return 'nil'
    }
    return expr.value.toString()
  }

  visitUnaryExpr(expr: Unary): string {
    return this.parenthesize(expr.operator.lexeme, expr.right)
  }
}

enum TokenType {
  // Single-character tokens
  LEFT_PAREN = 'LEFT_PAREN',
  RIGHT_PAREN = 'RIGHT_PAREN',
  LEFT_BRACE = 'LEFT_BRACE',
  RIGHT_BRACE = 'RIGHT_BRACE',
  COMMA = 'COMMA',
  DOT = 'DOT',
  MINUS = 'MINUS',
  PLUS = 'PLUS',
  SEMICOLON = 'SEMICOLON',
  SLASH = 'SLASH',
  STAR = 'STAR',

  // One or two character tokens
  BANG = 'BANG',
  BANG_EQUAL = 'BANG_EQUAL',
  EQUAL = 'EQUAL',
  EQUAL_EQUAL = 'EQUAL_EQUAL',
  GREATER = 'GREATER',
  GREATER_EQUAL = 'GREATER_EQUAL',
  LESS = 'LESS',
  LESS_EQUAL = 'LESS_EQUAL',

  // Literals
  IDENTIFIER = 'IDENTIFIER',
  STRING = 'STRING',
  NUMBER = 'NUMBER',

  // Keywords
  AND = 'AND',
  CLASS = 'CLASS',
  ELSE = 'ELSE',
  FALSE = 'FALSE',
  FUN = 'FUN',
  FOR = 'FOR',
  IF = 'IF',
  NIL = 'NIL',
  OR = 'OR',
  PRINT = 'PRINT',
  RETURN = 'RETURN',
  SUPER = 'SUPER',
  THIS = 'THIS',
  TRUE = 'TRUE',
  VAR = 'VAR',
  WHILE = 'WHILE',

  EOF = 'EOF',
}

class Token {
  constructor(
    public type: TokenType,
    public lexeme: string,
    public literal: any,
    public line: number,
  ) {}

  toString() {
    return this.type + ' ' + this.lexeme + ' ' + this.literal
  }
}

class Scanner {
  static KEYWORDS = {
    and: TokenType.AND,
    class: TokenType.CLASS,
    else: TokenType.ELSE,
    false: TokenType.FALSE,
    for: TokenType.FOR,
    fun: TokenType.FUN,
    if: TokenType.IF,
    nil: TokenType.NIL,
    or: TokenType.OR,
    print: TokenType.PRINT,
    return: TokenType.RETURN,
    super: TokenType.SUPER,
    this: TokenType.THIS,
    true: TokenType.TRUE,
    var: TokenType.VAR,
    while: TokenType.WHILE,
  }

  private tokens: Token[] = []
  private start: number = 0
  private current = 0
  private line = 1

  constructor(private source: string) {}

  scanTokens() {
    while (!this.isAtEnd()) {
      this.start = this.current
      this.scanToken()
    }

    this.tokens.push(new Token(TokenType.EOF, '', null, this.line))
    return this.tokens
  }

  scanToken() {
    const c = this.advance()

    switch (c) {
      case '(':
        this.addToken(TokenType.LEFT_PAREN)
        break
      case ')':
        this.addToken(TokenType.RIGHT_PAREN)
        break
      case '{':
        this.addToken(TokenType.LEFT_BRACE)
        break
      case '}':
        this.addToken(TokenType.RIGHT_BRACE)
        break
      case ',':
        this.addToken(TokenType.COMMA)
        break
      case '.':
        this.addToken(TokenType.DOT)
        break
      case '-':
        this.addToken(TokenType.MINUS)
        break
      case '+':
        this.addToken(TokenType.PLUS)
        break
      case ';':
        this.addToken(TokenType.SEMICOLON)
        break
      case '*':
        this.addToken(TokenType.STAR)
        break

      case '!':
        this.addToken(this.match('=') ? TokenType.BANG_EQUAL : TokenType.BANG)
        break
      case '=':
        this.addToken(this.match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL)
        break
      case '<':
        this.addToken(this.match('=') ? TokenType.LESS_EQUAL : TokenType.LESS)
        break
      case '>':
        this.addToken(
          this.match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER,
        )
        break

      case '/': {
        if (this.match('/')) {
          while (this.peek() !== '\n' && !this.isAtEnd()) this.advance()
        } else {
          this.addToken(TokenType.SLASH)
        }
        break
      }

      case ' ':
      case '\r':
      case '\t':
        break

      case '\n':
        this.line++
        break

      case '"':
        this.string()
        break

      default:
        if (this.isDigit(c)) {
          this.number()
        } else if (this.isAlpha(c)) {
          this.identifier()
        } else {
          error(this.line, `Unexpected character.`)
        }
        break
    }
  }

  string() {
    while (this.peek() !== '"' && !this.isAtEnd()) {
      if (this.peek() === '\n') this.line++
      this.advance()
    }

    if (this.isAtEnd()) {
      error(this.line, 'Unterminated string.')
      return
    }

    this.advance()

    const value = this.source.substring(this.start + 1, this.current - 1)
    this.addToken(TokenType.STRING, value)
  }

  isDigit(c: string) {
    return c >= '0' && c <= '9'
  }

  isAlpha(c: string) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'
  }

  isAlphaNumeric(c: string) {
    return this.isAlpha(c) || this.isDigit(c)
  }

  identifier() {
    while (this.isAlphaNumeric(this.peek())) this.advance()

    const text = this.source.substring(this.start, this.current)
    let type = Scanner.KEYWORDS[text]
    if (!type) type = TokenType.IDENTIFIER

    this.addToken(type)
  }

  number() {
    while (this.isDigit(this.peek())) this.advance()

    if (this.peek() == '.' && this.isDigit(this.peekNext())) {
      this.advance()

      while (this.isDigit(this.peek())) this.advance()
    }

    this.addToken(
      TokenType.NUMBER,
      Number(this.source.substring(this.start, this.current)),
    )
  }

  match(expected: string) {
    if (this.isAtEnd()) return false
    if (this.source[this.current] !== expected) return false

    this.current++
    return true
  }

  peek() {
    if (this.isAtEnd()) return '\0'
    return this.source[this.current]
  }

  peekNext() {
    if (this.current + 1 >= this.source.length) return '\0'
    return this.source[this.current + 1]
  }

  advance() {
    return this.source[this.current++]
  }

  addToken(type: TokenType, literal: any = null) {
    const text = this.source.substring(this.start, this.current)
    this.tokens.push(new Token(type, text, literal, this.line))
  }

  isAtEnd() {
    return this.current >= this.source.length
  }
}

const interpreter = new Interpreter()
let hadError = false

function run(source: string) {
  const scanner = new Scanner(source)
  const tokens = scanner.scanTokens()
  const parser = new Parser(tokens)
  const expr = parser.parse()
  interpreter.interpret(expr)

  if (hadError) {
    return
  }

  // console.log(new AstPrinter().print(expr))
}

function runPrompt() {
  const iface = createInterface(stdin, stdout)
  iface.setPrompt('> ')
  iface.on('line', (line: string) => {
    console.log('line')
    if (line.trim() === '') {
      exit(0)
    }
    run(line)
  })
}

function error(line: number, message: string) {
  report(line, '', message)
}

function report(line: number, where: string, message: string) {
  console.error(`[line ${line}] Error${where}: ${message}`)
  hadError = true
}

function runFile(path: string) {
  const content = readFileSync(path, { encoding: 'utf8' })
  run(content)

  if (hadError) {
    exit(65)
  }
}

async function main() {
  if (argv.length > 3) {
    console.error('Usage: tlox [script]')
    exit(64)
  } else if (argv.length === 3) {
    runFile(argv[2])
  } else {
    runPrompt()
  }
}

main()
  // .then(() => exit(0))
  .catch(e => {
    console.error(e.message)
    exit(-1)
  })
