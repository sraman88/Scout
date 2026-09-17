import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen">
          <div className="screen-card" role="alert">
            <div className="brandmark">S<span>C</span>OUT</div>
            <h1>Something broke rendering this screen</h1>
            <p style={{ wordBreak: "break-word" }}>{this.state.error.message || String(this.state.error)}</p>
            <p style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              Often an Apify actor returning data in a shape Scout didn't expect. Try a different actor in Settings, or reload and retry.
            </p>
            <button className="btn-pri" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
