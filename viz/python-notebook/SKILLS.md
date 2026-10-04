---
name: python-notebook
description: Use the Python Notebook to write and run Python in the browser with numpy, pandas, Matplotlib, seaborn, SciPy, SymPy, scikit-learn, Pillow, openpyxl, pyarrow and statsmodels, to open and export .ipynb files, and to save one HTML file that runs offline. Python runs on the user's device. Never use it for IPython magics, shell commands, pip installs or a remote kernel.
---

# Use the Python Notebook

Live at <https://teoyujie.org/visuals/python-notebook/>. The page runs Pyodide 314.0.5 through PyScript 0.7.31 in a worker. The 11 packages are part of the runtime, so an import needs no download. Code, data and outputs stay in the browser. To change the page, read [AGENTS.md](AGENTS.md).

The page has 2 forms:

| Form | Python starts | Saved work |
| --- | --- | --- |
| Website | when the user clicks Start Python or runs a cell. The runtime loads from the site, or from the offline copy after Prepare offline. | IndexedDB of this browser |
| HTML copy (Save HTML copy) | when the file opens. The runtime is in the file, so it runs from `file://` with no network. | the file itself. Save HTML copy again to keep changes. |

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the cells, their source and their outputs | `get_notebook` |
| Read the Python, Pyodide and package versions and the session state | `get_runtime` |
| List the data files and the files that Python made | `list_files` |
| List the saved notebooks | `list_notebooks` |
| Run code | the Run cell, Run all, Stop and Restart Python buttons |
| Move a notebook to Jupyter, or open one from Jupyter | Export .ipynb and Open .ipynb |
| Give a notebook with its data and Python to another person | Save HTML copy |

## Inputs

Data files go into the Python working folder `/notebook` at the path the Files panel shows. A path cannot be absolute, cannot contain `..` and cannot start a name with a dot. Python reads files with normal code, for example `pandas.read_csv("sales.csv")`. A file that a cell writes shows under "Made by Python". Keep adds it to the notebook.

Cells run plain Python. `input()` shows a field below the cell. A line with an IPython magic or a shell command (`%time`, `!pip`) stops the cell with an `UnsupportedSyntax` error.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_notebook` | none | The name of the active notebook and each cell: index, id, type, source, execution count and a summary of each output (text cut at 2000 characters) |
| `get_runtime` | none | Python, Pyodide and PyScript versions, the package list, the session state and the start time in seconds |
| `list_files` | none | The data files of the active notebook (path, bytes, SHA-256, in the HTML copy or not) and the files that Python made in this session |
| `list_notebooks` | none | The notebooks in this browser or tab: id, name, last change, and the active one |

## Exports

- **.ipynb:** nbformat 4.5. Import runs no code. Fields and outputs that the page does not use go out again unchanged.
- **HTML copy:** one file with the page, the runtime (about 98 MB), the notebook and the data files marked "In HTML copy". Its Content-Security-Policy lets it load nothing from outside the file.
- **Data:** [data.json](https://teoyujie.org/visuals/python-notebook/data.json) (`raw.json` here): the package list and the example notebook.

## Worked example

Add `sales.csv`, then run `import pandas as pd; pd.read_csv("sales.csv").describe()`. The output is a table. `get_notebook` then gives the cell with `execution_count` 1 and one `execute_result` output that holds a `text/html` table.
