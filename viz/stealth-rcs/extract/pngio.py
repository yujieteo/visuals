"""Minimal PNG and PBM input and output for the figure extraction, standard library only.

Black-and-white figure crops are written as 1-bit greyscale PNG; review overlays as 8-bit
palette PNG. The reader accepts only what the writer produces (filter type 0 on every row),
so a crop that another tool rewrote fails loudly instead of decoding wrongly.
"""
import struct
import zlib
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_pbm(path):
    """Read a binary PBM (P4) file as rows of 0/1, where 1 is black."""
    data = Path(path).read_bytes()
    fields, i = [], 0
    while len(fields) < 3:
        while data[i:i + 1].isspace():
            i += 1
        if data[i:i + 1] == b"#":
            while data[i:i + 1] != b"\n":
                i += 1
            continue
        j = i
        while not data[j:j + 1].isspace():
            j += 1
        fields.append(data[i:j])
        i = j
    i += 1
    if fields[0] != b"P4":
        raise ValueError(f"{path}: not a binary PBM")
    width, height = int(fields[1]), int(fields[2])
    stride = (width + 7) // 8
    bits = data[i:i + stride * height]
    return width, height, [[(bits[y * stride + x // 8] >> (7 - x % 8)) & 1 for x in range(width)] for y in range(height)]


def _chunk(kind, body):
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)


def write_bilevel_png(path, rows):
    """Write rows of 0/1 (1 is black) as a 1-bit greyscale PNG (white is 1 in PNG greyscale)."""
    height, width = len(rows), len(rows[0])
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for x0 in range(0, width, 8):
            byte = 0
            for k in range(8):
                x = x0 + k
                white = 1 if x >= width or not row[x] else 0
                byte |= white << (7 - k)
            raw.append(byte)
    header = struct.pack(">IIBBBBB", width, height, 1, 0, 0, 0, 0)
    with open(path, "wb") as out:
        out.write(PNG_SIGNATURE + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + _chunk(b"IEND", b""))


def read_bilevel_png(path):
    """Read a PNG written by write_bilevel_png as rows of 0/1 (1 is black)."""
    data = Path(path).read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path}: not a PNG")
    i, header, idat = len(PNG_SIGNATURE), None, b""
    while i < len(data):
        (length,) = struct.unpack(">I", data[i:i + 4])
        kind, body = data[i + 4:i + 8], data[i + 8:i + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        i += 12 + length
    width, height, depth, colour, _, _, interlace = header
    if (depth, colour, interlace) != (1, 0, 0):
        raise ValueError(f"{path}: expected a 1-bit greyscale PNG without interlace")
    raw = zlib.decompress(idat)
    stride = (width + 7) // 8
    rows = []
    for y in range(height):
        line = raw[y * (stride + 1):(y + 1) * (stride + 1)]
        if line[0] != 0:
            raise ValueError(f"{path}: row {y} uses PNG filter {line[0]}; expected 0")
        rows.append([0 if (line[1 + x // 8] >> (7 - x % 8)) & 1 else 1 for x in range(width)])
    return width, height, rows


def write_palette_png(path, rows, palette):
    """Write rows of palette indexes as an 8-bit palette PNG; palette is a list of (r, g, b)."""
    height, width = len(rows), len(rows[0])
    raw = bytearray()
    for row in rows:
        raw.append(0)
        raw.extend(row)
    header = struct.pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0)
    plte = bytes(c for rgb in palette for c in rgb)
    with open(path, "wb") as out:
        out.write(PNG_SIGNATURE + _chunk(b"IHDR", header) + _chunk(b"PLTE", plte)
                  + _chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + _chunk(b"IEND", b""))
