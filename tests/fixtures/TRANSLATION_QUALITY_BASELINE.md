# Translation quality baseline

`translation-quality-baseline.json` is the provider-neutral regression dataset for translation integrity. Run it with:

```bash
npm run test:quality
```

Each case contains source text, a candidate translation, optional document-type/glossary context, and the deterministic issue codes that must be detected. The baseline covers general, novel, technical, academic, and business/legal risks; sentence-risk tests additionally cover selective semantic review behavior. Add a sanitized case whenever a production failure reveals a new omission pattern; never add an uploaded user document verbatim.

For model or prompt comparisons, evaluate the same representative samples against this rubric:

1. completeness — no missing or invented propositions;
2. protected content — numbers, units, URLs, code, footnotes, and link targets survive;
3. terminology — locked terms and character names remain consistent;
4. structure — headings, lists, tables, paragraphs, and code fences remain valid;
5. semantic fidelity — negation, conditions, causality, actors, and obligations retain their meaning;
6. fluency — natural Traditional Chinese appropriate to the document type;
7. cost and latency — provider usage and end-to-end duration stay within the selected budget.

Deterministic checks are the release gate. Human or model-based fluency scoring may supplement them but must not replace protected-content validation.

