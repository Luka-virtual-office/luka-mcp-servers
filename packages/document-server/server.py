"""
MCP Document Server
═══════════════════
FastAPI server that exposes 6 document-manipulation tools via two transports:

  1. POST /invoke  — LUKA-compatible REST endpoint
                     Body: {"tool": "<name>", "input": {...}}
                     Used by the LUKA Supabase edge function.

  2. GET  /sse     — Standard MCP SSE transport (for MCP clients / Claude Desktop)

  3. GET  /health  — Liveness probe
  4. GET  /tools   — Returns JSON schema of all tools (for introspection)

Tools
─────
  read_excel     xlsx/xls → structured JSON
  read_docx      .docx → structured JSON
  read_pdf       PDF → structured JSON
  text_to_pdf    Markdown → PDF (base64)
  text_to_docx   Markdown → DOCX (base64)
  data_to_excel  JSON data → XLSX (base64)
"""
from __future__ import annotations

import logging
import time
import traceback
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

import config
from tools.excel_tools import data_to_excel, read_excel
from tools.docx_tools import read_docx, text_to_docx
from tools.pdf_tools import read_pdf, text_to_pdf
from utils.file_utils import FileSizeError, MimeTypeError

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
log = logging.getLogger("mcp-docs")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="MCP Document Server",
    description="Document read/write tools for the LUKA Virtual Office agent platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Optional API-key auth ─────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)


def verify_key(credentials: HTTPAuthorizationCredentials | None = Security(security)):
    if config.API_KEY:
        if not credentials or credentials.credentials != config.API_KEY:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")


# ── Tool registry ─────────────────────────────────────────────────────────────

TOOL_SCHEMAS: dict[str, dict] = {
    "read_excel": {
        "description": "Read an Excel file (xlsx/xls) and return structured data (sheets, headers, rows).",
        "parameters": {
            "file_content": {"type": "string", "description": "Base64-encoded Excel file"},
            "sheet_name": {"type": "string", "description": "Sheet to read (default: all sheets)", "optional": True},
        },
    },
    "read_docx": {
        "description": "Extract text and structure from a Word document (.docx).",
        "parameters": {
            "file_content": {"type": "string", "description": "Base64-encoded .docx file"},
        },
    },
    "read_pdf": {
        "description": "Extract text, metadata and page content from a PDF.",
        "parameters": {
            "file_content": {"type": "string", "description": "Base64-encoded PDF"},
            "page_range": {"type": "string", "description": "Page range e.g. '1-5' or '3' (optional)", "optional": True},
        },
    },
    "text_to_pdf": {
        "description": "Convert Markdown or plain text to a styled PDF. Returns base64-encoded PDF.",
        "parameters": {
            "content": {"type": "string", "description": "Markdown or plain text content"},
            "title": {"type": "string", "description": "Document title (optional)", "optional": True},
            "author": {"type": "string", "description": "Author name (optional)", "optional": True},
            "page_size": {"type": "string", "description": "'A4' (default) or 'LETTER'", "optional": True},
        },
    },
    "text_to_docx": {
        "description": "Convert Markdown or plain text to a Word document (.docx). Returns base64-encoded docx.",
        "parameters": {
            "content": {"type": "string", "description": "Markdown or plain text content"},
            "title": {"type": "string", "description": "Document title (optional)", "optional": True},
            "author": {"type": "string", "description": "Author name (optional)", "optional": True},
        },
    },
    "data_to_excel": {
        "description": "Convert a list of dicts or list of lists to a formatted Excel file. Returns base64-encoded xlsx.",
        "parameters": {
            "data": {"type": "array", "description": "List of dicts or list of lists (first row = headers)"},
            "sheet_name": {"type": "string", "description": "Worksheet name (default: Sheet1)", "optional": True},
            "title": {"type": "string", "description": "Optional bold title at top of sheet", "optional": True},
            "include_headers": {"type": "boolean", "description": "Write column headers (default: true)", "optional": True},
            "format_as_table": {"type": "boolean", "description": "Apply table styling (default: true)", "optional": True},
        },
    },
}

TOOL_FUNCTIONS: dict[str, Any] = {
    "read_excel":   read_excel,
    "read_docx":    read_docx,
    "read_pdf":     read_pdf,
    "text_to_pdf":  text_to_pdf,
    "text_to_docx": text_to_docx,
    "data_to_excel": data_to_excel,
}


# ── Request / response models ─────────────────────────────────────────────────

class InvokeRequest(BaseModel):
    tool: str = Field(..., description="Tool name to invoke")
    input: dict[str, Any] = Field(default_factory=dict, description="Tool parameters")


class InvokeResponse(BaseModel):
    result: Any
    tool: str
    duration_ms: float


class ErrorResponse(BaseModel):
    error: str
    tool: str | None = None
    detail: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Liveness / readiness probe."""
    return {"status": "ok", "server": "mcp-document-server", "version": "1.0.0"}


@app.get("/tools")
async def list_tools():
    """Return all tool names and their parameter schemas."""
    return {"tools": TOOL_SCHEMAS}


@app.post("/invoke", response_model=InvokeResponse)
async def invoke(
    request: InvokeRequest,
    _: None = Security(verify_key),
):
    """
    LUKA-compatible tool invocation endpoint.

    Matches the pattern expected by the edge function:
        POST /invoke
        {"tool": "read_pdf", "input": {"file_content": "<b64>", ...}}

    Returns:
        {"result": <tool output>, "tool": "<name>", "duration_ms": N}
    """
    tool_name = request.tool
    if tool_name not in TOOL_FUNCTIONS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown tool '{tool_name}'. Available: {list(TOOL_FUNCTIONS.keys())}",
        )

    fn = TOOL_FUNCTIONS[tool_name]
    params = request.input

    log.info("▶  %s  params=%s", tool_name, {k: ("..." if "content" in k else v) for k, v in params.items()})
    t0 = time.perf_counter()

    try:
        result = fn(**params)
    except FileSizeError as exc:
        log.warning("✗  %s  size error: %s", tool_name, exc)
        raise HTTPException(status_code=413, detail=str(exc))
    except MimeTypeError as exc:
        log.warning("✗  %s  mime error: %s", tool_name, exc)
        raise HTTPException(status_code=415, detail=str(exc))
    except TypeError as exc:
        log.warning("✗  %s  param error: %s", tool_name, exc)
        raise HTTPException(status_code=422, detail=f"Invalid parameters: {exc}")
    except Exception as exc:
        log.error("✗  %s  unexpected error: %s\n%s", tool_name, exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Tool execution failed: {exc}")

    duration_ms = (time.perf_counter() - t0) * 1000
    log.info("✓  %s  %.0f ms", tool_name, duration_ms)

    return InvokeResponse(result=result, tool=tool_name, duration_ms=round(duration_ms, 1))


# ── MCP SSE transport (standard MCP protocol) ─────────────────────────────────
# Exposes the same tools via the MCP JSON-RPC protocol over Server-Sent Events.
# Compatible with Claude Desktop and other MCP clients.

try:
    from mcp.server import Server
    from mcp.server.sse import SseServerTransport
    from mcp import types as mcp_types

    mcp_server = Server("mcp-document-server")
    sse_transport = SseServerTransport("/messages")

    @mcp_server.list_tools()
    async def handle_list_tools() -> list[mcp_types.Tool]:
        tools = []
        for name, schema in TOOL_SCHEMAS.items():
            # Build JSON Schema for parameters
            required = [k for k, v in schema["parameters"].items() if not v.get("optional")]
            properties = {
                k: {"type": v["type"], "description": v["description"]}
                for k, v in schema["parameters"].items()
            }
            tools.append(mcp_types.Tool(
                name=name,
                description=schema["description"],
                inputSchema={
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            ))
        return tools

    @mcp_server.call_tool()
    async def handle_call_tool(
        name: str,
        arguments: dict[str, Any] | None,
    ) -> list[mcp_types.TextContent]:
        if name not in TOOL_FUNCTIONS:
            raise ValueError(f"Unknown tool: {name}")
        try:
            result = TOOL_FUNCTIONS[name](**(arguments or {}))
            import json
            return [mcp_types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        except Exception as exc:
            return [mcp_types.TextContent(type="text", text=f"ERROR: {exc}")]

    @app.get("/sse")
    async def sse_endpoint(request: Request):
        """MCP SSE transport for Claude Desktop and other MCP clients."""
        async with sse_transport.connect_sse(request.scope, request.receive, request._send) as streams:
            await mcp_server.run(streams[0], streams[1], mcp_server.create_initialization_options())

    @app.post("/messages")
    async def messages_endpoint(request: Request):
        """MCP message post-back endpoint used by SSE transport."""
        await sse_transport.handle_post_message(request.scope, request.receive, request._send)

    log.info("MCP SSE transport enabled at /sse")

except ImportError:
    log.warning("mcp package not installed — SSE transport disabled. Install with: pip install mcp")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("Starting MCP Document Server on %s:%s", config.HOST, config.PORT)
    uvicorn.run(
        "server:app",
        host=config.HOST,
        port=config.PORT,
        log_level=config.LOG_LEVEL,
        reload=False,
    )
