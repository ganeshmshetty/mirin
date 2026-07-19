import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

export function CustomSelect({ value, options, onChange }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative w-48 text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 border border-gray-300 dark:border-app-border rounded-lg shadow-sm bg-white dark:bg-app-input text-gray-900 dark:text-app-text text-sm hover:border-gray-400 dark:hover:border-[#2f353a] transition-all outline-none"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : value}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 dark:text-slate-500 transition-transform duration-200 shrink-0 ml-1 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-full dropdown-menu z-50 animate-scale-in origin-top-right">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`dropdown-item ${
                opt.value === value
                  ? "bg-cyan-50/50 dark:bg-[#1a262b] text-cyan-600 dark:text-[#22d3ee] font-semibold"
                  : ""
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
