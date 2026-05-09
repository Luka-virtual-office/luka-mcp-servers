"""
PDF tools
─────────
read_pdf    — pdf → structured text (pages, metadata)
text_to_pdf — Markdown/plain text → pdf (base64)
"""
from __future__ import annotations

import io
import re
from typing import Any

import pdfplumber
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, inch
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import Flowable

from config import ALLOWED_PDF_MIMES, DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_PAGE_SIZE
from utils.file_utils import encode_b64, load_and_validate, temp_file


# ─────────────────────────────────────────────────────────────────────────────
# read_pdf
# ─────────────────────────────────────────────────────────────────────────────

def read_pdf(
    file_content: str,
    page_range: str | None = None,
) -> dict[str, Any]:
    """
    Extract text and metadata from a PDF (base64-encoded).

    Parameters
    ----------
    file_content : str
        Base64-encoded PDF.
    page_range : str | None
        Optional range like "1-5" or "3" (1-indexed). Default: all pages.

    Returns
    -------
    dict with:
        metadata   — author, title, subject, creator, page_count, etc.
        pages      — list of {page_number, text, word_count}
        plain_text — full concatenated text
        word_count — total
    """
    raw, _ = load_and_validate(file_content, ALLOWED_PDF_MIMES, "PDF file", ".pdf")

    with temp_file(raw, suffix=".pdf") as path:
        with pdfplumber.open(str(path)) as pdf:
            total_pages = len(pdf.pages)

            # Parse page_range
            start_page, end_page = 1, total_pages
            if page_range:
                m = re.match(r"^(\d+)(?:-(\d+))?$", page_range.strip())
                if m:
                    start_page = int(m.group(1))
                    end_page = int(m.group(2)) if m.group(2) else start_page
                    start_page = max(1, min(start_page, total_pages))
                    end_page = max(start_page, min(end_page, total_pages))

            pages_data: list[dict] = []
            plain_parts: list[str] = []

            for page_num in range(start_page, end_page + 1):
                page = pdf.pages[page_num - 1]
                text = page.extract_text() or ""
                text = text.strip()
                word_count = len(text.split()) if text else 0
                pages_data.append({
                    "page_number": page_num,
                    "text": text,
                    "word_count": word_count,
                    "width": float(page.width),
                    "height": float(page.height),
                })
                if text:
                    plain_parts.append(text)

            plain_text = "\n\n".join(plain_parts)
            meta = pdf.metadata or {}

    return {
        "metadata": {
            "page_count": total_pages,
            "title": meta.get("Title", ""),
            "author": meta.get("Author", ""),
            "subject": meta.get("Subject", ""),
            "creator": meta.get("Creator", ""),
            "producer": meta.get("Producer", ""),
            "creation_date": meta.get("CreationDate", ""),
        },
        "pages": pages_data,
        "plain_text": plain_text,
        "word_count": len(plain_text.split()),
        "pages_read": len(pages_data),
        "total_pages": total_pages,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Markdown parser → ReportLab flowables
# ─────────────────────────────────────────────────────────────────────────────

PAGE_SIZES = {"A4": A4, "LETTER": LETTER}

LUKA_BLUE = colors.HexColor("#2347E8")
LUKA_LIGHT = colors.HexColor("#EEF2FF")
TEXT_DARK = colors.HexColor("#1A1A2E")
CODE_BG = colors.HexColor("#F4F4F8")
QUOTE_BG = colors.HexColor("#F0F4FF")


def _build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    font = DEFAULT_FONT

    def s(name, parent="Normal", **kwargs) -> ParagraphStyle:
        return ParagraphStyle(name, parent=base[parent], fontName=font, **kwargs)

    return {
        "normal":    s("luka_normal",    fontSize=DEFAULT_FONT_SIZE, leading=16, textColor=TEXT_DARK, spaceAfter=6),
        "h1":        s("luka_h1",        fontSize=22, leading=28, textColor=LUKA_BLUE, fontName=font+"-Bold" if "Helvetica" in font else font, spaceBefore=18, spaceAfter=8, bold=1),
        "h2":        s("luka_h2",        fontSize=16, leading=22, textColor=LUKA_BLUE, spaceBefore=14, spaceAfter=6, bold=1),
        "h3":        s("luka_h3",        fontSize=13, leading=18, textColor=TEXT_DARK, spaceBefore=10, spaceAfter=4, bold=1),
        "h4":        s("luka_h4",        fontSize=11, leading=16, textColor=TEXT_DARK, spaceBefore=8, spaceAfter=3, bold=1),
        "title":     ParagraphStyle("luka_title", fontSize=26, leading=32, textColor=LUKA_BLUE, alignment=TA_CENTER, spaceAfter=16, fontName=font),
        "bullet":    s("luka_bullet",    fontSize=DEFAULT_FONT_SIZE, leading=16, leftIndent=20, bulletIndent=8, spaceAfter=3),
        "numbered":  s("luka_numbered",  fontSize=DEFAULT_FONT_SIZE, leading=16, leftIndent=20, spaceAfter=3),
        "code":      ParagraphStyle("luka_code", fontName="Courier", fontSize=9, leading=13, leftIndent=12, rightIndent=12, backColor=CODE_BG, borderColor=colors.HexColor("#D0D5F0"), borderWidth=0.5, borderPadding=6, spaceAfter=8),
        "quote":     s("luka_quote",     fontSize=DEFAULT_FONT_SIZE, leading=16, leftIndent=20, rightIndent=10, textColor=colors.HexColor("#4A5568"), backColor=QUOTE_BG, borderColor=LUKA_BLUE, borderWidth=2, borderPadding=8, spaceAfter=8),
    }


def _md_to_html_inline(text: str) -> str:
    """Convert inline Markdown markers to ReportLab XML tags."""
    # Bold-italic
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", text)
    # Bold
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Italic
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    # Code
    text = re.sub(r"`(.+?)`", r'<font name="Courier" size="9">\1</font>', text)
    return text


def _md_to_flowables(content: str, styles: dict) -> list:
    """Parse Markdown content into a list of ReportLab flowables."""
    flowables = []
    lines = content.splitlines()
    i = 0
    in_code = False
    code_buf: list[str] = []
    bullet_buf: list[str] = []
    numbered_buf: list[str] = []

    def flush_lists():
        nonlocal bullet_buf, numbered_buf
        if bullet_buf:
            items = [ListItem(Paragraph(_md_to_html_inline(t), styles["bullet"]), bulletColor=LUKA_BLUE) for t in bullet_buf]
            flowables.append(ListFlowable(items, bulletType="bullet", bulletColor=LUKA_BLUE, leftIndent=12))
            flowables.append(Spacer(1, 4))
            bullet_buf = []
        if numbered_buf:
            items = [ListItem(Paragraph(_md_to_html_inline(t), styles["numbered"])) for t in numbered_buf]
            flowables.append(ListFlowable(items, bulletType="1", leftIndent=12))
            flowables.append(Spacer(1, 4))
            numbered_buf = []

    while i < len(lines):
        line = lines[i]

        # Code block
        if line.strip().startswith("```"):
            flush_lists()
            if not in_code:
                in_code = True
                code_buf = []
            else:
                in_code = False
                code_text = "\n".join(code_buf)
                flowables.append(Paragraph(code_text.replace("\n", "<br/>"), styles["code"]))
                code_buf = []
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # Horizontal rule
        if re.match(r"^-{3,}$|^\*{3,}$|^_{3,}$", line.strip()):
            flush_lists()
            flowables.append(HRFlowable(width="100%", thickness=1, color=LUKA_LIGHT, spaceAfter=8))
            i += 1
            continue

        # Headings
        hm = re.match(r"^(#{1,4})\s+(.+)", line)
        if hm:
            flush_lists()
            level = len(hm.group(1))
            key = f"h{level}" if level <= 4 else "h4"
            text = _md_to_html_inline(hm.group(2).strip())
            flowables.append(Paragraph(text, styles[key]))
            i += 1
            continue

        # Blockquote
        if line.startswith("> "):
            flush_lists()
            text = _md_to_html_inline(line[2:])
            flowables.append(Paragraph(text, styles["quote"]))
            i += 1
            continue

        # Pipe table
        if "|" in line and line.strip().startswith("|"):
            flush_lists()
            table_lines = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip().startswith("|"):
                if not re.match(r"^\|[-| :]+\|$", lines[i].strip()):
                    table_lines.append(lines[i])
                i += 1
            if table_lines:
                rows = [
                    [cell.strip() for cell in row.strip().strip("|").split("|")]
                    for row in table_lines
                ]
                num_cols = max(len(r) for r in rows)
                # Pad rows
                rows = [r + [""] * (num_cols - len(r)) for r in rows]
                # Convert to Paragraphs
                pdf_rows = []
                for r_idx, row in enumerate(rows):
                    pdf_row = []
                    for cell in row:
                        st = styles["normal"]
                        p = Paragraph(_md_to_html_inline(cell), st)
                        pdf_row.append(p)
                    pdf_rows.append(pdf_row)
                col_width = (16 * cm) / num_cols
                t = Table(pdf_rows, colWidths=[col_width] * num_cols)
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), LUKA_BLUE),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), DEFAULT_FONT),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D0D5F0")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LUKA_LIGHT]),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ]))
                flowables.append(t)
                flowables.append(Spacer(1, 8))
            continue

        # Bullet list
        bm = re.match(r"^(\s*)[*\-]\s+(.+)", line)
        if bm:
            if numbered_buf:
                flush_lists()
            bullet_buf.append(bm.group(2))
            i += 1
            continue

        # Numbered list
        nm = re.match(r"^(\s*)\d+\.\s+(.+)", line)
        if nm:
            if bullet_buf:
                flush_lists()
            numbered_buf.append(nm.group(2))
            i += 1
            continue

        # Flush any pending lists before normal paragraph
        flush_lists()

        # Empty line
        if not line.strip():
            flowables.append(Spacer(1, 6))
            i += 1
            continue

        # Normal paragraph
        text = _md_to_html_inline(line)
        flowables.append(Paragraph(text, styles["normal"]))
        i += 1

    flush_lists()
    return flowables


# ─────────────────────────────────────────────────────────────────────────────
# text_to_pdf
# ─────────────────────────────────────────────────────────────────────────────

def text_to_pdf(
    content: str,
    title: str | None = None,
    author: str | None = None,
    page_size: str = DEFAULT_PAGE_SIZE,
) -> dict[str, str]:
    """
    Convert Markdown (or plain text) to a styled PDF (base64).

    Supported Markdown: same as text_to_docx — headings, bold/italic,
    bullet/numbered lists, tables, code blocks, blockquotes, HR.

    Parameters
    ----------
    content : str
        Markdown or plain text.
    title : str | None
        Document title displayed at the top + PDF metadata.
    author : str | None
        Written to PDF metadata.
    page_size : str
        "A4" (default) or "LETTER".

    Returns
    -------
    {"file_content": "<base64>", "mime_type": "application/pdf", "size_bytes": N}
    """
    psize = PAGE_SIZES.get(page_size.upper(), A4)
    styles = _build_styles()
    buf = io.BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=psize,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2 * cm,
        title=title or "",
        author=author or "",
    )

    flowables = []

    # Title block
    if title:
        flowables.append(Paragraph(title, styles["title"]))
        if author:
            author_style = ParagraphStyle(
                "author", fontSize=10, textColor=colors.HexColor("#6B7280"),
                alignment=TA_CENTER, spaceAfter=20,
            )
            flowables.append(Paragraph(f"by {author}", author_style))
        flowables.append(HRFlowable(width="100%", thickness=1.5, color=LUKA_BLUE, spaceAfter=16))

    flowables.extend(_md_to_flowables(content, styles))

    doc.build(flowables)
    raw = buf.getvalue()

    return {
        "file_content": encode_b64(raw),
        "mime_type": "application/pdf",
        "size_bytes": len(raw),
    }
