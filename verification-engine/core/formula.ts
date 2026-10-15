class FormulaError extends Error {}

interface Token {
  type: "number" | "identifier" | "operator" | "paren";
  value: string;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  const source = expression.trim();
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    if ("+-*/()".includes(char)) {
      tokens.push({ type: char === "(" || char === ")" ? "paren" : "operator", value: char });
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let value = "";
      while (index < source.length && /[0-9.]/.test(source[index])) {
        value += source[index];
        index += 1;
      }
      if (!/^\d+(\.\d+)?$/.test(value)) {
        throw new FormulaError(`"${value}" is not a valid number.`);
      }
      tokens.push({ type: "number", value });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = "";
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) {
        value += source[index];
        index += 1;
      }
      tokens.push({ type: "identifier", value });
      continue;
    }
    throw new FormulaError(`Unexpected character "${char}" in the formula.`);
  }

  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly variables: Record<string, number>,
  ) {}

  parse(): number {
    const value = this.parseExpression();
    if (this.index !== this.tokens.length) {
      throw new FormulaError("The formula has unexpected trailing input.");
    }
    if (!Number.isFinite(value)) {
      throw new FormulaError("The formula did not produce a finite number.");
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previous().value;
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = this.previous().value;
      const right = this.parseFactor();
      if (operator === "/" && right === 0) {
        throw new FormulaError("The formula divides by zero.");
      }
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private parseFactor(): number {
    if (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previous().value;
      const value = this.parseFactor();
      return operator === "-" ? -value : value;
    }
    const token = this.advance();
    if (!token) throw new FormulaError("The formula ended unexpectedly.");
    if (token.type === "number") return Number(token.value);
    if (token.type === "identifier") {
      if (!(token.value in this.variables)) {
        throw new FormulaError(`The formula input "${token.value}" was not extracted.`);
      }
      return this.variables[token.value];
    }
    if (token.type === "paren" && token.value === "(") {
      const value = this.parseExpression();
      const closing = this.advance();
      if (!closing || closing.value !== ")") {
        throw new FormulaError("The formula is missing a closing parenthesis.");
      }
      return value;
    }
    throw new FormulaError(`Unexpected token "${token.value}".`);
  }

  private matchOperator(value: string): boolean {
    const token = this.tokens[this.index];
    if (token?.type === "operator" && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private advance(): Token | undefined {
    const token = this.tokens[this.index];
    if (token) this.index += 1;
    return token;
  }

  private previous(): Token {
    return this.tokens[this.index - 1];
  }
}

export function evaluateFormula(expression: string, variables: Record<string, number>): number {
  try {
    return new Parser(tokenize(expression), variables).parse();
  } catch (error) {
    if (error instanceof FormulaError) throw error;
    throw new FormulaError("The formula could not be evaluated.");
  }
}

export function formulaErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The formula could not be evaluated.";
}
