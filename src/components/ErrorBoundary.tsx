import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches unhandled React render errors so the app shows a recovery UI
 * instead of a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "An unexpected error occurred",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React error boundary caught:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0e1012] p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#16191b] border border-gray-200 dark:border-[#222629] rounded-2xl p-8 shadow-lg text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <AlertTriangle className="text-red-500" size={28} />
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">
              {this.props.fallbackTitle || "Something went wrong"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-6 break-words">
              {this.state.message}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-[#2a3036] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#1d2327] transition-colors"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
              >
                <RefreshCw size={16} />
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
