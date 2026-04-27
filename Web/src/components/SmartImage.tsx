import React, { useState, useEffect } from "react";
import { resolveImageUri } from "../services/imageResolver";

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  uri?: string;
  fallback?: React.ReactNode;
}

/**
 * An image component that automatically resolves webfile:// references from IndexedDB
 * and handles fallbacks for unrenderable mobile file:// URIs.
 */
const SmartImage: React.FC<SmartImageProps> = ({ uri, fallback, ...props }) => {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const resolved = await resolveImageUri(uri);
        if (active) setSrc(resolved);
      } catch (err) {
        console.error("[SmartImage] Failed to resolve URI:", uri, err);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [uri]);

  if (loading) {
    return <div className={props.className} style={{ ...props.style, backgroundColor: '#f0f0f0' }} />;
  }

  if (!src) {
    return <>{fallback || <div className={props.className} style={{ ...props.style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', color: '#999', fontSize: '12px' }}>{uri?.startsWith('file://') ? 'Mobile Local Session' : 'No image'}</div>}</>;
  }

  return <img src={src} {...props} />;
};

export default SmartImage;
