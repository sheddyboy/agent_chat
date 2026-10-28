from resume import latex
from langchain_core.tools import tool


@tool
def read_resume() -> str:
    """Read the user's resume, a LaTeX file (Jake's Resume template). Call this before
    answering questions about the resume and before every edit_resume."""
    return latex.source()


@tool
def edit_resume(find: str, replace: str) -> str:
    """Change the user's resume by replacing one exact piece of its LaTeX. Needs user approval.

    find: text copied exactly from read_resume, long enough to appear only once.
    replace: the new LaTeX for that piece. Keep the commands around the text, like
    \\resumeItem{...} or \\resumeSubheading{...}{...}{...}{...}, and escape & % $ # _ as \\& \\% \\$ \\# \\_.
    For several changes, call this once per change.
    The resume is recompiled; if the new LaTeX does not compile, nothing is saved and
    the error is returned so you can fix the edit.
    """
    return latex.edit(find, replace)
