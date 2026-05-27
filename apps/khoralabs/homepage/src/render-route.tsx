import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";

type RouteErrorBoundaryProps = { children: React.ReactNode };
type RouteErrorBoundaryState = { error: Error | null };

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
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

export function renderRoute(Component: React.ComponentType) {
  const elem = document.getElementById("root");
  if (!elem) throw new Error("Root element not found");
  const app = (
    <StrictMode>
      <RouteErrorBoundary>
        <Component />
      </RouteErrorBoundary>
    </StrictMode>
  );
  if (import.meta.hot) {
    const root = import.meta.hot.data.root ?? createRoot(elem);
    root.render(app);
  } else {
    createRoot(elem).render(app);
  }
}
