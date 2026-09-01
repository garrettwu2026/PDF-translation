# Translation quality baseline

`translation-quality-baseline.json` is the provider-neutral regression dataset for translation integrity. Run it with:

```bash
npm run test:quality
```

Each case contains source text, a candidate translation, and the deterministic issue codes that must be detected. Add a sanitized case whenever a production failure reveals a new omission pattern; never add an uploaded user document verbatim.

For model or prompt comparisons, evaluate the same representative samples against this rubric:

1. completeness — no missing or invented propositions;
2. protected content — numbers, URLs, code, footnotes, and link targets survive;
3. terminology — locked terms and character names remain consistent;
4. structure — headings, lists, tables, paragraphs, and code fences remain valid;
5. fluency — natural Traditional Chinese appropriate to the document type;
6. cost and latency — provider usage and end-to-end duration stay within the selected budget.

Deterministic checks are the release gate. Human or model-based fluency scoring may supplement them but must not replace protected-content validation.

