import type { NoteBlock, NoteTextBlock, NoteTextStyle, RichNoteDocument } from "@models/types";
import { createTextBlock } from "@utils/noteContent";

interface ClipboardParseResult {
  isRich: boolean;
  blocks: NoteBlock[];
}

interface TagToken {
  type: "open" | "close" | "self";
  name: string;
  attrs: Record<string, string>;
}

const HTML_TAG_REGEX = /<\/?[a-zA-Z][^>]*>/;
const TOKEN_REGEX = /(<[^>]+>|[^<]+)/g;

const decodeEntities = (input: string): string =>
  input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');

const normalizeWhitespace = (input: string): string =>
  input
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

const parseTag = (rawTag: string): TagToken | null => {
  const body = rawTag.replace(/^<|>$/g, "").trim();
  if (!body) return null;
  const isClose = body.startsWith("/");
  const cleanBody = isClose ? body.slice(1).trim() : body;
  const isSelf = /\/\s*$/.test(cleanBody) || cleanBody.toLowerCase() === "br";
  const [nameRaw, ...rest] = cleanBody.replace(/\/\s*$/, "").split(/\s+/);
  const name = (nameRaw || "").toLowerCase();
  if (!name) return null;

  const attrs: Record<string, string> = {};
  const attrString = rest.join(" ");
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match = attrRegex.exec(attrString);
  while (match) {
    const key = match[1].toLowerCase();
    const val = match[3] ?? match[4] ?? match[5] ?? "";
    attrs[key] = val;
    match = attrRegex.exec(attrString);
  }

  if (isClose) return { type: "close", name, attrs };
  if (isSelf) return { type: "self", name, attrs };
  return { type: "open", name, attrs };
};

const styleFromState = (state: {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  href: string | null;
}): NoteTextStyle | undefined => {
  const style: NoteTextStyle = {};
  if (state.bold) style.bold = true;
  if (state.italic) style.italic = true;
  if (state.underline || state.href) style.underline = true;
  if (state.href) style.textColor = "#2563eb";
  return Object.keys(style).length ? style : undefined;
};

export const isClipboardRichText = (raw: string): boolean => {
  if (!raw?.trim()) return false;
  return HTML_TAG_REGEX.test(raw);
};

/**
 * Initial HTML -> Note blocks converter:
 * supports bold, italic, underline, links, ordered lists and unordered lists.
 */
export const convertClipboardHtmlToRichBlocks = (html: string): ClipboardParseResult => {
  if (!isClipboardRichText(html)) {
    return {
      isRich: false,
      blocks: [createTextBlock(normalizeWhitespace(decodeEntities(html || "")))]
    };
  }

  const blocks: NoteTextBlock[] = [];
  const lines: string[] = [];

  const state = {
    bold: false,
    italic: false,
    underline: false,
    href: null as string | null
  };
  const listStack: Array<{ kind: "ol" | "ul"; index: number }> = [];

  const flushLine = () => {
    if (!lines.length) return;
    const text = normalizeWhitespace(decodeEntities(lines.join("")));
    if (text.trim()) {
      blocks.push({
        ...createTextBlock(text),
        text,
        style: styleFromState(state)
      });
    }
    lines.length = 0;
  };

  const tokens = html.match(TOKEN_REGEX) || [];
  for (const token of tokens) {
    if (token.startsWith("<")) {
      const parsed = parseTag(token);
      if (!parsed) continue;

      const isOpen = parsed.type === "open";
      const isClose = parsed.type === "close";
      const isSelf = parsed.type === "self";
      const n = parsed.name;

      if (n === "br" && isSelf) {
        flushLine();
        continue;
      }
      if ((n === "p" || n === "div") && (isOpen || isClose)) {
        flushLine();
        continue;
      }
      if (n === "strong" || n === "b") {
        state.bold = isOpen ? true : isClose ? false : state.bold;
        continue;
      }
      if (n === "em" || n === "i") {
        state.italic = isOpen ? true : isClose ? false : state.italic;
        continue;
      }
      if (n === "u") {
        state.underline = isOpen ? true : isClose ? false : state.underline;
        continue;
      }
      if (n === "a") {
        if (isOpen) {
          state.href = parsed.attrs.href ?? null;
        } else if (isClose) {
          state.href = null;
        }
        continue;
      }
      if (n === "ul" && isOpen) {
        flushLine();
        listStack.push({ kind: "ul", index: 0 });
        continue;
      }
      if (n === "ol" && isOpen) {
        flushLine();
        listStack.push({ kind: "ol", index: 0 });
        continue;
      }
      if ((n === "ul" || n === "ol") && isClose) {
        flushLine();
        listStack.pop();
        continue;
      }
      if (n === "li" && isOpen) {
        flushLine();
        const currentList = listStack[listStack.length - 1];
        if (currentList) {
          if (currentList.kind === "ul") lines.push("• ");
          if (currentList.kind === "ol") {
            currentList.index += 1;
            lines.push(`${currentList.index}. `);
          }
        }
        continue;
      }
      if (n === "li" && isClose) {
        flushLine();
      }
      continue;
    }

    lines.push(token);
  }
  flushLine();

  if (!blocks.length) {
    const fallback = normalizeWhitespace(decodeEntities(html.replace(/<[^>]+>/g, "")));
    return { isRich: false, blocks: [createTextBlock(fallback)] };
  }

  return { isRich: true, blocks };
};

/**
 * Inserts converted clipboard blocks into the current document without replacing
 * unrelated blocks. If no valid index is provided, appends to the end.
 */
export const insertClipboardHtmlIntoRichDoc = (
  doc: RichNoteDocument,
  html: string,
  targetBlockId?: string,
  prefixText?: string,
  suffixText?: string,
  baseStyle?: NoteTextStyle
): RichNoteDocument => {
  const parsed = convertClipboardHtmlToRichBlocks(html);
  const incomingBlocks = parsed.blocks;
  if (!incomingBlocks.length) return doc;

  const targetIndex = targetBlockId ? doc.blocks.findIndex((b) => b.id === targetBlockId) : -1;
  if (targetIndex < 0) {
    return {
      ...doc,
      blocks: [...doc.blocks, ...incomingBlocks]
    };
  }

  const nextBlocks = [...doc.blocks];
  const merged: NoteBlock[] = [];
  if (prefixText) {
    merged.push({
      ...createTextBlock(prefixText),
      text: prefixText,
      style: baseStyle ? { ...baseStyle } : undefined
    });
  }
  merged.push(...incomingBlocks);
  if (suffixText) {
    merged.push({
      ...createTextBlock(suffixText),
      text: suffixText,
      style: baseStyle ? { ...baseStyle } : undefined
    });
  }

  nextBlocks.splice(targetIndex, 1, ...merged);
  return { ...doc, blocks: nextBlocks };
};

