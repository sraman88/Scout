import { T } from "../theme.js";

export function chip(color, small) { return { padding: small ? "3px 8px" : "5px 10px", background: `${color}11`, color, border: `1px solid ${color}44`, borderRadius: 999, fontFamily: T.mono, fontSize: small ? 10 : 11, fontWeight: 600, cursor: "pointer" }; }

export function miniBtn(color) {
  return { padding: "4px 10px", background: "transparent", border: `1px solid ${color}66`, color, fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, borderRadius: 6 };
}
