# S28-2 feed eligibility schemas

This directory defines the immutable input view and per-event decision shape for
S28-2. Policy `noticepilot.feedEligibilityPolicy.v0.2` is approved.

The input view carries temporal validity from the S27-D active projection so that
review-required events are included only when a valid normalized start exists.
It does not define a feed snapshot, subscription URL, token, ordering, or ICS
payload. Corpus iteration belongs to S28-3 and snapshot identity belongs to S28-4.
