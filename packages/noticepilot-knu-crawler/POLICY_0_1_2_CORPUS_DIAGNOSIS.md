# Policy 0.1.2 corpus diagnosis

Input: observation.3 corpus, 2,059 notices.

The policy.3 run completed and passed chronological integrity, but full JSONL inspection found remaining producer-quality defects:

- 128 auto-confirmed candidates parsed `붙임 1. 2026학년도...`-style attachment numbering as January 20, 2026.
- 282 auto-confirmed candidates had a schedule entirely before their source notice publication date.
- 695 candidates belonged to 325 same-notice, same-date/time duplicate groups with different inferred event types.
- Birth-date and qualification ranges were also reaching the publishable output.

Policy.4 addresses these defects at candidate production time. It does not weaken the ICS exporter's chronology validation. Exact final corpus counts must be measured by rerunning policy.4 against the observation.3 dataset.
