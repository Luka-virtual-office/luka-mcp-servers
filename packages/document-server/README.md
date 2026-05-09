# MCP Document Server

Production-ready Python server exposing 6 document-manipulation tools for the LUKA Virtual Office agent platform. Agents can read Excel, Word, and PDF files, and generate formatted documents — all via base64-encoded file transfer with no filesystem access needed by the caller.

## Tools

| Tool | Description |
|------|-------------|
| `read_excel` | Parse xlsx/xls → structured JSON (sheets, headers, rows) |
| `read_docx` | Extract text & structure from .docx |
| `read_pdf` | Extract text, metadata & page content from PDF |
| `text_to_pdf` | Markdown → styled PDF (base64) |
| `text_to_docx` | Markdown → Word document (base64) |
| `data_to_excel` | JSON data / list of lists → formatted xlsx (base64) |

## Quick Start

```bash
# 1. Clone / enter the directory
cd mcp-document-server

# 2. Create virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure
cp .env.example .env
# Edit .env as needed (defaults work out of the box)

# 5. Run
python server.py
# → Server listening on http://localhost:8100
```

## Docker

```bash
# Build
docker build -t mcp-document-server .

# Run
docker run -p 8100:8100 --env-file .env mcp-document-server

# With API key
docker run -p 8100:8100 -e API_KEY=my-secret-key mcp-document-server
```

## API Reference

### POST `/invoke` — LUKA-compatible endpoint

Used by the LUKA edge function to call tools.

```json
// Request
{
  "tool": "text_to_pdf",
  "input": {
    "content": "# Report\n\nThis is the body.",
    "title": "Monthly Report",
    "author": "Geri"
  }
}

// Response
{
  "result": {
    "file_content": "<base64-encoded PDF>",
    "mime_type": "application/pdf",
    "size_bytes": 14823
  },
  "tool": "text_to_pdf",
  "duration_ms": 142.3
}
```

### GET `/sse` — MCP SSE transport

Standard MCP protocol for Claude Desktop and other MCP clients.

```json
// Claude Desktop config (~/.claude/claude_desktop_config.json)
{
  "mcpServers": {
    "documents": {
      "url": "http://localhost:8100/sse"
    }
  }
}
```

### GET `/health` — Liveness probe

```json
{"status": "ok", "server": "mcp-document-server", "version": "1.0.0"}
```

### GET `/tools` — Tool introspection

Returns all tool schemas (names, descriptions, parameter types).

### Swagger UI

Interactive API docs available at `http://localhost:8100/docs`.

## Tool Reference

### `read_excel`

```json
{
  "tool": "read_excel",
  "input": {
    "file_content": "<base64 xlsx>",
    "sheet_name": "Sheet1"   // optional — omit to read all sheets
  }
}
```

**Response:**
```json
{
  "sheet_count": 2,
  "sheets": [
    {
      "sheet_name": "Sheet1",
      "headers": ["Name", "Revenue", "Region"],
      "row_count": 42,
      "column_count": 3,
      "rows": [["Alice", "5000", "LATAM"], ...]
    }
  ],
  "summary": {"total_sheets": 2, "total_data_rows": 84, "total_cells": 252}
}
```

---

### `read_docx`

```json
{"tool": "read_docx", "input": {"file_content": "<base64 docx>"}}
```

**Response:**
```json
{
  "sections": [
    {"type": "heading", "level": 1, "text": "Introduction"},
    {"type": "paragraph", "text": "..."}
  ],
  "tables": [{"headers": ["Col1", "Col2"], "rows": [["a", "b"]]}],
  "word_count": 523,
  "char_count": 3210,
  "plain_text": "...",
  "section_count": 12,
  "table_count": 1
}
```

---

### `read_pdf`

```json
{
  "tool": "read_pdf",
  "input": {
    "file_content": "<base64 pdf>",
    "page_range": "1-5"   // optional
  }
}
```

**Response:**
```json
{
  "metadata": {"page_count": 8, "title": "Annual Report", "author": "LUKA"},
  "pages": [{"page_number": 1, "text": "...", "word_count": 213}],
  "plain_text": "...",
  "word_count": 1820,
  "pages_read": 5,
  "total_pages": 8
}
```

---

### `text_to_pdf`

```json
{
  "tool": "text_to_pdf",
  "input": {
    "content": "# Title\n\nParagraph with **bold** text.\n\n- Bullet\n\n| A | B |\n|---|---|\n| 1 | 2 |",
    "title": "My Document",
    "author": "LUKA",
    "page_size": "A4"   // A4 | LETTER
  }
}
```

**Response:**
```json
{
  "file_content": "<base64 PDF>",
  "mime_type": "application/pdf",
  "size_bytes": 18450
}
```

---

### `text_to_docx`

Same as `text_to_pdf` but returns a Word document.

```json
{
  "tool": "text_to_docx",
  "input": {"content": "# Heading\n\nBody.", "title": "Doc", "author": "Brian"}
}
```

---

### `data_to_excel`

```json
{
  "tool": "data_to_excel",
  "input": {
    "data": [
      {"Product": "Widget A", "Q1": 100, "Q2": 120},
      {"Product": "Widget B", "Q1": 200, "Q2": 250}
    ],
    "sheet_name": "Sales",
    "title": "Q1/Q2 Sales Report",
    "format_as_table": true
  }
}
```

**Response:**
```json
{
  "file_content": "<base64 xlsx>",
  "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "row_count": 2,
  "column_count": 3,
  "size_bytes": 6821
}
```

## Supported Markdown

| Syntax | Rendered as |
|--------|-------------|
| `# H1` `## H2` `### H3` `#### H4` | Headings |
| `**bold**` `*italic*` `***bold-italic***` | Inline formatting |
| `` `code` `` | Inline code |
| `- item` or `* item` | Bullet list |
| `1. item` | Numbered list |
| `\| col \| col \|` | Table |
| `> text` | Blockquote |
| ` ``` ` block ` ``` ` | Code block |
| `---` | Horizontal rule |

## Security

- **File size limit:** 50 MB (configurable via `MAX_FILE_SIZE_MB`)
- **MIME type validation:** Uses `libmagic` (not file extension) to detect real file type
- **Path traversal:** No file paths accepted from callers — all content is base64 in JSON body
- **Temp files:** Written to `/tmp/mcp-docs` and deleted immediately after processing
- **Non-root Docker:** Container runs as `mcpuser` (no root)
- **API key:** Optional Bearer token auth on `/invoke` (set `API_KEY` env var)

## Running Tests

```bash
cd mcp-document-server
pip install pytest httpx
pytest tests/ -v
```

## Registering in LUKA

After deployment, register in Supabase:

```sql
INSERT INTO mcp_servers (name, url, description, tools, is_active)
VALUES (
  'document-server',
  'http://your-server:8100',
  'Read and write Excel, Word, and PDF documents',
  ARRAY['read_excel','read_docx','read_pdf','text_to_pdf','text_to_docx','data_to_excel'],
  true
);
```

Then add to the edge function's `toolServerMap`:

```typescript
const toolServerMap: Record<string, string> = {
  // ... existing tools ...
  read_excel:    'http://your-server:8100',
  read_docx:     'http://your-server:8100',
  read_pdf:      'http://your-server:8100',
  text_to_pdf:   'http://your-server:8100',
  text_to_docx:  'http://your-server:8100',
  data_to_excel: 'http://your-server:8100',
}
```

## Architecture

```
mcp-document-server/
├── server.py          # FastAPI app — /invoke, /sse, /health, /tools
├── config.py          # Settings from environment variables
├── tools/
│   ├── excel_tools.py # read_excel, data_to_excel
│   ├── docx_tools.py  # read_docx, text_to_docx
│   └── pdf_tools.py   # read_pdf, text_to_pdf
├── utils/
│   └── file_utils.py  # base64 I/O, MIME check, size check, temp files
├── tests/
│   └── test_tools.py  # pytest suite (37 tests)
├── requirements.txt
├── Dockerfile
└── .env.example
```
