import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useTheme } from "@hooks/useTheme";
import { Text } from "@components/Text";
import { getPlainTextFromRichNoteContent } from "@utils/noteContent";

interface QuickRichTextEditorProps {
  value: string;
  onChangeText: (html: string) => void;
  placeholder?: string;
}

type EditorMessage =
  | { type: "content"; html: string }
  | { type: "selection"; hasSelection: boolean }
  | { type: "focus"; focused: boolean };

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

const QuickRichTextEditor = memo(function QuickRichTextEditor({
  value,
  onChangeText,
  placeholder = "Write something..."
}: QuickRichTextEditorProps) {
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const initialHtmlRef = useRef<string>(toInitialHtml(value));
  const lastSentHtmlRef = useRef<string>(initialHtmlRef.current);
  const isEditorReadyRef = useRef(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const toolbarVisible = hasSelection || isFocused;

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
        bold() { document.execCommand('bold'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        italic() { document.execCommand('italic'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        underline() { document.execCommand('underline'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        strike() { document.execCommand('strikeThrough'); collapseSelectionToEnd(); emitContent(); emitSelection(); editor.focus(); },
        color(hex) { applyToSelection({ color: hex }); editor.focus(); },
        fontSize(px) { applyToSelection({ fontSize: px + 'px' }); editor.focus(); }
      };

      editor.addEventListener('input', emitContent);
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

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as EditorMessage;
        if (payload.type === "selection") {
          setHasSelection(payload.hasSelection);
          return;
        }

        if (payload.type === "focus") {
          setIsFocused(payload.focused);
          if (!payload.focused) {
            setHasSelection(false);
          }
          return;
        }

        if (payload.type === "content") {
          isEditorReadyRef.current = true;
          if (payload.html === lastSentHtmlRef.current) return;
          lastSentHtmlRef.current = payload.html;
          onChangeText(payload.html);
        }
      } catch {
        // no-op
      }
    },
    [onChangeText]
  );

  return (
    <View style={styles.root}>
      {toolbarVisible && (
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

          {["#ef4444", "#2563eb", "#16a34a", "#f59e0b"].map((color) => (
            <Pressable
              key={color}
              style={[styles.colorSwatch, { backgroundColor: color }]}
              onPress={() => sendCommand(`window.__quickEditor.color('${color}')`)}
            />
          ))}

          <View style={styles.divider} />
          <Pressable style={styles.sizeButton} onPress={() => sendCommand("window.__quickEditor.fontSize(13)")}> 
            <Text variant="caption" style={{ color: theme.colors.textPrimary }}>Sm</Text>
          </Pressable>
          <Pressable style={styles.sizeButton} onPress={() => sendCommand("window.__quickEditor.fontSize(16)")}> 
            <Text variant="caption" style={{ color: theme.colors.textPrimary }}>N</Text>
          </Pressable>
          <Pressable style={styles.sizeButton} onPress={() => sendCommand("window.__quickEditor.fontSize(20)")}> 
            <Text variant="caption" style={{ color: theme.colors.textPrimary }}>Lg</Text>
          </Pressable>
          <Pressable style={styles.sizeButton} onPress={() => sendCommand("window.__quickEditor.fontSize(32)")}> 
            <Text variant="caption" style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>H1</Text>
          </Pressable>
          <Pressable style={styles.sizeButton} onPress={() => sendCommand("window.__quickEditor.fontSize(28)")}> 
            <Text variant="caption" style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>H2</Text>
          </Pressable>
          <Pressable style={styles.sizeButton} onPress={() => sendCommand("window.__quickEditor.fontSize(24)")}> 
            <Text variant="caption" style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>H3</Text>
          </Pressable>
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
        />
      </View>
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
  toolButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 999,
    marginHorizontal: 2
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: "rgba(127,127,127,0.45)",
    marginHorizontal: 4
  },
  sizeButton: {
    minWidth: 32,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
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
