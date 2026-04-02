const QUICK_NOTE_DOC_TYPE = "quick-rich-blocks";

type QuickRichBlock = {
  id?: string;
  html: string;
};

type QuickRichDoc = {
  version: 1;
  type: typeof QUICK_NOTE_DOC_TYPE;
  blocks: QuickRichBlock[];
};

const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "strike",
  "sub",
  "sup",
  "u",
  "ul",
  "hr",
]);

const styleWhitelist = new Set([
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
  "white-space",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
]);

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isQuickRichDoc = (value: unknown): value is QuickRichDoc => {
  if (!value || typeof value !== "object") return false;
  const doc = value as QuickRichDoc;
  return doc.version === 1 && doc.type === QUICK_NOTE_DOC_TYPE && Array.isArray(doc.blocks);
};

const parseMaybeJson = (raw: string): QuickRichDoc | null => {
  try {
    const parsed = JSON.parse(raw);
    return isQuickRichDoc(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const sanitizeStyle = (styleValue: string): string => {
  const declarations = styleValue
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [property, ...rest] = part.split(":");
      if (!property || rest.length === 0) return null;
      const name = property.trim().toLowerCase();
      if (!styleWhitelist.has(name)) return null;
      const value = rest.join(":").trim();
      if (!value || /url\s*\(|expression\s*\(/i.test(value)) return null;
      return `${name}: ${value}`;
    })
    .filter((part): part is string => Boolean(part));

  return declarations.join("; ");
};

const sanitizeNode = (node: Node, ownerDocument: Document): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    return ownerDocument.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  if (!allowedTags.has(tagName)) {
    const fragment = ownerDocument.createDocumentFragment();
    Array.from(element.childNodes).forEach((child) => {
      const safeChild = sanitizeNode(child, ownerDocument);
      if (safeChild) fragment.appendChild(safeChild);
    });
    return fragment;
  }

  const safeElement = ownerDocument.createElement(tagName);

  if (tagName === "a") {
    const href = element.getAttribute("href")?.trim() ?? "";
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) {
      safeElement.setAttribute("href", href);
      safeElement.setAttribute("rel", "noreferrer noopener");
      safeElement.setAttribute("target", href.startsWith("#") || href.startsWith("/") ? "_self" : "_blank");
    }
  }

  const style = element.getAttribute("style");
  if (style) {
    const safeStyle = sanitizeStyle(style);
    if (safeStyle) {
      safeElement.setAttribute("style", safeStyle);
    }
  }

  if (tagName === "div" || tagName === "p" || tagName === "span" || tagName === "li" || tagName === "blockquote") {
    const align = element.getAttribute("align");
    if (align && /^(left|right|center|justify)$/i.test(align)) {
      safeElement.setAttribute("style", `${safeElement.getAttribute("style") ?? ""}${safeElement.getAttribute("style") ? "; " : ""}text-align: ${align}`);
    }
  }

  Array.from(element.childNodes).forEach((child) => {
    const safeChild = sanitizeNode(child, ownerDocument);
    if (safeChild) safeElement.appendChild(safeChild);
  });

  return safeElement;
};

export const parseQuickRichNoteDocument = (raw: string): QuickRichDoc => {
  const fallbackHtml = raw?.trim() ? raw : "";

  const parsed = parseMaybeJson(raw);
  if (parsed) {
    return {
      ...parsed,
      blocks: parsed.blocks.length ? parsed.blocks : [{ html: "" }],
    };
  }

  return {
    version: 1,
    type: QUICK_NOTE_DOC_TYPE,
    blocks: [{ html: fallbackHtml }],
  };
};

export const sanitizeQuickRichHtml = (rawHtml: string): string => {
  if (!rawHtml?.trim()) return "";
  if (typeof window === "undefined" || typeof document === "undefined") {
    return escapeHtml(rawHtml).replace(/\n/g, "<br>");
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${rawHtml}</div>`, "text/html");
  const container = parsed.body.firstElementChild;
  if (!container) return "";

  const safeDocument = document.implementation.createHTMLDocument("quick-rich-note");
  const output = safeDocument.createElement("div");

  Array.from(container.childNodes).forEach((child) => {
    const safeChild = sanitizeNode(child, safeDocument);
    if (safeChild) output.appendChild(safeChild);
  });

  return output.innerHTML;
};

export const quickRichNoteDocToHtml = (raw: string): string => {
  const doc = parseQuickRichNoteDocument(raw);
  return doc.blocks
    .map((block) => sanitizeQuickRichHtml(block.html))
    .filter(Boolean)
    .map((html) => `<div class="quick-rich-block">${html}</div>`)
    .join("");
};

export const quickRichNoteDocToText = (raw: string): string => {
  const html = quickRichNoteDocToHtml(raw);
  if (!html) return "";

  if (typeof window === "undefined" || typeof document === "undefined") {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.textContent?.replace(/\s+/g, " ").trim() ?? "";
};

export const serializeQuickRichNoteHtml = (html: string): string =>
  JSON.stringify({
    version: 1,
    type: QUICK_NOTE_DOC_TYPE,
    blocks: [{ id: "quick-root-block", html }],
  });
