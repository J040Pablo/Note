import { useCallback, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@navigation/RootNavigator";
import type { Link, InternalLinkType } from "@utils/linkUtils";
import { normalizeUrl, openLink, wrapTextInLink } from "@utils/linkUtils";
import { log, warn, error as logError } from '@utils/logger';

export interface LinkModalState {
  visible: boolean;
  selectedText: string;
  existingLink?: Link;
}

export interface LinkSearchResult {
  id: string;
  title: string;
  type: InternalLinkType;
  description?: string;
}

export interface UseLinkHandlerReturn {
  linkModalVisible: boolean;
  selectedText: string;
  existingLink?: Link;
  openLinkModal: (text: string, link?: Link) => void;
  closeLinkModal: () => void;
  insertExternalLink: (url: string, text: string) => void;
  insertInternalLink: (link: Link, text: string) => void;
  handleLinkPress: (link: Link) => Promise<void>;
}

export const useLinkHandler = (
  onInsertLink?: (html: string) => void
): UseLinkHandlerReturn => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [modalState, setModalState] = useState<LinkModalState>({
    visible: false,
    selectedText: ""
  });

  const pendingInsertRef = useRef<{ html: string } | null>(null);

  const openLinkModal = useCallback((text: string, link?: Link) => {
    setModalState({
      visible: true,
      selectedText: text,
      existingLink: link
    });
  }, []);

  const closeLinkModal = useCallback(() => {
    setModalState({
      visible: false,
      selectedText: "",
      existingLink: undefined
    });
    pendingInsertRef.current = null;
  }, []);

  const insertExternalLink = useCallback(
    (url: string, text: string) => {
      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) {
        warn("Invalid URL:", url);
        return;
      }

      const link: Link = {
        type: "external",
        url: normalizedUrl
      };

      const html = wrapTextInLink(text || url, link);
      onInsertLink?.(html);
      closeLinkModal();
    },
    [onInsertLink, closeLinkModal]
  );

  const insertInternalLink = useCallback(
    (link: Link, text: string) => {
      const html = wrapTextInLink(text, link);
      onInsertLink?.(html);
      closeLinkModal();
    },
    [onInsertLink, closeLinkModal]
  );

  const handleLinkPress = useCallback(
    async (link: Link) => {
      try {
        await openLink(link, navigation);
      } catch (error) {
        logError("Error handling link press:", error);
      }
    },
    [navigation]
  );

  return {
    linkModalVisible: modalState.visible,
    selectedText: modalState.selectedText,
    existingLink: modalState.existingLink,
    openLinkModal,
    closeLinkModal,
    insertExternalLink,
    insertInternalLink,
    handleLinkPress
  };
};
