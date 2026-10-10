import * as React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render/commit errors so a single failure shows a fallback instead of
 * unmounting the whole app and leaving the user on a blank white page.
 *
 * The common real-world trigger is browser auto-translation (Chrome's
 * "Translate to <language>"): it swaps React's text nodes for <font> wrappers,
 * so the next unmount of that subtree — opening/closing a dropdown, dialog or
 * menu — throws `NotFoundError: Failed to execute 'removeChild' on 'Node'`.
 * The UI primitives in components/ui are marked `translate="no"` to prevent it;
 * this boundary is the safety net for anything that slips through.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base font-medium">Something went wrong.</p>
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}

export { ErrorBoundary };
