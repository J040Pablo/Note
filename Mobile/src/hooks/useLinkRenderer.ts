import { useCallback } from "react";
import { Linking } from "react-native";
import type { Link } from "@utils/linkUtils";
import { stringToLink } from "@utils/linkUtils";
import { log, warn, error as logError } from '@utils/logger';

export const useLinkRenderer = (navigation?: any) => {
  const renderHtmlWithLinks = useCallback(
    async (html: string) => {
      const links: Array<{ text: string; href: string; link: Link | null }> = [];
      const regex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;

      let match;
      while ((match = regex.exec(html)) !== null) {
        const href = match[1];
        const text = match[2];
        const link = stringToLink(href);

        links.push({ text, href, link });
      }

      return links;
    },
    []
  );

  const handleLinkClick = useCallback(
    async (link: Link | null) => {
      if (!link) return;

      try {
        if (link.type === "external") {
          await Linking.openURL(link.url);
          return;
        }

        if (!navigation) {
          warn("Navigation not provided for internal link");
          return;
        }

        const { entity, id } = link;

        switch (entity) {
          case "note":
            navigation.navigate("NoteEditor", { noteId: id });
            break;

          case "quick_note":
            navigation.navigate("QuickNote", { quickNoteId: id });
            break;

          case "folder":
            navigation.navigate("Tabs", {
              screen: "Folders",
              params: {
                screen: "FolderDetail",
                params: { folderId: id }
              }
            });
            break;

          case "task":
            navigation.navigate("Tabs", {
              screen: "Tasks",
              params: { focusTaskId: id }
            });
            break;

          default:
            warn("Unknown link entity:", entity);
        }
      } catch (error) {
        logError("Error handling link click:", error);
      }
    },
    [navigation]
  );

  return { renderHtmlWithLinks, handleLinkClick };
};
