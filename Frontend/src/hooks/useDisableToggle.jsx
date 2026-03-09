import { useState } from "react";

export function useDisableToggle(initialState) {
  const [disableState, setDisableState] = useState(initialState);

  const toggleDisable = (key) => {
    setDisableState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isDisabled = (key) => disableState[key] || false;

  return { isDisabled, toggleDisable };
}
