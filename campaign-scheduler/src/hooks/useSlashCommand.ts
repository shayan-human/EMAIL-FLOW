import { useState, useCallback, useRef, useEffect } from "react";

export interface SlashCommandOption {
  label: string;
  tag: string;
}

export interface UseSlashCommandOptions {
  options: SlashCommandOption[];
  value: string;
  onChange: (value: string) => void;
}

export function useSlashCommand({ options, value, onChange }: UseSlashCommandOptions) {
  const [activePopup, setActivePopup] = useState<boolean>(false);
  const [slashIndex, setSlashIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleInputChange = useCallback((newValue: string, cursorPosition?: number) => {
    onChange(newValue);
    
    if (cursorPosition !== undefined && newValue.charAt(cursorPosition - 1) === "/") {
      setActivePopup(true);
      setSlashIndex(cursorPosition - 1);
      setSelectedIndex(0);
    } else if (activePopup && cursorPosition !== undefined) {
      if (newValue.charAt(cursorPosition - 1) !== "/") {
        setActivePopup(false);
        setSlashIndex(null);
      }
    }
  }, [onChange, activePopup]);

  const handleSelectOption = useCallback((option: SlashCommandOption) => {
    if (slashIndex === null) return;
    
    const before = value.substring(0, slashIndex);
    const after = value.substring(slashIndex + 1);
    const newValue = before + option.tag + after;
    onChange(newValue);
    
    setActivePopup(false);
    setSlashIndex(null);
  }, [slashIndex, value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!activePopup) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelectOption(options[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActivePopup(false);
      setSlashIndex(null);
    }
  }, [activePopup, options, selectedIndex, handleSelectOption]);

  // Handle click outside
  const popupRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!activePopup) return;

    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setActivePopup(false);
        setSlashIndex(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activePopup]);

  return {
    activePopup,
    selectedIndex,
    popupRef,
    handleInputChange,
    handleKeyDown,
    handleSelectOption,
  };
}
