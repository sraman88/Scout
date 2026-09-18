import { searchWeb, availableBackends, parseDdgLite, parseMojeek, unwrapDdg, keylessSearch, RELAY_OPT_IN } from "../src/lib/serp.js";

/* The point of this layer is that no single vendor can take search down. So the
   tests are mostly about failure: what happens when a backend errors, returns
   nothing, or isn't configured at all. */

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && detail !== undefined) console.log("      got:", JSON.stringify(detail));
};
const reader = (cfg) => (k) => cfg[k] || "";

// --- backend selection -------------------------------------------------------
{
  check("keyless is available for ordinary searches", availableBackends(reader({})).map((b) => b.id).join() === "keyless");
  check("the opt-in key is named once and exported", RELAY_OPT_IN === "allow_public_relay");
  check("a Brave key takes priority", availableBackends(reader({ brave_key: "x" }))[0].id === "brave");
  check("SearXNG outranks keyless", availableBackends(reader({ searxng_url: "http://s" })).map((b) => b.id).join() === "searxng,keyless");
  // Apify last on purpose: it still works, but nothing depends on it.
  check("Apify sorts last", availableBackends(reader({ apify: "t", brave_key: "b" })).map((b) => b.id).join() === "brave,keyless,apify");
}

// --- fallthrough -------------------------------------------------------------
{
  const rows = [{ url: "https://a.com", title: "A", snippet: "" }];
  const boom = () => { throw new Error("backend down"); };

  const ok = await searchWeb("q", { read: reader({ brave_key: "k" }), impls: { brave: async () => rows } });
  check("uses the best configured backend", ok.via === "brave" && ok.rows.length === 1, ok);

  const fell = await searchWeb("q", { read: reader({ brave_key: "k" }), impls: { brave: boom, keyless: async () => rows } });
  check("falls through to the next backend on error", fell.via === "keyless" && fell.rows.length === 1, fell);
  check("...and reports what it tried", fell.tried[0].error === "backend down" && fell.tried[0].id === "brave", fell.tried);

  const empty = await searchWeb("q", { read: reader({ brave_key: "k" }), impls: { brave: async () => [], keyless: async () => rows } });
  check("an empty backend also falls through", empty.via === "keyless", empty);

  // Everything empty is a real answer. Everything broken is not.
  const allEmpty = await searchWeb("q", { read: reader({}), impls: { keyless: async () => [] } });
  check("all backends empty returns an empty answer", allEmpty.rows.length === 0 && allEmpty.via === null, allEmpty);

  let threw = null;
  try { await searchWeb("q", { read: reader({}), impls: { keyless: boom } }); } catch (e) { threw = e; }
  check("all backends broken throws rather than reporting 'no results'", /backend down/.test(threw?.message || ""), threw?.message);

  check("an empty query costs nothing", (await searchWeb("  ", { read: reader({}) })).rows.length === 0);
}

// --- personal data must not reach the public relays by default ---------------
{
  /* The keyless tier goes through r.jina.ai / allorigins / codetabs, so the
     query text is visible to those operators. A query naming a candidate is
     personal data, and handing it to an unvetted third party is exactly what
     this guard exists to stop. */
  const plain = availableBackends(reader({})).map((b) => b.id);
  const sensitive = availableBackends(reader({}), { sensitive: true }).map((b) => b.id);
  check("a role search may use the public relays", plain.includes("keyless"));
  check("a search naming a person may not", !sensitive.includes("keyless"), sensitive);

  const optedIn = availableBackends(reader({ allow_public_relay: "1" }), { sensitive: true }).map((b) => b.id);
  check("...unless the user opted in", optedIn.includes("keyless"), optedIn);

  const withBackend = availableBackends(reader({ brave_key: "k" }), { sensitive: true }).map((b) => b.id);
  check("a real backend serves sensitive searches without any relay", withBackend.join() === "brave", withBackend);

  // Silently returning nothing would read as "this candidate has no CV".
  let blocked = null;
  try { await searchWeb("\"Asha Rao\" resume", { read: reader({}), sensitive: true }); } catch (e) { blocked = e; }
  check("blocked sensitive search explains itself", /won't send it through the public relays/.test(blocked?.message || ""), blocked?.message);
  check("...and names the ways to fix it", /Brave|SearXNG|Apify/.test(blocked?.message || ""), blocked?.message);

  const ok = await searchWeb("q", { read: reader({ apify: "t" }), sensitive: true, impls: { apify: async () => [{ url: "https://a.com" }] } });
  check("a sensitive search still runs on a contracted backend", ok.via === "apify", ok);
}

// --- normalisation -----------------------------------------------------------
{
  const dupes = [{ url: "https://a.com", title: "A" }, { url: "https://a.com", title: "again" }, { url: "", title: "none" }];
  const out = await searchWeb("q", { read: reader({}), impls: { keyless: async () => dupes } });
  check("deduplicates by url and drops empties", out.rows.length === 1, out.rows);
  check("honours the count", (await searchWeb("q", { count: 2, read: reader({}), impls: { keyless: async () => [{ url: "1" }, { url: "2" }, { url: "3" }] } })).rows.length === 2);
}

// --- engine parsers ----------------------------------------------------------
{
  const ddg = `1.[Asha Rao - HR Business Partner - Freshworks | LinkedIn](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fin.linkedin.com%2Fin%2Fasharao)
Bengaluru, India. HR Business Partner at Freshworks.

2.[Ravi Kumar | LinkedIn](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fin.linkedin.com%2Fin%2Fravikumar)
Talent acquisition lead.`;
  const rows = parseDdgLite(ddg);
  check("parses DuckDuckGo Lite results", rows.length === 2, rows);
  check("unwraps the DDG redirect", rows[0].url === "https://in.linkedin.com/in/asharao", rows[0].url);
  check("keeps the snippet", /Bengaluru/.test(rows[0].snippet), rows[0]);
  check("tags the engine", rows.every((r) => r.via === "ddg"));
  check("unwrapDdg passes a plain url through", unwrapDdg("https://x.com/a") === "https://x.com/a");
  check("unwrapDdg survives junk", unwrapDdg("not a url") === "");

  const mojeek = `Results
[Asha Rao - Freshworks | LinkedIn](https://in.linkedin.com/in/asharao)
[Next page](https://www.mojeek.com/search?q=test&s=10)
[Mojeek](https://www.mojeek.com/)`;
  const mrows = parseMojeek(mojeek);
  check("parses Mojeek results", mrows.length === 1, mrows);
  check("drops the engine's own navigation links", mrows[0].url === "https://in.linkedin.com/in/asharao", mrows);
  check("empty input parses to nothing", parseDdgLite("").length === 0 && parseMojeek("").length === 0 && parseDdgLite(null).length === 0);
}

// --- keyless runs both engines and survives one dying ------------------------
{
  const fetchText = async (url) => {
    if (url.includes("duckduckgo")) return `1.[A](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fa.com)\nsnippet`;
    throw new Error("mojeek blocked");
  };
  const rows = await keylessSearch("q", { fetchText });
  check("one dead engine does not sink the other", rows.length === 1 && rows[0].url === "https://a.com", rows);

  const bothDead = await keylessSearch("q", { fetchText: async () => { throw new Error("proxy down"); } });
  check("both engines dead returns empty rather than throwing", bothDead.length === 0);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
