"""The resume: a LaTeX source compiled to PDF with Tectonic, with earlier versions kept."""

import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from core.config import settings

TEMPLATE = Path(__file__).parent / "resume_template.tex"
COMPILE_TIMEOUT = 60
# Overleaf runs pdfTeX; Tectonic runs XeTeX, which has no such commands. They are
# commented out only for the compile, so the saved source still pastes into Overleaf.
PDFTEX_ONLY = re.compile(r"^[ \t]*(\\input\{glyphtounicode\}|\\pdfgentounicode\s*=\s*1)", re.M)
ERROR_LINES = 4


def folder() -> Path:
    path = Path(settings.resume_dir)
    (path / "history").mkdir(parents=True, exist_ok=True)
    return path


def tex_path() -> Path:
    return folder() / "resume.tex"


def pdf_path() -> Path:
    return folder() / "resume.pdf"


def source() -> str:
    """The current source, starting from the template on first use."""
    path = tex_path()
    if not path.exists():
        shutil.copy(TEMPLATE, path)
    return path.read_text()


def errors(log: str) -> str:
    """The LaTeX error lines (they start with "!") and a few lines of context after each."""
    lines = log.splitlines()
    picked = []
    for i, line in enumerate(lines):
        if line.startswith("!"):
            picked += lines[i : i + ERROR_LINES] + [""]
    return "\n".join(picked).strip() or log[-2000:]


def compile_tex(tex: str) -> tuple[bool, str]:
    """Compile in a temp folder; on success the PDF replaces resume.pdf."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "resume.tex"
        src.write_text(PDFTEX_ONLY.sub(r"% \1", tex))
        try:
            done = subprocess.run(
                ["tectonic", "--outdir", tmp, str(src)],
                capture_output=True,
                text=True,
                timeout=COMPILE_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return False, f"Compile took longer than {COMPILE_TIMEOUT} s."
        if done.returncode != 0:
            return False, errors(done.stdout + done.stderr)
        shutil.move(Path(tmp) / "resume.pdf", pdf_path())
    return True, ""


def save(tex: str) -> tuple[bool, str]:
    """Save only if it compiles; the version it replaces goes to history."""
    ok, log = compile_tex(tex)
    if not ok:
        return False, log
    path = tex_path()
    if path.exists() and path.read_text() != tex:
        shutil.copy(path, folder() / "history" / f"{datetime.now():%Y-%m-%d_%H-%M-%S}.tex")
    path.write_text(tex)
    return True, ""


def info() -> dict:
    tex = source()
    pdf = pdf_path()
    # The first visit has a source but no PDF yet
    if not pdf.exists():
        compile_tex(tex)
    return {
        "tex": tex,
        "updated_at": datetime.fromtimestamp(tex_path().stat().st_mtime).astimezone().isoformat(),
        "has_pdf": pdf.exists(),
    }


def history() -> list[dict]:
    files = sorted((folder() / "history").glob("*.tex"), reverse=True)
    return [{"name": f.stem, "saved_at": datetime.strptime(f.stem, "%Y-%m-%d_%H-%M-%S").isoformat()} for f in files]


def restore(name: str) -> tuple[bool, str]:
    # The name comes from history(), so only plain timestamps are valid
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}", name):
        return False, "Unknown version."
    path = folder() / "history" / f"{name}.tex"
    if not path.exists():
        return False, "Unknown version."
    return save(path.read_text())


def edit(find: str, replace: str) -> str:
    """Replace one exact piece of the source and recompile; a broken result is not saved."""
    tex = source()
    count = tex.count(find) if find else 0
    if count == 0:
        return "Not changed: `find` is not in the resume. Call read_resume and copy the text exactly."
    if count > 1:
        return f"Not changed: `find` appears {count} times. Include more surrounding text so it matches once."
    ok, log = save(tex.replace(find, replace, 1))
    if not ok:
        return f"Not changed: the edit broke the LaTeX, so the resume was left as it was.\n{log}"
    return "Saved and recompiled."
