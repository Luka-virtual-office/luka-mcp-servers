"""
Configuration for the MCP Document Server.
All settings can be overridden via environment variables.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Server ───────────────────────────────────────────────────────────────────
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8100"))
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "info")

# ── Security ─────────────────────────────────────────────────────────────────
# Maximum file size accepted (base64-encoded bytes in JSON body)
MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "50"))
MAX_FILE_SIZE_BYTES: int = MAX_FILE_SIZE_MB * 1024 * 1024

# Allowed MIME types per tool (detected via python-magic, not file extension)
ALLOWED_EXCEL_MIMES: set[str] = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",                                            # .xls
    "application/zip",  # python-magic sometimes reports xlsx as zip
}
ALLOWED_DOCX_MIMES: set[str] = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/zip",
}
ALLOWED_PDF_MIMES: set[str] = {
    "application/pdf",
}

# ── Temp directory ────────────────────────────────────────────────────────────
# Used transiently; files are deleted immediately after processing.
TEMP_DIR: Path = Path(os.getenv("TEMP_DIR", "/tmp/mcp-docs"))
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# ── PDF generation ────────────────────────────────────────────────────────────
DEFAULT_PAGE_SIZE: str = os.getenv("DEFAULT_PAGE_SIZE", "A4")   # A4 | LETTER
DEFAULT_FONT: str = os.getenv("DEFAULT_FONT", "Helvetica")
DEFAULT_FONT_SIZE: int = int(os.getenv("DEFAULT_FONT_SIZE", "11"))

# ── CORS ─────────────────────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
).split(",")

# ── API key (optional — set to require Bearer token on /invoke) ───────────────
API_KEY: str | None = os.getenv("API_KEY", None)
