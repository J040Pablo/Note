/**
 * Simple lightweight syntax highlighter for common programming languages.
 * Uses regex-based tokenization without external dependencies.
 */

export interface Token {
  type: "keyword" | "string" | "comment" | "number" | "function" | "variable" | "operator" | "punctuation" | "text";
  value: string;
  color?: string;
}

const KEYWORDS: Record<string, string[]> = {
  javascript: [
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", 
    "break", "continue", "try", "catch", "finally", "throw", "async", "await", "class", "extends", 
    "import", "export", "default", "from", "as", "new", "this", "super", "true", "false", "null", "undefined"
  ],
  typescript: [
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case",
    "break", "continue", "try", "catch", "finally", "throw", "async", "await", "class", "extends",
    "import", "export", "default", "from", "as", "new", "this", "super", "true", "false", "null", "undefined",
    "interface", "type", "enum", "namespace", "module", "declare", "public", "private", "protected",
    "readonly", "abstract", "implements", "of", "in", "instanceof", "typeof", "is"
  ],
  python: [
    "def", "class", "return", "if", "elif", "else", "for", "while", "break", "continue", "import", 
    "from", "as", "try", "except", "finally", "raise", "with", "lambda", "yield", "assert", "pass",
    "True", "False", "None", "and", "or", "not", "is", "in"
  ],
  java: [
    "public", "private", "protected", "static", "final", "abstract", "class", "interface", "enum",
    "extends", "implements", "new", "return", "if", "else", "for", "while", "do", "switch", "case",
    "break", "continue", "try", "catch", "finally", "throw", "throws", "synchronized", "volatile",
    "true", "false", "null", "void", "int", "String", "boolean", "double", "float", "long"
  ],
  html: [
    "DOCTYPE", "html", "head", "body", "div", "span", "p", "a", "img", "ul", "ol", "li", "form",
    "input", "button", "script", "style", "meta", "link", "title", "h1", "h2", "h3", "h4", "h5", "h6"
  ],
  css: [
    "color", "background", "font", "margin", "padding", "width", "height", "display", "flex", "grid",
    "position", "border", "box-shadow", "animation", "transform", "transition", "opacity", "z-index",
    "absolute", "relative", "fixed", "sticky", "flex-direction", "justify-content", "align-items"
  ]
};

const LIGHT_THEME = {
  keyword: "#0000FF",
  string: "#00AA00",
  comment: "#888888",
  number: "#FF6600",
  function: "#0066BB",
  variable: "#000000",
  operator: "#000000",
  punctuation: "#000000"
};

const DARK_THEME = {
  keyword: "#569CD6",
  string: "#4EC9B0",
  comment: "#6A9955",
  number: "#B5CEA8",
  function: "#DCDCAA",
  variable: "#D4D4D4",
  operator: "#D4D4D4",
  punctuation: "#D4D4D4"
};

export function tokenizeCode(code: string, language: string = "javascript", theme: "light" | "dark" = "dark"): Token[] {
  const tokens: Token[] = [];
  const keywords = KEYWORDS[language] || KEYWORDS.javascript;
  const themeColors = theme === "light" ? LIGHT_THEME : DARK_THEME;

  // Regex patterns for tokenization
  const patterns = [
    // Single-line comments
    { regex: /^\/\/.*$/gm, type: "comment" as const },
    // Multi-line comments (simplified)
    { regex: /\/\*[\s\S]*?\*\//g, type: "comment" as const },
    // Python comments
    { regex: /^#.*$/gm, type: "comment" as const },
    // HTML comments
    { regex: /<!--[\s\S]*?-->/g, type: "comment" as const },
    // Strings (double quotes, single quotes, backticks)
    { regex: /"(?:\\.|[^"\\])*"/g, type: "string" as const },
    { regex: /'(?:\\.|[^'\\])*'/g, type: "string" as const },
    { regex: /`(?:\\.|[^`\\])*`/g, type: "string" as const },
    // Numbers
    { regex: /\b\d+\.?\d*\b/g, type: "number" as const },
    // Operators
    { regex: /[+\-*/%=&|^!<>?:;.]/g, type: "operator" as const },
    // Punctuation
    { regex: /[{}()\[\]]/g, type: "punctuation" as const },
    // Keywords
    { regex: new RegExp(`\\b(${keywords.join("|")})\\b`, "g"), type: "keyword" as const },
    // Function calls (word followed by opening paren)
    { regex: /\b([a-zA-Z_]\w*)\s*(?=\()/g, type: "function" as const },
    // Variables/identifiers
    { regex: /\b[a-zA-Z_]\w*\b/g, type: "variable" as const }
  ];

  // Create a map of positions to tokens
  interface PositionedToken {
    start: number;
    end: number;
    type: Token["type"];
    value: string;
  }
  
  const positionedTokens: PositionedToken[] = [];

  // Extract tokens using regex
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    while ((match = regex.exec(code)) !== null) {
      positionedTokens.push({
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        value: match[0]
      });
    }
  }

  // Sort by position and remove overlaps
  positionedTokens.sort((a, b) => a.start - b.start);

  const processedTokens: PositionedToken[] = [];
  let lastEnd = 0;

  for (const token of positionedTokens) {
    if (token.start >= lastEnd) {
      // Add whitespace/text before this token
      if (token.start > lastEnd) {
        processedTokens.push({
          start: lastEnd,
          end: token.start,
          type: "text",
          value: code.substring(lastEnd, token.start)
        });
      }
      processedTokens.push(token);
      lastEnd = token.end;
    }
  }

  // Add remaining text
  if (lastEnd < code.length) {
    processedTokens.push({
      start: lastEnd,
      end: code.length,
      type: "text",
      value: code.substring(lastEnd)
    });
  }

  // Convert to tokens with colors
  return processedTokens.map((t) => ({
    type: t.type,
    value: t.value,
    color: themeColors[t.type as keyof typeof themeColors]
  }));
}

export function highlightCodeBlock(code: string, language: string = "javascript", theme: "light" | "dark" = "dark"): Array<{
  text: string;
  color: string;
  fontWeight?: "bold";
}> {
  const tokens = tokenizeCode(code, language, theme);
  return tokens.map((token) => ({
    text: token.value,
    color: token.color || (theme === "light" ? LIGHT_THEME.variable : DARK_THEME.variable),
    fontWeight: token.type === "keyword" ? "bold" : undefined
  }));
}
