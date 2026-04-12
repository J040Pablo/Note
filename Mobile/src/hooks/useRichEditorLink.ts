import { useCallback, useState } from "react";
import type { Link } from "@utils/linkUtils";
import { wrapTextInLink, stringToLink } from "@utils/linkUtils";

export interface LinkInsertContext {
  blockId: string;
  start: number;
  end: number;
}

export const useRichEditorLink = () => {
  const [linkContext, setLinkContext] = useState<LinkInsertContext | null>(null);

  const insertLinkInBlock = useCallback(
    (blockText: string, html: string, context: LinkInsertContext): string => {
      try {
        const before = blockText.substring(0, context.start);
        const after = blockText.substring(context.end);
        return before + html + after;
      } catch (error) {
        console.error("Error inserting link:", error);
        return blockText;
      }
    },
    []
  );

  const getSelectedText = useCallback(
    (blockText: string, context: LinkInsertContext): string => {
      try {
        return blockText.substring(context.start, context.end);
      } catch {
        return "";
      }
    },
    []
  );

  const extractLinksFromText = useCallback((text: string): Link[] => {
    const links: Link[] = [];
    const regex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;

    let match;
    while ((match = regex.exec(text)) !== null) {
      const link = stringToLink(match[1]);
      if (link) {
        links.push(link);
      }
    }

    return links;
  }, []);

  return {
    linkContext,
    setLinkContext,
    insertLinkInBlock,
    getSelectedText,
    extractLinksFromText
  };
};
