import React from "react";
import { ImagePlus, Palette, X } from "lucide-react";
import type { FolderDraft } from "../types";
import styles from "./FolderModal.module.css";

type FolderModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (folder: FolderDraft) => void;
};

const PRESET_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#8b5cf6",
  "#f97316",
  "#ef4444",
  "#facc15",
  "#6366f1",
  "#d946ef",
  "#0ea5e9",
  "#f8fafc",
  "#111827",
];

const FolderModal: React.FC<FolderModalProps> = ({ open, onClose, onCreate }) => {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(PRESET_COLORS[0]);
  const [imageUrl, setImageUrl] = React.useState<string | undefined>();
  const [bannerUrl, setBannerUrl] = React.useState<string | undefined>();
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose, open]);

  React.useEffect(() => {
    if (open) {
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const pickFile = (setter: (value: string | undefined) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setter(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
  };

  const handleCreate = () => {
    const safeName = name.trim();
    if (!safeName) {
      setError("Folder name is required.");
      return;
    }

    onCreate({
      name: safeName,
      description: description.trim(),
      color,
      imageUrl,
      bannerUrl,
    });

    setName("");
    setDescription("");
    setColor(PRESET_COLORS[0]);
    setImageUrl(undefined);
    setBannerUrl(undefined);
    setError("");
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create folder">
        <header className={styles.header}>
          <div>
            <h2>New folder</h2>
            <p>Add details to make your folders easier to find.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>Folder Name *</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Folder name" />
          </label>

          <label className={styles.field}>
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              rows={3}
            />
          </label>

          <div className={styles.uploadGrid}>
            <label className={styles.uploadField}>
              <span>Folder image</span>
              <input type="file" accept="image/*" onChange={pickFile(setImageUrl)} />
              <div className={styles.uploadButton}><ImagePlus size={16} /> Upload image</div>
              {imageUrl ? <img src={imageUrl} alt="Folder preview" className={styles.previewSmall} /> : null}
            </label>

            <label className={styles.uploadField}>
              <span>Banner image</span>
              <input type="file" accept="image/*" onChange={pickFile(setBannerUrl)} />
              <div className={styles.uploadButton}><ImagePlus size={16} /> Upload banner</div>
              {bannerUrl ? <img src={bannerUrl} alt="Banner preview" className={styles.previewBanner} /> : null}
            </label>
          </div>

          <div className={styles.colorSection}>
            <span>Folder color</span>
            <div className={styles.colorRow}>
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`${styles.colorSwatch} ${color.toLowerCase() === preset.toLowerCase() ? styles.colorSwatchSelected : ""}`}
                  style={{ backgroundColor: preset }}
                  onClick={() => setColor(preset)}
                  aria-label={`Choose ${preset}`}
                />
              ))}
            </div>
            <label className={styles.wheelPicker}>
              <Palette size={15} />
              <span>Custom color wheel</span>
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
            <div className={styles.colorPreview}>
              <span>Preview</span>
              <div className={styles.previewDot} style={{ backgroundColor: color }} />
            </div>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.createButton} onClick={handleCreate}>
            Create Folder
          </button>
        </footer>
      </div>
    </div>
  );
};

export default FolderModal;
