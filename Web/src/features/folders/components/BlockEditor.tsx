import React from "react";
import {
  ArrowDown,
  ArrowUp,
  Code2,
  FileImage,
  ImageOff,
  Pen,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import type {
  NoteBlock,
  NoteCodeBlock,
  NoteDrawingBlock,
  NoteImageBlock,
  NoteTextBlock,
  DrawingStroke,
  DrawingPoint,
  ID,
} from "../../../utils/noteContent";
import {
  createTextBlock,
  createCodeBlock,
  createImageBlock,
  createDrawingBlock,
} from "../../../utils/noteContent";
import styles from "./BlockEditor.module.css";

// ─── Types ──────────────────────────────────────────────────────────────────

type BlockEditorProps = {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
};

const isBrowserRenderableImageUri = (uri: string): boolean => {
  const value = uri.trim();
  if (!value) return false;
  if (value.startsWith("data:image/")) return true;
  if (value.startsWith("blob:")) return true;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) return true;
  if (value.startsWith("file://")) return false;
  return !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
};

// ─── Text Block ─────────────────────────────────────────────────────────────

const TextBlockEditor: React.FC<{
  block: NoteTextBlock;
  onChange: (block: NoteTextBlock) => void;
  autoFocus?: boolean;
}> = ({ block, onChange, autoFocus }) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text]);

  return (
    <textarea
      ref={ref}
      className={styles.textBlock}
      value={block.text}
      onChange={(e) => onChange({ ...block, text: e.target.value })}
      placeholder="Type something..."
      rows={1}
    />
  );
};

// ─── Code Block ─────────────────────────────────────────────────────────────

const LANGUAGES: NoteCodeBlock["language"][] = [
  "javascript",
  "typescript",
  "python",
  "java",
  "sql",
  "html",
  "css",
  "json",
  "yaml",
  "bash",
];

const CodeBlockEditor: React.FC<{
  block: NoteCodeBlock;
  onChange: (block: NoteCodeBlock) => void;
  autoFocus?: boolean;
}> = ({ block, onChange, autoFocus }) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  return (
    <div className={styles.codeBlockWrap}>
      <div className={styles.codeBlockHeader}>
        <select
          className={styles.codeBlockLang}
          value={block.language ?? "javascript"}
          onChange={(e) =>
            onChange({
              ...block,
              language: e.target.value as NoteCodeBlock["language"],
            })
          }
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      <textarea
        ref={ref}
        className={styles.codeBlockTextarea}
        value={block.code}
        onChange={(e) => onChange({ ...block, code: e.target.value })}
        placeholder="// Write code here..."
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const value = ta.value;
            const newValue = value.substring(0, start) + "  " + value.substring(end);
            onChange({ ...block, code: newValue });
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = start + 2;
            });
          }
        }}
      />
    </div>
  );
};

// ─── Image Block ────────────────────────────────────────────────────────────

const ImageBlockEditor: React.FC<{
  block: NoteImageBlock;
  onChange: (block: NoteImageBlock) => void;
}> = ({ block, onChange }) => {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [imageLoadFailed, setImageLoadFailed] = React.useState(false);
  const canRenderImage = isBrowserRenderableImageUri(block.uri ?? "");

  React.useEffect(() => {
    setImageLoadFailed(false);
  }, [block.uri]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange({ ...block, uri: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.imageBlockWrap}>
      {block.uri ? (
        <>
          {canRenderImage && !imageLoadFailed ? (
            <img
              src={block.uri}
              alt={block.caption || "Note image"}
              className={styles.imageBlockPreview}
              onError={() => setImageLoadFailed(true)}
              onClick={() => fileRef.current?.click()}
            />
          ) : (
            <div
              className={styles.imageBlockUpload}
              onClick={() => fileRef.current?.click()}
              style={{ minHeight: 180 }}
            >
              <span>
                <ImageOff size={18} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Image unavailable in web (mobile local file)
              </span>
            </div>
          )}
          <input
            className={styles.imageBlockCaption}
            value={block.caption ?? ""}
            onChange={(e) => onChange({ ...block, caption: e.target.value })}
            placeholder="Add caption..."
          />
        </>
      ) : (
        <div
          className={styles.imageBlockUpload}
          onClick={() => fileRef.current?.click()}
        >
          <span>
            <FileImage size={20} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Click to upload image
          </span>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />
    </div>
  );
};

// ─── Drawing Block ──────────────────────────────────────────────────────────

const DrawingBlockEditor: React.FC<{
  block: NoteDrawingBlock;
  onChange: (block: NoteDrawingBlock) => void;
}> = ({ block, onChange }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [isEraser, setIsEraser] = React.useState(false);
  const [strokeColor, setStrokeColor] = React.useState("#e2e8f0");
  const [strokeSize, setStrokeSize] = React.useState(3);
  const currentStrokeRef = React.useRef<DrawingPoint[]>([]);
  const strokesRef = React.useRef<DrawingStroke[]>(block.strokes ?? []);

  // Keep strokes ref in sync
  React.useEffect(() => {
    strokesRef.current = block.strokes ?? [];
  }, [block.strokes]);

  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = strokesRef.current;
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.isEraser ? "#0a0e17" : stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = stroke.opacity ?? 1;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, []);

  React.useEffect(() => {
    redraw();
  }, [block.strokes, redraw]);

  // Resize canvas
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== block.height) {
      canvas.width = rect.width;
      canvas.height = block.height;
      redraw();
    }
  }, [block.height, redraw]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): DrawingPoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    currentStrokeRef.current = [getPos(e)];
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const point = getPos(e);
    currentStrokeRef.current.push(point);

    // Draw live stroke
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = currentStrokeRef.current;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = isEraser ? "#0a0e17" : strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStrokeRef.current.length >= 2) {
      const newStroke: DrawingStroke = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
        color: strokeColor,
        size: strokeSize,
        opacity: 1,
        isEraser,
        points: currentStrokeRef.current,
      };
      const nextStrokes = [...(block.strokes ?? []), newStroke];
      onChange({ ...block, strokes: nextStrokes });
    }
    currentStrokeRef.current = [];
  };

  const handleClear = () => {
    onChange({ ...block, strokes: [] });
  };

  const handleUndo = () => {
    if (!block.strokes?.length) return;
    onChange({ ...block, strokes: block.strokes.slice(0, -1) });
  };

  return (
    <div className={styles.drawingBlockWrap}>
      <canvas
        ref={canvasRef}
        className={styles.drawingCanvas}
        height={block.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className={styles.drawingToolbar}>
        <button
          type="button"
          className={`${styles.drawingToolBtn} ${!isEraser ? styles.drawingToolBtnActive : ""}`}
          onClick={() => setIsEraser(false)}
        >
          <Pen size={12} /> Draw
        </button>
        <button
          type="button"
          className={`${styles.drawingToolBtn} ${isEraser ? styles.drawingToolBtnActive : ""}`}
          onClick={() => setIsEraser(true)}
        >
          Eraser
        </button>
        <input
          type="color"
          className={styles.drawingColorInput}
          value={strokeColor}
          onChange={(e) => setStrokeColor(e.target.value)}
          title="Stroke color"
        />
        <input
          type="range"
          className={styles.drawingSizeInput}
          min={1}
          max={20}
          value={strokeSize}
          onChange={(e) => setStrokeSize(Number(e.target.value))}
          title="Stroke size"
        />
        <button type="button" className={styles.drawingToolBtn} onClick={handleUndo}>
          Undo
        </button>
        <button type="button" className={styles.drawingToolBtn} onClick={handleClear}>
          Clear
        </button>
      </div>
    </div>
  );
};

// ─── Block Toolbar ──────────────────────────────────────────────────────────

const BlockToolbar: React.FC<{
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}> = ({ index, total, onMoveUp, onMoveDown, onDelete }) => (
  <div className={styles.blockToolbar}>
    {index > 0 && (
      <button type="button" className={styles.blockToolbarBtn} onClick={onMoveUp} title="Move up">
        <ArrowUp size={13} />
      </button>
    )}
    {index < total - 1 && (
      <button type="button" className={styles.blockToolbarBtn} onClick={onMoveDown} title="Move down">
        <ArrowDown size={13} />
      </button>
    )}
    <button
      type="button"
      className={`${styles.blockToolbarBtn} ${styles.blockToolbarBtnDanger}`}
      onClick={onDelete}
      title="Remove block"
    >
      <Trash2 size={13} />
    </button>
  </div>
);

// ─── Add Block Menu ─────────────────────────────────────────────────────────

const AddBlockMenu: React.FC<{
  insertIndex: number;
  onAdd: (block: NoteBlock, index: number) => void;
}> = ({ insertIndex, onAdd }) => {
  const [open, setOpen] = React.useState(false);

  const add = (block: NoteBlock) => {
    onAdd(block, insertIndex);
    setOpen(false);
  };

  return (
    <div className={styles.addBlockRow}>
      <button
        type="button"
        className={styles.addBlockBtn}
        onClick={() => setOpen((v) => !v)}
        title="Add block"
      >
        <Plus size={14} />
      </button>
      {open && (
        <div className={styles.addBlockMenu}>
          <button
            type="button"
            className={styles.addBlockMenuItem}
            onClick={() => add(createTextBlock(""))}
          >
            <Type size={13} /> Text
          </button>
          <button
            type="button"
            className={styles.addBlockMenuItem}
            onClick={() => add(createCodeBlock(""))}
          >
            <Code2 size={13} /> Code
          </button>
          <button
            type="button"
            className={styles.addBlockMenuItem}
            onClick={() => add(createImageBlock(""))}
          >
            <FileImage size={13} /> Image
          </button>
          <button
            type="button"
            className={styles.addBlockMenuItem}
            onClick={() => add(createDrawingBlock())}
          >
            <Pen size={13} /> Drawing
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main Block Editor ──────────────────────────────────────────────────────

const BlockEditor: React.FC<BlockEditorProps> = ({ blocks, onChange }) => {
  const [lastAddedId, setLastAddedId] = React.useState<string | null>(null);

  const updateBlock = React.useCallback(
    (index: number, updated: NoteBlock) => {
      const next = blocks.map((b, i) => (i === index ? updated : b));
      onChange(next);
    },
    [blocks, onChange]
  );

  const deleteBlock = React.useCallback(
    (index: number) => {
      if (blocks.length <= 1) {
        // Always keep at least one text block
        onChange([createTextBlock("")]);
        return;
      }
      onChange(blocks.filter((_, i) => i !== index));
    },
    [blocks, onChange]
  );

  const moveBlock = React.useCallback(
    (index: number, direction: "up" | "down") => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= blocks.length) return;
      const next = [...blocks];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    },
    [blocks, onChange]
  );

  const insertBlock = React.useCallback(
    (block: NoteBlock, index: number) => {
      const next = [...blocks];
      next.splice(index, 0, block);
      onChange(next);
      setLastAddedId(block.id);
    },
    [blocks, onChange]
  );

  return (
    <div className={styles.blockEditor}>
      {blocks.map((block, index) => (
        <React.Fragment key={block.id}>
          <div className={styles.blockWrapper}>
            <BlockToolbar
              index={index}
              total={blocks.length}
              onMoveUp={() => moveBlock(index, "up")}
              onMoveDown={() => moveBlock(index, "down")}
              onDelete={() => deleteBlock(index)}
            />
            {block.type === "text" && (
              <TextBlockEditor
                block={block}
                onChange={(b) => updateBlock(index, b)}
                autoFocus={block.id === lastAddedId}
              />
            )}
            {block.type === "code" && (
              <CodeBlockEditor
                block={block}
                onChange={(b) => updateBlock(index, b)}
                autoFocus={block.id === lastAddedId}
              />
            )}
            {block.type === "image" && (
              <ImageBlockEditor
                block={block}
                onChange={(b) => updateBlock(index, b)}
              />
            )}
            {block.type === "drawing" && (
              <DrawingBlockEditor
                block={block}
                onChange={(b) => updateBlock(index, b)}
              />
            )}
          </div>
          <AddBlockMenu insertIndex={index + 1} onAdd={insertBlock} />
        </React.Fragment>
      ))}

      {blocks.length === 0 && (
        <>
          <p className={styles.emptyHint}>
            Click + to add your first block
          </p>
          <AddBlockMenu insertIndex={0} onAdd={insertBlock} />
        </>
      )}
    </div>
  );
};

export default BlockEditor;
