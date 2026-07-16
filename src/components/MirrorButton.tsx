import { Play } from "lucide-react";

interface MirrorButtonProps {
  size: "sm" | "md" | "lg";
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}

export function MirrorButton({ size, onClick, title, className = "" }: MirrorButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center transition-all bg-cyan-600 hover:bg-cyan-700 text-white font-medium shadow-sm hover:shadow active:scale-[0.98] ${
        size === "lg"
          ? "gap-2.5 px-7 py-3.5 rounded-xl text-sm"
          : size === "md"
          ? "gap-2 px-5 py-2.5 rounded-xl text-sm"
          : "gap-1.5 px-3.5 py-1.5 rounded-lg text-sm"
      } ${className}`}
    >
      {size === "lg" || size === "md" ? (
        <>
          <Play size={size === "lg" ? 16 : 14} fill="currentColor" />
          <span>Start Mirroring</span>
        </>
      ) : (
        <>
          <span>Mirror</span>
          <Play size={12} fill="currentColor" />
        </>
      )}
    </button>
  );
}
