import { Component } from "react";
import ErrorFallback from "./ErrorFallback";

// Without a boundary, any error thrown while rendering (including a page or modal chunk
// that fails to load) unmounts the whole app and leaves a blank white screen. This shows
// a clear screen with a way out instead. It does not catch errors in event handlers or
// async code, which React does not route to boundaries.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error: error ?? new Error("Unknown error") };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}
