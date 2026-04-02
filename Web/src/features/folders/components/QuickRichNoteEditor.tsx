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

  React.useEffect(() => {
    if (!editable) return;
    const node = editorRef.current;
    if (!node) return;
    const nextHtml = renderedHtml || "";
    if (node.innerHTML !== nextHtml) {
      node.innerHTML = nextHtml;
    }
  }, [editable, renderedHtml]);

  const commitHtml = React.useCallback(() => {
    if (!editable) return;
    const node = editorRef.current;
    if (!node) return;
    const nextHtml = sanitizeQuickRichHtml(node.innerHTML);
    node.innerHTML = nextHtml;
    onChange(nextHtml);
  }, [editable, onChange]);

  return (
    <div className={styles.quickNoteShell}>
      <div
        ref={editorRef}
        className={styles.richPreview}
        contentEditable={editable}
        suppressContentEditableWarning
        data-placeholder="Start writing your quick note..."
        onInput={commitHtml}
        onBlur={commitHtml}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
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
