import React from "react";
import styles from "./QuickRichNoteEditor.module.css";
import {
  quickRichNoteDocToHtml,
  quickRichNoteDocToText,
  sanitizeQuickRichHtml,
} from "../../../utils/quickRichNote";

type Props = {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
};

const QuickRichNoteEditor: React.FC<Props> = ({ value, onChange, editable = true }) => {
  const [showSource, setShowSource] = React.useState(false);
  const editorRef = React.useRef<HTMLDivElement>(null);

  const renderedHtml = React.useMemo(() => quickRichNoteDocToHtml(value), [value]);
  const summary = React.useMemo(() => quickRichNoteDocToText(value), [value]);

  const commitHtml = React.useCallback(() => {
    if (!editable) return;
    const node = editorRef.current;
    if (!node) return;
    const nextHtml = sanitizeQuickRichHtml(node.innerHTML);
    // Do NOT reassign innerHTML here to avoid resetting the DOM and
    // disrupting the caret/selection. We let the effect sync DOM when
    // the canonical `value` changes instead.
    onChange(nextHtml);
  }, [editable, onChange]);

  const applyExec = React.useCallback((command: string, value?: string) => {
    const node = editorRef.current;
    if (!node) return;
    node.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // ignore
    }
    // commit change to propagate sanitized HTML upstream
    commitHtml();
  }, [commitHtml]);

  const applyStyleToSelection = React.useCallback((styleObj: Record<string, string>) => {
    const node = editorRef.current;
    if (!node) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    Object.assign(span.style, styleObj);
    span.appendChild(range.extractContents());
    range.insertNode(span);
    // move caret after inserted span
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    commitHtml();
  }, [commitHtml]);

  React.useEffect(() => {
    if (!editable) return;
    const node = editorRef.current;
    if (!node) return;
    const nextHtml = renderedHtml || "";
    if (node.innerHTML !== nextHtml) {
      node.innerHTML = nextHtml;
    }
  }, [editable, renderedHtml]);


  return (
    <div className={styles.quickNoteShell}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.tool} onClick={() => applyExec('bold')}>B</button>
        <button type="button" className={styles.tool} onClick={() => applyExec('italic')}>I</button>
        <button type="button" className={styles.tool} onClick={() => applyExec('underline')}>U</button>
        <button type="button" className={styles.tool} onClick={() => applyExec('strikeThrough')}>S</button>
        <button type="button" className={styles.tool} onClick={() => applyExec('insertUnorderedList')}>• List</button>
        <button type="button" className={styles.tool} onClick={() => applyExec('insertOrderedList')}>1. List</button>
        <button type="button" className={styles.tool} onClick={() => applyStyleToSelection({ fontSize: '20px' })}>Size</button>
        <button type="button" className={styles.tool} onClick={() => applyExec('formatBlock', 'H1')}>H1</button>
        <button type="button" className={styles.tool} onClick={() => applyExec('formatBlock', 'H2')}>H2</button>
      </div>
      <div
        ref={editorRef}
        className={styles.richPreview}
        dir="ltr"
        contentEditable={editable}
        suppressContentEditableWarning
        data-placeholder="Start writing your quick note..."
        onInput={commitHtml}
        onBlur={commitHtml}
      />

      {editable ? (
        <>
          <button
            type="button"
            className={styles.sourceToggle}
            onClick={() => setShowSource((prev) => !prev)}
          >
            {showSource ? "Hide source" : "Edit HTML source"}
          </button>

          {showSource ? (
            <>
              <textarea
                className={styles.sourceEditor}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                spellCheck={false}
              />
              <p className={styles.hint}>
                This source view is safe to edit, but the rendered note uses sanitized rich HTML.
                Quick summary: {summary || "Untitled note"}
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default QuickRichNoteEditor;
