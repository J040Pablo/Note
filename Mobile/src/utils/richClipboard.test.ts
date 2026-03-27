import { convertClipboardHtmlToRichBlocks, isClipboardRichText } from "@utils/richClipboard";

describe("richClipboard", () => {
  it("detects HTML clipboard payload", () => {
    expect(isClipboardRichText("<p><strong>Hello</strong> world</p>")).toBe(true);
    expect(isClipboardRichText("plain text")).toBe(false);
  });

  it("converts basic formatting tags to styled text blocks", () => {
    const result = convertClipboardHtmlToRichBlocks("<p><strong>Bold</strong> <em>Italic</em> <u>Under</u></p>");
    expect(result.blocks.length).toBeGreaterThan(0);
    const text = result.blocks.map((b) => (b.type === "text" ? b.text : "")).join(" ");
    expect(text).toContain("Bold");
    expect(text).toContain("Italic");
    expect(text).toContain("Under");
  });

  it("converts unordered and ordered lists", () => {
    const html = "<ul><li>Item A</li><li>Item B</li></ul><ol><li>One</li><li>Two</li></ol>";
    const result = convertClipboardHtmlToRichBlocks(html);
    const text = result.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    expect(text).toContain("• Item A");
    expect(text).toContain("• Item B");
    expect(text).toContain("1. One");
    expect(text).toContain("2. Two");
  });

  it("keeps links as underlined styled blocks", () => {
    const result = convertClipboardHtmlToRichBlocks('<p>Read <a href="https://example.com">this link</a></p>');
    const hasUnderlined = result.blocks.some((block) => block.type === "text" && !!block.style?.underline);
    expect(hasUnderlined).toBe(true);
  });
});

