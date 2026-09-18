import { proxyFetch } from "../src/lib/proxyFetch.js";
import { relayAllowed, RELAY_OPT_IN } from "../src/lib/serp.js";

/* The relays see the full URL of everything sent through them, and the first
   one interpolates the target straight into its own path. Both facts make this
   a boundary worth pinning. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};
const refuses = async (url) => {
  try { await proxyFetch(url); return false; } catch (e) { return /Refusing to relay/.test(e.message); }
};

// --- only absolute http(s) may be pasted into a relay's URL -------------------
{
  check("refuses a javascript: target", await refuses("javascript:alert(1)"));
  check("refuses a data: target", await refuses("data:text/html,hi"));
  check("refuses a scheme-relative target", await refuses("//evil.example"));
  check("refuses a relative path", await refuses("../../etc/passwd"));
  check("refuses an empty target", await refuses("") && await refuses(null));
  check("refuses a target containing whitespace", await refuses("https://x.com/a b"));
  check("refuses a target containing a backtick or brace", await refuses("https://x.com/`a`") && await refuses("https://x.com/{a}"));
}

// --- a legitimate target gets past the guard ---------------------------------
{
  // It will fail at the network layer here, which is fine: what matters is that
  // it is not rejected by the guard.
  let msg = "";
  try { await proxyFetch("https://lite.duckduckgo.com/lite/?q=test"); } catch (e) { msg = e.message; }
  check("lets a normal https target through to the network", !/Refusing to relay/.test(msg), msg);
}

// --- the consent gate --------------------------------------------------------
{
  check("the opt-in key is stable", RELAY_OPT_IN === "allow_public_relay");
  check("consent defaults to refused", relayAllowed(() => "") === false);
  check("consent is granted only by an explicit 1", relayAllowed(() => "1") === true && relayAllowed(() => "true") === false);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
