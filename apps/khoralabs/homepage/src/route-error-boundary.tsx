import { Component } from "react";

type RouteErrorBoundaryProps = { children: React.ReactNode };
type RouteErrorBoundaryState = { error: Error | null };

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[homepage] render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            margin: "2rem auto",
            maxWidth: "40rem",
            padding: "1.5rem",
            fontFamily: "system-ui, sans-serif",
            color: "#f4f4ef",
            background: "#3f3f3f",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.75rem", opacity: 0.85, fontSize: "0.9rem" }}>
            {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
