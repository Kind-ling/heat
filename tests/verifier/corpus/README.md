# Verifier Evaluation Corpus

This directory contains the labeled corpus for evaluating the Kindling Verifier.

## Requirements (per spec)

- Minimum 100 claims per category (Verbatim, Summarized)
- Ground truth transcripts for each
- Two independent annotators per claim
- Inter-rater agreement κ ≥ 0.80

## Directory Structure

```
corpus/
├── verbatim/
│   ├── supported_exact.json      # Verbatim claims that match exactly
│   ├── supported_paraphrase.json # Verbatim claims with minor variation
│   ├── unsupported_drift.json    # Verbatim claims with material drift
│   └── unsupported_no_match.json # Verbatim claims with no source
├── summarized/
│   ├── supported.json            # Summarized claims that match
│   ├── unsupported_drift.json    # Summarized claims with drift
│   └── unsupported_no_match.json # Summarized claims with no source
├── out_of_scope/
│   ├── implicit.json             # Implicit claims (for Phase 2)
│   └── undeclared.json           # Undeclared claims (research)
└── adversarial/
    ├── paraphrase_laundering.json
    ├── near_threshold.json
    └── ambiguous_temporal.json
```

## Claim Format

```json
{
  "id": "verbatim_001",
  "claim": "I said 'I will deliver by Friday'",
  "source": "I'll try to get it done this week",
  "expected_outcome": "unsupported:drift",
  "expected_drift_categories": ["confidence_shift", "temporal_shift"],
  "annotator_1": "supported:paraphrase",
  "annotator_2": "unsupported:drift",
  "adjudicated": "unsupported:drift",
  "notes": "Classic commitment escalation case"
}
```

## Progress

- [ ] Verbatim: 0/100 claims
- [ ] Summarized: 0/100 claims
- [ ] Out of scope: 0/50 claims
- [ ] Adversarial: 0/30 claims
- [ ] Inter-rater agreement: Not calculated

## Contributing

See `LABELING_PROTOCOL.md` for annotation guidelines.
