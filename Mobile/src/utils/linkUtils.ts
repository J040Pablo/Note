import { Linking } from "react-native";

export type InternalLinkType = "note" | "quick_note" | "folder" | "task";

export interface ExternalLink {
  type: "external";
  url: string;
}

export interface InternalLink {
  type: "internal";
  entity: InternalLinkType;
  id: string;
}

export type Link = ExternalLink | InternalLink;

/**
 * Valida e normaliza URLs externas
 */
export const normalizeUrl = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Se não tem protocolo, adiciona https://
  if (!trimmed.match(/^https?:\/\//i)) {
    return `https://${trimmed}`;
  }

  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return null;
  }
};

/**
 * Valida se uma URL é válida
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Valida se um link é válido
 */
export const isValidLink = (link: Link): boolean => {
  if (link.type === "external") {
    return isValidUrl(link.url);
  }

  return Boolean(link.entity && link.id);
};

/**
 * Converte link para string (para armazenamento ou serialização)
 */
export const linkToString = (link: Link): string => {
  if (link.type === "external") {
    return link.url;
  }

  return `app://${link.entity}/${link.id}`;
};

/**
 * Converte string de volta para Link
 */
export const stringToLink = (str: string): Link | null => {
  if (str.startsWith("app://")) {
    const match = str.match(/^app:\/\/([^\/]+)\/(.+)$/);
    if (match) {
      const entity = match[1];
      const id = match[2];

      if (["note", "quick_note", "folder", "task"].includes(entity)) {
        return {
          type: "internal",
          entity: entity as InternalLinkType,
          id
        };
      }
    }
    return null;
  }

  // Se começa com http ou https, é um link externo
  if (str.startsWith("http://") || str.startsWith("https://")) {
    return {
      type: "external",
      url: str
    };
  }

  return null;
};

/**
 * Abre um link (interno ou externo)
 */
export const openLink = async (link: Link, navigation?: any): Promise<boolean> => {
  try {
    if (link.type === "external") {
      await Linking.openURL(link.url);
      return true;
    }

    // Link interno
    if (!navigation) {
      console.warn("Navigation not provided for internal link");
      return false;
    }

    const { entity, id } = link;

    switch (entity) {
      case "note":
        navigation.navigate("NoteEditor", { noteId: id });
        return true;

      case "quick_note":
        navigation.navigate("QuickNote", { quickNoteId: id });
        return true;

      case "folder":
        navigation.navigate("Tabs", {
          screen: "Folders",
          params: {
            screen: "FolderDetail",
            params: { folderId: id }
          }
        });
        return true;

      case "task":
        navigation.navigate("Tabs", {
          screen: "Tasks",
          params: { focusTaskId: id }
        });
        return true;

      default:
        return false;
    }
  } catch (error) {
    console.error("Error opening link:", error);
    return false;
  }
};

/**
 * Extrai links de HTML
 */
export const extractLinksFromHtml = (html: string): Array<{ text: string; link: Link }> => {
  const links: Array<{ text: string; link: Link }> = [];
  const regex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2];
    const link = stringToLink(href);

    if (link) {
      links.push({ text, link });
    }
  }

  return links;
};

/**
 * Envolve texto em um link HTML
 */
export const wrapTextInLink = (text: string, link: Link): string => {
  const href = linkToString(link);
  const escaped = text.replace(/"/g, "&quot;");
  return `<a href="${href}">${escaped}</a>`;
};
