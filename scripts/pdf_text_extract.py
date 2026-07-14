import json
import sys

import pdfplumber

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        raise SystemExit("uso: pdf_text_extract.py arquivo.pdf [max_paginas]")

    pdf_path = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 60

    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        for index, page in enumerate(pdf.pages[:max_pages], start=1):
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            pages.append({"number": index, "text": text})

    print(
        json.dumps(
            {
                "path": pdf_path,
                "pageCount": total_pages,
                "pagesRead": len(pages),
                "pages": pages,
                "text": "\n\n".join(page["text"] for page in pages),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
