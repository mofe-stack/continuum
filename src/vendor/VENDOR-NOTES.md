# Vendored libraries

This folder contains third-party open-source libraries, minified by their authors.

| File | Library | Version | Source |
|------|---------|---------|--------|
| `fflate.min.js` | fflate | 0.8.3 | https://github.com/101arrowz/fflate |
| `jspdf.umd.min.js` | jsPDF | 4.2.1 | https://github.com/parallax/jsPDF |

- **`fflate.min.js`** — included **unmodified**, exactly as published by its author.

- **`jspdf.umd.min.js`** — the official jsPDF 4.2.1 UMD build with **one modification**:

  jsPDF's `output("pdfobjectnewwindow")` mode injected a `<script>` tag that loaded
  `pdfobject.min.js` from `https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js`.
  That is remotely-hosted code, which is disallowed by Chrome Manifest V3 and by AMO.

  The `case "pdfobjectnewwindow":` body was replaced with a `throw` (search the file for
  `CONTINUUM PATCH` to find the exact spot). No `<script>` is created and no remote URL is
  referenced anywhere in the file anymore.

  This output mode is **never used** by the extension — Continuum only calls
  `output("blob")` (see `src/core/pdf-export.js`). No other part of jsPDF was changed.

To verify: diff `jspdf.umd.min.js` against the official 4.2.1 release; the only difference is
the `pdfobjectnewwindow` case described above.
