# 0009. P1 owns the Jev work

Status: accepted (2026-11-14). Supersedes the Jev part of 0008.

## Context

The plan gave Jev parse and Jev votes to P3, beside the whole app. The team chose to move the Jev
work to P1. The rule "one folder per person" needs a home for that code outside P3's `app/`.

## Decision

- P1 owns the Jev work: the parse (text to `JevParse`), the votes (`JevVote`) and plan B (a
  general LLM with the same typed answers), in a new folder `jev/`.
- P3 keeps the screens: the text box, the "Did you mean" buttons, the vote bubbles, phones and
  voice.
- Plan C (keyword parser and buttons) has no owner yet (item G in docs/plan-graph.html).
- The calls still run through the local server in `app/server/` (ADR 0008), because keys must
  stay out of the browser. P3 owns the server; P1 owns `jev/`.
- The seam: `jev/` exports `parse(request)` and `vote(request)` and reads its own keys from
  `process.env`. P3's server only calls those two functions, so a Jev change never needs a server
  edit. Browser code (`app/main.ts`, `viewer/`, `design/`) never imports `jev/`.
- The 13:00 and 17:30 Jev go/no-go calls are P1's.

## Consequences

P1 carries more work (see the bottleneck callout in docs/plan-graph.html). The contract shapes
do not change. If P1 is overloaded at 17:00, the team can hand `jev/` to P3 with a new ADR.
