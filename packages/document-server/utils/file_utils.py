"""
Shared utilities: base64 I/O, security checks, temp-file lifecycle.
"""
from __future__ import annotations

import base64
import os
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

import magic  # python-magic

from config import MAX_FILE_SIZE_BYTES, TEMP_DIR


# ── Exceptions ────────────────────────────────────────────────────────────────

class FileSizeError(ValueError):
    """Raised when decoded file exceeds the configured size limit."""

class MimeTypeError(ValueError):
    """Raised when the detected MIME type is not in the allow-list."""


# ── Decode / encode ───────────────────────────────────────────────────────────

def decode_b64(b64_content: str) -> bytes:
    """
    Decode a base64 string → raw bytes.
    Accepts both standard and URL-safe variants; strips whitespace.
    Raises ValueError on malformed input.
    """
    try:
        cleaned = b64_content.strip().replace("\n", "").replace("\r", "")
        # Attempt standard decode first
        try:
            return base64.b64decode(cleaned, validate=True)
        except Exception:
            # Fallback: URL-safe
            return base64.urlsafe_b64decode(cleaned + "==")
    except Exception as exc:
        raise ValueError(f"Invalid base64 content: {exc}") from exc


def encode_b64(data: bytes) -> str:
    """Encode raw bytes → standard base64 string."""
    return base64.b64encode(data).decode("ascii")


# ── Security checks ───────────────────────────────────────────────────────────

def check_size(data: bytes) -> None:
    """Raise FileSizeError if data exceeds MAX_FILE_SIZE_BYTES."""
    if len(data) > MAX_FILE_SIZE_BYTES:
        mb = len(data) / (1024 * 1024)
        limit_mb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
        raise FileSizeError(
            f"File size {mb:.1f} MB exceeds limit of {limit_mb:.0f} MB."
        )


def detect_mime(data: bytes) -> str:
    """Return the MIME type detected by libmagic (not the file extension)."""
    return magic.from_buffer(data, mime=True)


def check_mime(data: bytes, allowed: set[str], label: str = "file") -> str:
    """
    Detect and validate the MIME type.
    Returns the detected MIME string on success.
    Raises MimeTypeError if not in allowed set.
    """
    mime = detect_mime(data)
    if mime not in allowed:
        raise MimeTypeError(
            f"Detected MIME type '{mime}' is not allowed for {label}. "
            f"Expected one of: {sorted(allowed)}"
        )
    return mime


# ── Temp file lifecycle ───────────────────────────────────────────────────────

@contextmanager
def temp_file(data: bytes, suffix: str = "") -> Generator[Path, None, None]:
    """
    Write *data* to a unique temp file inside TEMP_DIR, yield its Path,
    then delete it — even if the caller raises.

    Usage::

        with temp_file(raw_bytes, suffix=".xlsx") as path:
            wb = openpyxl.load_workbook(path)
    """
    name = uuid.uuid4().hex + suffix
    path = TEMP_DIR / name
    try:
        path.write_bytes(data)
        yield path
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


@contextmanager
def temp_output(suffix: str = "") -> Generator[Path, None, None]:
    """
    Create a unique temp path for *writing* output, yield it, then delete it.

    Usage::

        with temp_output(suffix=".pdf") as out:
            canvas = Canvas(str(out))
            ...
            canvas.save()
        data = out.read_bytes()   # ← wrong order, but illustrative
    """
    name = uuid.uuid4().hex + suffix
    path = TEMP_DIR / name
    try:
        yield path
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


# ── Convenience: full pipeline ────────────────────────────────────────────────

def load_and_validate(
    b64_content: str,
    allowed_mimes: set[str],
    label: str,
    suffix: str,
) -> tuple[bytes, str]:
    """
    Decode → size-check → MIME-check.
    Returns (raw_bytes, detected_mime).
    """
    raw = decode_b64(b64_content)
    check_size(raw)
    mime = check_mime(raw, allowed_mimes, label)
    return raw, mime
