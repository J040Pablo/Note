import { useEffect, useState } from "react";
import { validateImagePath } from "@services/imageService";

export const useValidatedImageUri = (uri: string | null) => {
  const [validated, setValidated] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) {
      setValidated(null);
      return;
    }

    const validate = async () => {
      const valid = await validateImagePath(uri);
      setValidated(valid);
    };

    validate();
  }, [uri]);

  return validated;
};
