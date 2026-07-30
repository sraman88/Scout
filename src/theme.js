export const ENV_GROQ = import.meta.env?.VITE_GROQ_KEY || "";
export const ENV_GH = import.meta.env?.VITE_GITHUB_TOKEN || "";
export const ENV_GEMINI = import.meta.env?.VITE_GEMINI_KEY || "";

export const COUNTRIES = [
  { code: "IN", name: "India", currency: "INR", default_loc: "Bangalore, India" },
  { code: "US", name: "United States", currency: "USD", default_loc: "San Francisco, USA" },
  { code: "UK", name: "United Kingdom", currency: "GBP", default_loc: "London, UK" },
  { code: "DE", name: "Germany", currency: "EUR", default_loc: "Berlin, Germany" },
  { code: "SG", name: "Singapore", currency: "SGD", default_loc: "Singapore" },
  { code: "AE", name: "UAE", currency: "AED", default_loc: "Dubai, UAE" },
  { code: "CA", name: "Canada", currency: "CAD", default_loc: "Toronto, Canada" },
  { code: "AU", name: "Australia", currency: "AUD", default_loc: "Sydney, Australia" },
  { code: "GLOBAL", name: "Global", currency: "USD", default_loc: "" },
];

export const T = {
  bg: "#05080F", bg2: "#080C17", bg3: "#0C1322",
  panel: "rgba(8, 12, 23, 0.7)",
  cyan: "#00E5FF", cyanDim: "rgba(0, 229, 255, 0.18)",
  purple: "#A855F7", purpleDim: "rgba(168, 85, 247, 0.20)",
  green: "#00FF88", greenDim: "rgba(0, 255, 136, 0.18)",
  amber: "#FFB800", red: "#FF4D4D",
  text: "#E8F0FF", text2: "#9AAEC6", text3: "#5A6B82", text4: "#3D4F66",
  fieldBg: "rgba(3, 6, 12, 0.85)", fieldText: "#F1F6FF",
  display: `'Syne', sans-serif`, mono: `'JetBrains Mono', monospace`, body: `'Rajdhani', sans-serif`,
};

export function injectFonts() {
  if (document.getElementById("scout-fonts")) return;
  const link = document.createElement("link");
  link.id = "scout-fonts"; link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.innerHTML = `
    *,*::before,*::after{box-sizing:border-box;}
    html,body,#root{margin:0;padding:0;background:${T.bg};}
    body{font-family:${T.body};color:${T.text};}
    ::selection{background:${T.cyan};color:${T.bg};}
    ::-webkit-scrollbar{width:8px;height:8px;}
    ::-webkit-scrollbar-track{background:${T.bg2};}
    ::-webkit-scrollbar-thumb{background:${T.cyanDim};border-radius:4px;}
    input,textarea,select{font-family:${T.body};}
    button{font-family:${T.mono};cursor:pointer;}
    input::placeholder,textarea::placeholder{color:${T.text3};opacity:1;}
    input:focus,textarea:focus,select:focus{outline:none;border-color:${T.cyan}!important;box-shadow:0 0 0 1px ${T.cyanDim},0 0 12px rgba(0,229,255,0.12)!important;}
    a{color:${T.cyan};text-decoration:none;}
    a:hover{text-decoration:underline;}
    @keyframes pulse{0%,100%{opacity:.4;}50%{opacity:1;}}
    @keyframes spin{to{transform:rotate(360deg);}}
    .scout-grid-bg{background-image:linear-gradient(rgba(0,229,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.025) 1px,transparent 1px);background-size:40px 40px;}
  `;
  document.head.appendChild(style);
}
