import { Component } from "react";
import { T } from "../theme.js";

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
        <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.mono, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 560, textAlign: "center" }}>
            <div style={{ color: T.red, fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Something broke rendering this screen</div>
            <div style={{ color: T.text2, fontSize: 13, marginBottom: 16, lineHeight: 1.6, wordBreak: "break-word" }}>{this.state.error.message || String(this.state.error)}</div>
            <div style={{ color: T.text3, fontSize: 12, marginBottom: 16 }}>Often caused by an Apify actor returning data in a shape Scout didn't expect. Try a different actor, or reload and retry.</div>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 18px", background: T.cyan, color: T.bg, border: "none", borderRadius: 8, fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>RELOAD</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
