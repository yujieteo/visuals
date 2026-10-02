"""Minimal TOON encoder and decoder (https://toonformat.dev/reference/spec.html).

Supports what the paper-link exports and the Calibrator history need: nested
objects, inline primitive arrays, and tabular arrays of uniform flat objects,
with the comma delimiter and two-space indentation. ``decode`` reads exactly
what ``encode`` writes.
"""

import re

_NUMERIC = re.compile(r"^[+-]?[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$", re.IGNORECASE)
_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")
_ESCAPES = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"}
DELIMITER = ","


def _escape(value):
    out = []
    for char in value:
        if char in _ESCAPES:
            out.append(_ESCAPES[char])
        elif ord(char) < 0x20:
            out.append(f"\\u{ord(char):04x}")
        else:
            out.append(char)
    return "".join(out)


def needs_quotes(value, delimiter=DELIMITER):
    """Apply the string quoting rules of TOON spec section 7.2."""
    return (
        value == ""
        or value != value.strip(" \t")
        or value in {"true", "false", "null"}
        or bool(_NUMERIC.match(value))
        or any(char in value for char in ':"\\[]{}')
        or any(ord(char) < 0x20 for char in value)
        or delimiter in value
        or value.startswith("-")
        or value.startswith("#")
    )


def encode_string(value, delimiter=DELIMITER):
    return f'"{_escape(value)}"' if needs_quotes(value, delimiter) else value


def encode_key(key):
    return key if _KEY.match(key) else f'"{_escape(key)}"'


def encode_primitive(value, delimiter=DELIMITER):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return "null"
        text = repr(value)
        return text[:-2] if text.endswith(".0") else text
    return encode_string(str(value), delimiter)


def _is_primitive(value):
    return value is None or isinstance(value, (str, int, float, bool))


def _is_tabular(items):
    if not items or not all(isinstance(item, dict) and item for item in items):
        return False
    keys = set(items[0])
    return all(set(item) == keys and all(_is_primitive(v) for v in item.values()) for item in items)


def _encode_value(key, value, depth, lines):
    pad = "  " * depth
    name = encode_key(key)
    if isinstance(value, dict):
        lines.append(f"{pad}{name}:")
        for child_key, child in value.items():
            _encode_value(child_key, child, depth + 1, lines)
    elif isinstance(value, list):
        if not value:
            lines.append(f"{pad}{name}: []")
        elif all(_is_primitive(item) for item in value):
            cells = DELIMITER.join(encode_primitive(item) for item in value)
            lines.append(f"{pad}{name}[{len(value)}]: {cells}")
        elif _is_tabular(value):
            fields = list(value[0])
            header = DELIMITER.join(encode_key(field) for field in fields)
            lines.append(f"{pad}{name}[{len(value)}]{{{header}}}:")
            for item in value:
                cells = DELIMITER.join(encode_primitive(item[field]) for field in fields)
                lines.append(f"{pad}  {cells}")
        else:
            raise TypeError(f"{key}: only primitive or uniform flat object arrays are supported")
    else:
        lines.append(f"{pad}{name}: {encode_primitive(value)}")


def encode(document):
    """Encode a dict as a TOON document (no trailing newline, per spec 12)."""
    lines = []
    for key, value in document.items():
        _encode_value(key, value, 0, lines)
    return "\n".join(lines)


class ToonError(ValueError):
    pass


_UNESCAPES = {"\\": "\\", '"': '"', "n": "\n", "r": "\r", "t": "\t"}


def _read_quoted(text, index, where):
    """Read the quoted string starting at text[index] == '"'; return (value, next index)."""
    out = []
    index += 1
    while index < len(text):
        char = text[index]
        if char == '"':
            return "".join(out), index + 1
        if char == "\\":
            index += 1
            code = text[index] if index < len(text) else ""
            if code == "u":
                digits = text[index + 1:index + 5]
                if not re.fullmatch(r"[0-9a-fA-F]{4}", digits):
                    raise ToonError(f"{where}: bad \\u escape")
                out.append(chr(int(digits, 16)))
                index += 4
            elif code in _UNESCAPES:
                out.append(_UNESCAPES[code])
            else:
                raise ToonError(f"{where}: unknown escape \\{code}")
        else:
            out.append(char)
        index += 1
    raise ToonError(f"{where}: unterminated string")


def _parse_primitive(token, where):
    token = token.strip()
    if token.startswith('"'):
        value, end = _read_quoted(token, 0, where)
        if end != len(token):
            raise ToonError(f"{where}: text after a quoted string")
        return value
    if token in ("null", "true", "false"):
        return {"null": None, "true": True, "false": False}[token]
    if _NUMERIC.match(token):
        number = float(token)
        return int(token) if re.fullmatch(r"[+-]?[0-9]+", token) else number
    return token


def _split_cells(text, where):
    cells, index = [], 0
    while True:
        while index < len(text) and text[index] == " ":
            index += 1
        start = index
        if index < len(text) and text[index] == '"':
            index = _read_quoted(text, index, where)[1]
            while index < len(text) and text[index] == " ":
                index += 1
        else:
            while index < len(text) and text[index] != DELIMITER:
                index += 1
        cells.append(text[start:index])
        if index >= len(text):
            return cells
        if text[index] != DELIMITER:
            raise ToonError(f"{where}: expected a comma")
        index += 1


def _parse_key(body, where):
    if body.startswith('"'):
        key, end = _read_quoted(body, 0, where)
        return key, body[end:]
    match = re.match(r"[A-Za-z_][A-Za-z0-9_.]*", body)
    if not match:
        raise ToonError(f"{where}: expected a key")
    return match.group(0), body[match.end():]


_TABLE = re.compile(r"^\[(\d+)\]\{(.*)\}:$")
_INLINE = re.compile(r"^\[(\d+)\]:(?: (.*))?$")


def decode(text):
    """Decode a TOON document written by ``encode`` into a dict; raise ToonError if malformed."""
    raw = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while raw and not raw[-1].strip():
        raw.pop()
    if not raw:
        raise ToonError("The TOON is empty")
    lines = []
    for number, line in enumerate(raw, 1):
        where = f"line {number}"
        indent = len(line) - len(line.lstrip(" "))
        if line[indent:indent + 1] == "\t":
            raise ToonError(f"{where}: tabs are not allowed for indentation")
        if not line.strip():
            raise ToonError(f"{where}: blank lines are not allowed")
        if indent % 2:
            raise ToonError(f"{where}: indentation must be a multiple of two spaces")
        lines.append((indent // 2, line[indent:], where))
    position = 0

    def parse_object(depth):
        nonlocal position
        document = {}
        while position < len(lines) and lines[position][0] >= depth:
            level, body, where = lines[position]
            if level > depth:
                raise ToonError(f"{where}: unexpected indentation")
            position += 1
            key, rest = _parse_key(body, where)
            if key in document:
                raise ToonError(f"{where}: duplicate key {key}")
            if rest == ":":
                document[key] = parse_object(depth + 1)
            elif rest == ": []":
                document[key] = []
            elif _TABLE.match(rest):
                count, header = _TABLE.match(rest).groups()
                fields = [_parse_primitive(cell, where) if cell.strip().startswith('"') else cell.strip()
                          for cell in _split_cells(header, where)]
                if len(set(fields)) != len(fields) or not all(fields):
                    raise ToonError(f"{where}: bad field list")
                rows = []
                while position < len(lines) and lines[position][0] == depth + 1:
                    _, row, row_where = lines[position]
                    position += 1
                    cells = _split_cells(row, row_where)
                    if len(cells) != len(fields):
                        raise ToonError(f"{row_where}: {len(cells)} values for {len(fields)} fields of {key}")
                    rows.append({field: _parse_primitive(cell, row_where) for field, cell in zip(fields, cells)})
                if position < len(lines) and lines[position][0] > depth + 1:
                    raise ToonError(f"{lines[position][2]}: unexpected indentation")
                if len(rows) != int(count):
                    raise ToonError(f"{where}: {key} declares {count} rows but has {len(rows)}")
                document[key] = rows
            elif _INLINE.match(rest):
                count, cells = _INLINE.match(rest).groups()
                items = [_parse_primitive(cell, where) for cell in _split_cells(cells, where)] if cells else []
                if len(items) != int(count):
                    raise ToonError(f"{where}: {key} declares {count} items but has {len(items)}")
                document[key] = items
            elif rest.startswith(": "):
                document[key] = _parse_primitive(rest[2:], where)
            else:
                raise ToonError(f'{where}: expected "{key}: value"')
        return document

    document = parse_object(0)
    if position != len(lines):
        raise ToonError(f"{lines[position][2]}: unexpected indentation")
    return document
