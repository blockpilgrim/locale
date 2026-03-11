"use client";

// ---------------------------------------------------------------------------
// SectionErrorBoundary — Catches render errors in individual report sections
// ---------------------------------------------------------------------------
// Prevents a single broken section (map, data, narrative) from crashing the
// entire report page. Displays a subtle, collapsed fallback with a retry
// option, consistent with the editorial magazine aesthetic.
//
// React error boundaries must be class components — function components
// cannot implement componentDidCatch / getDerivedStateFromError.
// ---------------------------------------------------------------------------

import React from "react";

interface SectionErrorBoundaryProps {
  /** Human-readable label for the section (e.g., "Map", "Demographics"). */
  sectionName: string;
  /** The section content to render. */
  children: React.ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
}

export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[SectionErrorBoundary] ${this.props.sectionName} failed to render:`,
      error,
      errorInfo,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-border-light bg-warm-50 px-6 py-8 text-center">
          <p className="text-sm text-ink-muted">
            Unable to display{" "}
            <span className="font-medium text-ink-light">
              {this.props.sectionName}
            </span>
          </p>
          <button
            onClick={this.handleRetry}
            className="mt-3 text-sm font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
