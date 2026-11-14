# Decision 0047: Agent Report Asks The Agent To Weigh Feedback

## Status

Accepted

## Decision

The exported review prompt asks the receiving agent to weigh the reviewer's
feedback, not apply it mechanically:

- The agent checks every request, the overall notes included, against the code.
  When a change doesn't make sense for the implementation (it would introduce a
  bug, break behavior or a contract other code relies on, or rests on a misreading
  of the code), the agent doesn't make it and explains why. It may describe a
  better alternative but doesn't implement it unless the reviewer asked for it.
- Disagreeing on style or approach is not a reason to decline. The agent follows
  the reviewer's preference and can raise its concern in the recap. Going against
  the project's conventions is not a decline reason either, because a reviewer may
  break a convention on purpose.
- When the agent can ask the user, it raises the changes it would decline in the
  same message as its open questions, before finishing. Otherwise it reports them
  as declined.
- An item that only asks a question is answered without edits. An item that asks a
  question and also requests a change gets the change, if it holds up, and then the
  answer.
- The report ends with a recap. Each numbered item is addressed, answered, declined
  and why, or unresolved and why, and the overall notes recap names any part the
  agent declined.

## Context

Decision 0040 shaped the report around the reviewed change and its three scopes.
Its instructions told the agent to apply the reviewer's intent whenever it was
reasonably clear, so a clear but wrong request was still applied. Comments that
mixed a question with a change request had no rule, and the report had no outcome
for work the agent chose not to do.

## Consequences

Positive:

- Reviewer mistakes surface in the agent's report instead of landing in the code.
- The recap shows what was deliberately left undone, so the reviewer can follow up.

Negative:

- An agent can decline a change the reviewer really wanted. The reviewer sees that
  in the recap and has to restate the request.
- The report text changed again; anything that matched the previous instruction
  lines has to be updated.
