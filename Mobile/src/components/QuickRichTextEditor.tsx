import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useTheme } from "@hooks/useTheme";
import { Text } from "@components/Text";
import { getPlainTextFromRichNoteContent } from "@utils/noteContent";
import type { NoteTextBlock } from "@models/types";
import { convertClipboardHtmlToRichBlocks, isClipboardRichText } from "@utils/richClipboard";
import LinkModal from "@components/LinkModal";
import { useLinkHandler } from "@hooks/useLinkHandler";
import { useInternalSearch } from "@hooks/useInternalSearch";
import { stringToLink } from "@utils/linkUtils";

interface QuickRichTextEditorProps {
  value: string;
  onChangeText: (html: string) => void;
  placeholder?: string;
  onBlockChange?: (payload: { blockId: string; html: string }) => void;
}

type EditorMessage =
  | { type: "content"; html: string }
  | { type: "selection"; hasSelection: boolean }
  | { type: "focus"; focused: boolean }
  | { type: "paste"; html?: string; text?: string };

const QUICK_COLORS = ["#ef4444", "#2563eb", "#16a34a", "#f59e0b"] as const;
const QUICK_SIZES = [
  { label: "Sm", px: 13 },
  { label: "N", px: 16 },
  { label: "Lg", px: 20 },
  { label: "H1", px: 32 },
  { label: "H2", px: 28 },
  { label: "H3", px: 24 }
] as const;

const escapeHtml = (raw: string) =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const looksLikeHtml = (input: string) => /<[^>]+>/.test(input);

const toInitialHtml = (value: string): string => {
  const trimmed = value?.trim?.() ?? "";
  if (!trimmed) return "";

  if (looksLikeHtml(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("{")) {
    const plain = getPlainTextFromRichNoteContent(trimmed);
    return escapeHtml(plain).replace(/\n/g, "<br>");
  }

  return escapeHtml(value).replace(/\n/g, "<br>");
};

const textBlockToHtml = (block: NoteTextBlock): string => {
  const style = block.style ?? {};
  const css: string[] = [];
  if (style.bold) css.push("font-weight:700");
  if (style.italic) css.push("font-style:italic");
  if (style.underline) css.push("text-decoration:underline");
  if (style.textColor) css.push(`color:${style.textColor}`);
  if (style.fontSize) css.push(`font-size:${style.fontSize}px`);

  const escaped = escapeHtml(block.text ?? "").replace(/\n/g, "<br>");
  return `<p><span style="${css.join(";")}">${escaped}</span></p>`;
};

const richBlocksToHtmlFragment = (blocks: NoteTextBlock[]): string =>
  blocks.map((block) => textBlockToHtml(block)).join("");

const QuickRichTextEditor = memo(function QuickRichTextEditor({
  value,
  onChangeText,
  placeholder = "Write something...",
  onBlockChange
}: QuickRichTextEditorProps) {
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const initialHtmlRef = useRef<string>(toInitialHtml(value));
  const lastSentHtmlRef = useRef<string>(initialHtmlRef.current);
  const isEditorReadyRef = useRef(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isSizePickerOpen, setIsSizePickerOpen] = useState(false);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<number | null>(null);
  const [selectedText, setSelectedText] = useState("");

  const toolbarVisible = hasSelection || isFocused;

  const onInsertLink = useCallback(
    (html: string) => {
      if (!webViewRef.current) return;
      webViewRef.current.injectJavaScript(`
        const sel = window.getSelection();
        if (sel.toString()) {
          document.execCommand('delete');
        }
        const div = document.createElement('div');
        div.innerHTML = ${JSON.stringify(html)};
        const range = sel.getRangeAt(0);
        range.insertNode(div.firstChild);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'content',
          html: document.getElementById('editor').innerHTML
        }));
      `);
    },
    []
  );

  // Link integration
  const { linkModalVisible, openLinkModal, closeLinkModal, insertExternalLink, insertInternalLink, handleLinkPress } = useLinkHandler((html: string) => {
    onInsertLink(html);
    // After link is inserted via modal, we need to close it
    // This will be handled in onMessage when shouldOpenModal is false
  });
  const { searchInternalItems } = useInternalSearch();

  const htmlDoc = useMemo(() => {
    const initial = JSON.stringify(initialHtmlRef.current);
    const safePlaceholder = JSON.stringify(placeholder);

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        min-height: 100%;
        background: ${theme.colors.background};
        color: ${theme.colors.textPrimary};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      #editor {
        box-sizing: border-box;
        width: 100%;
        min-height: 100vh;
        padding: 12px 8px 24px;
        outline: none;
        white-space: pre-wrap;
        overflow-wrap: break-word;
        word-break: normal;
        line-height: 1.55;
        font-size: 16px;
      }

      #editor:empty::before {
        content: attr(data-placeholder);
        color: ${theme.colors.textSecondary};
      }

      a {
        color: #2563eb;
        text-decoration: underline;
        cursor: pointer;
        opacity: 1;
        transition: opacity 0.2s;
      }

      a:active {
        opacity: 0.7;
      }
    </style>
  </head>
  <body>
    <div id="editor" contenteditable="true" data-placeholder=${safePlaceholder}></div>
    <script>
      const post = (payload) => {
        window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
      };

      const editor = document.getElementById('editor');
      editor.innerHTML = ${initial};

      const emitContent = () => {
        post({ type: 'content', html: editor.innerHTML });
      };

      const emitSelection = () => {
        const sel = window.getSelection();
        const hasSelection = !!sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
        post({ type: 'selection', hasSelection });
      };

      const emitFocus = (focused) => {
        post({ type: 'focus', focused: !!focused });
      };

      const collapseSelectionToEnd = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      };

      const applyToSelection = (styleObj) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;

        const span = document.createElement('span');
        Object.assign(span.style, styleObj);
        span.appendChild(range.extractContents());
        range.insertNode(span);

        const nextRange = document.createRange();
        nextRange.selectNodeContents(span);
        nextRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(nextRange);

        emitContent();
        emitSelection();
      };

      window.__quickEditor = {
        setHtml(html) {
          editor.innerHTML = html || '';
        },
        insertHtmlAtCursor(html) {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) {
            editor.insertAdjacentHTML('beforeend', html || '');
            emitContent();
            emitSelection();
            return;
          }
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const container = document.createElement('div');
          container.innerHTML = html || '';
          const fragment = document.createDocumentFragment();
          let node = container.firstChild;
          let lastNode = null;
          while (node) {
            const next = node.nextSibling;
            lastNode = fragment.appendChild(node);
            node = next;
          }
          range.insertNode(fragment);
          if (lastNode) {
            range.setStartAfter(lastNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          emitContent();
          emitSelection();
        },
        bold() { document.execCommand('bold'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        italic() { document.execCommand('italic'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        underline() { document.execCommand('underline'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        strike() { document.execCommand('strikeThrough'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        color(hex) { applyToSelection({ color: hex }); editor.focus(); },
        fontSize(px) { applyToSelection({ fontSize: px + 'px' }); editor.focus(); }
      };

      editor.addEventListener('input', emitContent);
      editor.addEventListener('paste', (event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return;
        const html = clipboard.getData('text/html');
        const text = clipboard.getData('text/plain');
        if (!html && !text) return;
        event.preventDefault();
        post({ type: 'paste', html, text });
      });
      document.addEventListener('selectionchange', emitSelection);
      editor.addEventListener('keyup', emitSelection);
      editor.addEventListener('mouseup', emitSelection);
      editor.addEventListener('focus', () => { emitSelection(); emitFocus(true); });
      editor.addEventListener('blur', () => { emitSelection(); emitFocus(false); });

      window.__quickEditorReady = true;
      emitContent();
      emitSelection();
      emitFocus(document.activeElement === editor);
    </script>
  </body>
</html>`;
  }, [placeholder, theme.colors.background, theme.colors.textPrimary, theme.colors.textSecondary]);

  useEffect(() => {
    if (!isEditorReadyRef.current) {
      const nextHtml = toInitialHtml(value);
      initialHtmlRef.current = nextHtml;
      lastSentHtmlRef.current = nextHtml;
      return;
    }

    // Keep raw value once editor is live to preserve caret/selection.
    const nextHtml = typeof value === "string" ? value : "";

    if (nextHtml === lastSentHtmlRef.current) return;

    lastSentHtmlRef.current = nextHtml;
    webViewRef.current?.injectJavaScript(
      `window.__quickEditor && window.__quickEditor.setHtml(${JSON.stringify(nextHtml)}); true;`
    );
  }, [value]);

  const sendCommand = useCallback((command: string) => {
    webViewRef.current?.injectJavaScript(`window.__quickEditor && ${command}; true;`);
  }, []);

  const toggleColorPicker = useCallback(() => {
    setIsColorPickerOpen((prev) => {
      const next = !prev;
      if (next) setIsSizePickerOpen(false);
      return next;
    });
  }, []);

  const toggleSizePicker = useCallback(() => {
    setIsSizePickerOpen((prev) => {
      const next = !prev;
      if (next) setIsColorPickerOpen(false);
      return next;
    });
  }, []);

  const applyColor = useCallback(
    (color: string) => {
      setActiveColor(color);
      sendCommand(`window.__quickEditor.color('${color}')`);
      setIsColorPickerOpen(false);
    },
    [sendCommand]
  );

  const applySize = useCallback(
    (px: number) => {
      setActiveSize(px);
      sendCommand(`window.__quickEditor.fontSize(${px})`);
      setIsSizePickerOpen(false);
    },
    [sendCommand]
  );

  useEffect(() => {
    if (!toolbarVisible) {
      setIsColorPickerOpen(false);
      setIsSizePickerOpen(false);
    }
  }, [toolbarVisible]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as EditorMessage | { type: "linkPress"; href: string } | { type: "getSelection"; text: string; shouldOpenModal?: boolean };
        
        if (payload.type === "linkPress") {
          const link = stringToLink(payload.href);
          if (link) {
            handleLinkPress(link);
          }
          return;
        }

        if (payload.type === "getSelection") {
          setSelectedText(payload.text);
          if ((payload as any).shouldOpenModal) {
            openLinkModal(payload.text);
          }
          return;
        }

        if (payload.type === "paste") {
          const rawHtml = (payload as EditorMessage & { html?: string }).html ?? "";
          const plain = (payload as EditorMessage & { text?: string }).text ?? "";
          const source = rawHtml || plain;
          if (!source.trim()) return;

          if (rawHtml && isClipboardRichText(rawHtml)) {
            const converted = convertClipboardHtmlToRichBlocks(rawHtml);
            const textBlocks = converted.blocks.filter((b): b is NoteTextBlock => b.type === "text");
            const fragment = richBlocksToHtmlFragment(textBlocks);
            const htmlToInsert = fragment || `<p>${escapeHtml(plain).replace(/\n/g, "<br>")}</p>`;
            webViewRef.current?.injectJavaScript(
              `window.__quickEditor && window.__quickEditor.insertHtmlAtCursor(${JSON.stringify(htmlToInsert)}); true;`
            );
            return;
          }

          const htmlToInsert = `<p>${escapeHtml(plain).replace(/\n/g, "<br>")}</p>`;
          webViewRef.current?.injectJavaScript(
            `window.__quickEditor && window.__quickEditor.insertHtmlAtCursor(${JSON.stringify(htmlToInsert)}); true;`
          );
          return;
        }

        if (payload.type === "selection") {
          setHasSelection((payload as EditorMessage & { hasSelection?: boolean }).hasSelection ?? false);
          return;
        }

        if (payload.type === "focus") {
          setIsFocused((payload as EditorMessage & { focused?: boolean }).focused ?? false);
          if (!(payload as EditorMessage & { focused?: boolean }).focused) {
            setHasSelection(false);
          }
          return;
        }

        if (payload.type === "content") {
          isEditorReadyRef.current = true;
          const html = (payload as EditorMessage & { html?: string }).html ?? "";
          if (html === lastSentHtmlRef.current) return;
          lastSentHtmlRef.current = html;
          onBlockChange?.({ blockId: "quick-root-block", html });
          onChangeText(html);
        }
      } catch {
        // no-op
      }
    },
    [onBlockChange, onChangeText, handleLinkPress, openLinkModal]
  );

  return (
    <View style={styles.root}>
      {toolbarVisible && (
        <View style={styles.toolbarStack}>
          <View style={[styles.toolbar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
            <Pressable style={styles.toolButton} onPress={() => sendCommand("window.__quickEditor.bold()")}> 
              <Text style={{ fontWeight: "700", color: theme.colors.textPrimary }}>B</Text>
            </Pressable>
            <Pressable style={styles.toolButton} onPress={() => sendCommand("window.__quickEditor.italic()")}> 
              <Text style={{ fontStyle: "italic", color: theme.colors.textPrimary }}>I</Text>
            </Pressable>
            <Pressable style={styles.toolButton} onPress={() => sendCommand("window.__quickEditor.underline()")}> 
              <Text style={{ textDecorationLine: "underline", color: theme.colors.textPrimary }}>U</Text>
            </Pressable>
            <Pressable style={styles.toolButton} onPress={() => sendCommand("window.__quickEditor.strike()")}> 
              <Text style={{ textDecorationLine: "line-through", color: theme.colors.textPrimary }}>S</Text>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={[
                styles.menuButton,
                { borderColor: theme.colors.border },
                isColorPickerOpen && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
              ]}
              onPress={toggleColorPicker}
            >
              <Ionicons name="color-palette-outline" size={14} color={isColorPickerOpen ? "#fff" : theme.colors.textPrimary} />
              <Text variant="caption" style={{ color: isColorPickerOpen ? "#fff" : theme.colors.textPrimary }}>Color</Text>
            </Pressable>

            <Pressable
              style={[
                styles.menuButton,
                { borderColor: theme.colors.border },
                isSizePickerOpen && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
              ]}
              onPress={toggleSizePicker}
            >
              <Ionicons name="text-outline" size={14} color={isSizePickerOpen ? "#fff" : theme.colors.textPrimary} />
              <Text variant="caption" style={{ color: isSizePickerOpen ? "#fff" : theme.colors.textPrimary }}>Size</Text>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={[styles.toolButton]}
              onPress={() => {
                webViewRef.current?.injectJavaScript(`
                  const text = window.getSelection().toString();
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'getSelection',
                    text: text,
                    shouldOpenModal: true
                  }));
                  true;
                `);
              }}
            >
              <Ionicons name="link" size={14} color={theme.colors.primary} />
            </Pressable>
          </View>

          {isColorPickerOpen && (
            <View style={[styles.pickerPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
              <View style={styles.pickerRow}>
                {QUICK_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      activeColor === color && { borderColor: theme.colors.primary, borderWidth: 2 }
                    ]}
                    onPress={() => applyColor(color)}
                  />
                ))}
              </View>
            </View>
          )}

          {isSizePickerOpen && (
            <View style={[styles.pickerPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
              <View style={styles.pickerRow}>
                {QUICK_SIZES.map((option) => (
                  <Pressable
                    key={option.label}
                    style={[
                      styles.sizeButton,
                      { borderColor: theme.colors.border },
                      activeSize === option.px && { borderColor: theme.colors.primary }
                    ]}
                    onPress={() => applySize(option.px)}
                  >
                    <Text
                      variant="caption"
                      style={{
                        color: theme.colors.textPrimary,
                        fontWeight: option.label.startsWith("H") ? "700" : "400"
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      <View style={[styles.editorCard, { borderColor: theme.colors.border }]}> 
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: htmlDoc }}
          onMessage={onMessage}
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled
          overScrollMode="never"
          injectedJavaScriptBeforeContentLoaded={`
            document.addEventListener('click', function(e) {
              const link = e.target.closest('a');
              if (link && link.href) {
                e.preventDefault();
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'linkPress',
                  href: link.href
                }));
              }
            });
            true;
          `}
        />
      </View>

      <LinkModal
        visible={linkModalVisible}
        selectedText={selectedText}
        onClose={closeLinkModal}
        onInsertExternal={insertExternalLink}
        onInsertInternal={insertInternalLink}
        onSearchInternalItems={searchInternalItems}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%"
  },
  toolbar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4
  },
  toolbarStack: {
    marginBottom: 8,
    gap: 6
  },
  toolButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 999,
    marginHorizontal: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(127,127,127,0.45)"
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: "rgba(127,127,127,0.45)",
    marginHorizontal: 4
  },
  sizeButton: {
    minWidth: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth
  },
  menuButton: {
    minHeight: 30,
    borderRadius: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  pickerPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center"
  },
  editorCard: {
    flex: 1,
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden"
  },
  webview: {
    flex: 1,
    width: "100%",
    backgroundColor: "transparent"
  }
});

export default QuickRichTextEditor;
