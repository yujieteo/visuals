"""The notebook kernel: runs in the PyScript worker and executes one cell at a time for the page.

src/worker-boot.js calls run() with callPromising, so input() can wait for the page with pyodide.ffi.run_sync
while the worker keeps receiving messages. Every output goes to the page as one JSON message in the shape of
an nbformat 4 output (stream, display_data, execute_result, error). Nothing here uses the network.
"""
import ast
import base64
import builtins
import importlib
import io
import json
import linecache
import os
import sys
import time
import traceback
import warnings

import js
from pyodide.ffi import create_proxy, run_sync, to_js

HOME = "/notebook"
PREVIEW_ROWS = 20      # a table longer than 2 * PREVIEW_ROWS shows its first and last PREVIEW_ROWS rows
PREVIEW_COLUMNS = 40
STREAM_FLUSH_BYTES = 8192
STREAM_FLUSH_SECONDS = 0.05

os.makedirs(HOME, exist_ok=True)
os.chdir(HOME)
if HOME not in sys.path:
    sys.path.insert(0, HOME)
os.environ.setdefault("MPLBACKEND", "agg")
# Matplotlib 3.10's Agg text drawing passes a float to its own FreeType call; the warning names the user's
# savefig line but is not about user code.
warnings.filterwarnings("ignore", message="The [xy] parameter as float was deprecated")

namespace = {"__name__": "__main__", "__builtins__": builtins}
state = {"count": 0, "cell": None, "busy": False}


def emit(output):
    js.__pynb.emit(state["cell"], json.dumps(output, default=str))


class Stream(io.TextIOBase):
    """stdout or stderr: text goes to the page in batches, so a print loop cannot flood it."""

    def __init__(self, name):
        self.name = name
        self.parts = []
        self.size = 0
        self.last = time.monotonic()

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        if text:
            self.parts.append(text)
            self.size += len(text)
            if self.size >= STREAM_FLUSH_BYTES or time.monotonic() - self.last >= STREAM_FLUSH_SECONDS:
                self.flush()
        return len(text)

    def flush(self):
        if self.parts:
            text = "".join(self.parts)
            self.parts, self.size = [], 0
            emit({"output_type": "stream", "name": self.name, "text": text})
        self.last = time.monotonic()


stdout, stderr = Stream("stdout"), Stream("stderr")


# Rich display ------------------------------------------------------------------------------------------------

def png_of_figure(figure):
    buffer = io.BytesIO()
    figure.savefig(buffer, format="png", dpi=figure.dpi, facecolor=figure.get_facecolor())
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def png_of_image(image):
    if image.mode not in ("1", "L", "LA", "P", "RGB", "RGBA", "I;16"):
        image = image.convert("RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def table_preview(frame):
    """A bounded HTML preview of a pandas DataFrame or Series, labelled with its full shape and the rows shown."""
    import pandas as pd

    full = frame.to_frame() if isinstance(frame, pd.Series) else frame
    rows, columns = full.shape
    if rows > 2 * PREVIEW_ROWS:
        shown = pd.concat([full.iloc[:PREVIEW_ROWS], full.iloc[-PREVIEW_ROWS:]])
        ranges = [[1, PREVIEW_ROWS], [rows - PREVIEW_ROWS + 1, rows]]
    else:
        shown = full
        ranges = [[1, rows]] if rows else []
    if columns > PREVIEW_COLUMNS:
        shown = shown.iloc[:, :PREVIEW_COLUMNS]
    html = shown.to_html(max_rows=None, max_cols=None, border=0)
    complete = rows <= 2 * PREVIEW_ROWS and columns <= PREVIEW_COLUMNS
    preview = {"rows": rows, "columns": columns, "row_ranges": ranges,
               "columns_shown": min(columns, PREVIEW_COLUMNS), "complete": complete}
    return html, preview


def bundle(value):
    """(data, metadata) of an nbformat display bundle for value."""
    data, metadata = {}, {}
    module = type(value).__module__ or ""
    if module.startswith("matplotlib.figure"):
        data["image/png"] = png_of_figure(value)
        width, height = value.get_size_inches() * value.dpi
        metadata["image/png"] = {"width": round(width), "height": round(height)}
        import matplotlib.pyplot as plt
        plt.close(value)
    elif module.startswith("PIL.") and hasattr(value, "save") and hasattr(value, "mode"):
        data["image/png"] = png_of_image(value)
        metadata["image/png"] = {"width": value.width, "height": value.height}
    elif module.startswith("pandas.") and type(value).__name__ in ("DataFrame", "Series"):
        html, preview = table_preview(value)
        data["text/html"] = html
        metadata["pynb"] = {"preview": preview}
    else:
        for method, mime in (("_repr_html_", "text/html"), ("_repr_markdown_", "text/markdown"),
                             ("_repr_latex_", "text/latex"), ("_repr_svg_", "image/svg+xml"),
                             ("_repr_png_", "image/png"), ("_repr_jpeg_", "image/jpeg"),
                             ("_repr_json_", "application/json")):
            function = getattr(value, method, None)
            if not callable(function) or isinstance(value, type):
                continue
            try:
                result = function()
            except Exception:
                continue
            if isinstance(result, tuple):
                result = result[0]
            if result is None:
                continue
            if mime in ("image/png", "image/jpeg") and isinstance(result, bytes):
                result = base64.b64encode(result).decode("ascii")
            data[mime] = result
    try:
        text = repr(value)
    except Exception as error:
        text = f"<repr failed: {error!r}>"
    data["text/plain"] = text
    return data, metadata


def display(*values, raw=False):
    """Show each value below the running cell, like IPython's display()."""
    for value in values:
        flush_streams()
        if raw:
            emit({"output_type": "display_data", "data": value, "metadata": {}})
        else:
            data, metadata = bundle(value)
            emit({"output_type": "display_data", "data": data, "metadata": metadata})


class Markdown:
    def __init__(self, text):
        self.text = text

    def _repr_markdown_(self):
        return self.text

    def __repr__(self):
        return self.text


class Math:
    def __init__(self, latex):
        self.latex = latex

    def _repr_latex_(self):
        return f"$\\displaystyle {self.latex}$"

    def __repr__(self):
        return self.latex


class HTML:
    def __init__(self, html):
        self.html = html

    def _repr_html_(self):
        return self.html

    def __repr__(self):
        return "<HTML>"


def show_figures():
    """Show every open Matplotlib figure (plt.show() and the end of a cell), then close it."""
    if "matplotlib.pyplot" not in sys.modules:
        return
    import matplotlib.pyplot as plt
    for number in plt.get_fignums():
        figure = plt.figure(number)
        display(figure)
    plt.close("all")


def setup_matplotlib():
    import matplotlib
    matplotlib.use("agg")
    import matplotlib.pyplot as plt
    plt.show = lambda *args, **kwargs: show_figures()


# Input -------------------------------------------------------------------------------------------------------

def ask(prompt="", password=False):
    flush_streams()
    answer = run_sync(js.__pynb.ask(state["cell"], str(prompt), password))
    if answer is None:
        raise KeyboardInterrupt("input() was cancelled")
    emit({"output_type": "stream", "name": "stdout", "text": f"{prompt}{'' if password else answer}\n"})
    return answer


def input_(prompt=""):
    return ask(prompt)


def getpass(prompt="Password: ", stream=None):
    return ask(prompt, password=True)


# Execution ---------------------------------------------------------------------------------------------------

UNSUPPORTED = ("%", "!")


def unsupported_line(source):
    for number, line in enumerate(source.splitlines(), 1):
        if line.lstrip().startswith(UNSUPPORTED):
            return number, line.strip()
    return None


def flush_streams():
    stdout.flush()
    stderr.flush()


def error_output(error):
    """An nbformat error output; the traceback starts at the first frame of cell code (the kernel's own
    frames above it are not the user's)."""
    exception = traceback.TracebackException.from_exception(error)
    start = next((i for i, frame in enumerate(exception.stack) if frame.filename.startswith("<cell ")), len(exception.stack))
    exception.stack = traceback.StackSummary.from_list(list(exception.stack)[start:])
    lines = list(exception.format())
    return {"output_type": "error", "ename": type(error).__name__, "evalue": str(error),
            "traceback": [line.rstrip("\n") for line in "".join(lines).splitlines()]}


def execute(source, filename):
    """Run source in the shared namespace; return the value of a final expression (or None)."""
    flags = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT
    tree = ast.parse(source, filename, "exec")
    last = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last = ast.Expression(tree.body.pop().value)
    for code in [compile(tree, filename, "exec", flags=flags)] + ([compile(last, filename, "eval", flags=flags)] if last else []):
        result = eval(code, namespace)
        if code.co_flags & 0x80:  # CO_COROUTINE: the cell has a top-level await
            result = run_sync(result)
    return result if last else None


def run(message):
    request = json.loads(message)
    state["cell"] = request["id"]
    if state["busy"]:
        emit({"output_type": "error", "ename": "Busy", "evalue": "Another cell is running.", "traceback": []})
        js.__pynb.emit(request["id"], json.dumps({"kind": "done", "status": "busy"}))
        return
    state["busy"] = True
    state["count"] += 1
    count = state["count"]
    filename = f"<cell {count}>"
    source = request["source"]
    linecache.cache[filename] = (len(source), None, source.splitlines(True), filename)  # source lines in tracebacks
    status, started = "ok", time.perf_counter()
    importlib.invalidate_caches()  # a .py file added since the last cell can be imported
    saved = sys.stdout, sys.stderr, builtins.input
    sys.stdout, sys.stderr, builtins.input = stdout, stderr, input_
    try:
        try:
            value = execute(source, filename)
            flush_streams()
            show_figures()
            if value is not None:
                namespace["_"] = value
                data, metadata = bundle(value)
                emit({"output_type": "execute_result", "execution_count": count, "data": data, "metadata": metadata})
        except SyntaxError as error:
            status = "error"
            flush_streams()
            found = unsupported_line(source)
            if found:
                number, line = found
                emit({"output_type": "error", "ename": "UnsupportedSyntax",
                      "evalue": f"line {number}: {line!r} is an IPython magic or shell command. This notebook runs "
                                "plain Python only, so the cell did not run.",
                      "traceback": []})
            else:
                emit(error_output(error))
        except BaseException as error:  # noqa: B036 - KeyboardInterrupt and SystemExit end the cell, not the kernel
            status = "error"
            flush_streams()
            show_figures()
            emit(error_output(error))
    finally:
        flush_streams()
        sys.stdout, sys.stderr, builtins.input = saved
        state["busy"] = False
    js.__pynb.emit(request["id"], json.dumps({"kind": "done", "status": status, "execution_count": count,
                                              "seconds": round(time.perf_counter() - started, 6)}))


def info():
    import importlib.metadata as metadata
    import pyodide
    packages = {dist.metadata["Name"]: dist.version for dist in metadata.distributions()}
    return json.dumps({"python": sys.version.split()[0], "pyodide": pyodide.__version__,
                       "packages": dict(sorted(packages.items(), key=lambda item: item[0].lower()))})


builtins.display = display
builtins.input = input_
import getpass as _getpass  # noqa: E402
_getpass.getpass = getpass
sys.modules["pynb"] = type(sys)("pynb")
sys.modules["pynb"].__dict__.update(display=display, Markdown=Markdown, Math=Math, HTML=HTML)
setup_matplotlib()
js.__pynb.ready(to_js({"run": create_proxy(run), "info": create_proxy(info)}, dict_converter=js.Object.fromEntries))
