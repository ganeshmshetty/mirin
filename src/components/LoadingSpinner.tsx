interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  color?: "primary" | "white" | "gray";
  text?: string;
}

export function LoadingSpinner({
  size = "md",
  color = "primary",
  text,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const colorClasses = {
    primary: "border-primary-600",
    white: "border-white",
    gray: "border-gray-600",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size]} border-4 ${colorClasses[color]} border-t-transparent rounded-full animate-spin`}
        role="status"
        aria-label="Loading"
      ></div>
      {text && <p className="text-sm text-gray-600 animate-pulse">{text}</p>}
    </div>
  );
}
