# Security model

Scout is a **static browser app with no backend**. Everything runs in the
user's browser, and the bundle is public — anyone can read and modify it. So
nothing in JavaScript is a security control. Two things actually protect users,
and both live outside the bundle.

## 1. Firestore rules protect the API keys

Each signed-in user's API keys (Groq, Gemini, GitHub, Apify, Brave) are stored
in `users/{uid}`. [`firestore.rules`](firestore.rules) is the **entire**
boundary stopping one signed-in user reading another's keys:

- `get` only for the owning `uid`; `list` is denied outright, so the set of
  users is not enumerable
- writes are restricted to a known field list with a key-count cap
- every other path in the database is denied explicitly

**Deploy them.** Rules in this file do nothing until they are pushed:

```
firebase deploy --only firestore:rules
```

If the project is still on default test-mode rules, every user's keys are
readable by every other signed-in user. Check before trusting this.

## 2. Content-Security-Policy limits what a compromise can do

The policy is set twice, because the two deploy targets differ:

- **Vercel** — a real header in `vercel.json`, including `frame-ancestors`
- **GitHub Pages** — cannot set headers at all, so a `<meta>` tag in
  `index.html` carries the same policy minus `frame-ancestors`, which meta
  tags ignore

`script-src 'self'` is the load-bearing directive: no inline script and no
remote script, so an injected tag or a compromised CDN cannot execute.
`connect-src` enumerates every host the app legitimately calls.

> **Self-hosting SearXNG?** Your instance's host is not in `connect-src`, so
> the browser will block it and Scout will fall through to the next backend.
> Add your host to the policy in both `vercel.json` and `index.html`.

## 3. What leaves the browser, and where

| Data | Goes to | Notes |
|---|---|---|
| API keys | Only the issuing vendor's API | Always as a request header or that vendor's own auth param. Never through a relay, never to us |
| Role/title searches | Search backend, or the public relays | A relay sees the query text |
| **Queries naming a person** | Only a direct backend | Never a relay unless explicitly opted in — see below |
| Candidate data | Nowhere | Scored in-browser; no analytics, no telemetry |

### The public relays

Keyless search reaches DuckDuckGo and Mojeek through `r.jina.ai`,
`api.allorigins.win` and `api.codetabs.com`. **Those operators see the full URL
of everything sent through them.**

For a role search that is unremarkable. For a lookup naming a private
individual — finding a candidate's CV, checking which platforms they use — it
hands a third party that candidate's name. Under India's DPDP Act and the GDPR
those relays are processors nobody agreed to, so Scout will not use them for
person-keyed lookups unless the user ticks **Allow personal lookups through the
public relays** in Settings. It is off by default, and those lookups use the
configured Brave / SearXNG / Apify backend instead.

The gate is `relayAllowed()` in `src/lib/serp.js`. Any new lookup keyed on a
person must call it.

## 4. What Scout deliberately does not do

- **Never guesses an identity.** A GitHub handle is never inferred from a
  candidate's name, and a job board slug is discarded if the board's owner name
  does not match. Crediting a stranger's work to a candidate is worse than
  showing nothing.
- **Never scrapes LinkedIn directly.** X-ray search asks a search engine for
  pages it already indexed. Scout does not fetch `linkedin.com`.
- **Reads only public, unauthenticated endpoints** — the same pages an
  anonymous visitor sees.

## Reporting

Open a private security advisory on the repository rather than a public issue.
