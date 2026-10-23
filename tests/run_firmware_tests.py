"""Compile and run the board's portable session gate without Arduino hardware."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile

compiler = shutil.which("g++") or shutil.which("clang++")
if not compiler:
    raise SystemExit("Install g++ or clang++ to run firmware protocol tests")
source = Path(__file__).with_name("control_session_test.cpp")
cache = source.resolve().parents[1] / "node_modules" / ".cache"
cache.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="clash-tank-tests-", dir=cache) as directory:
    executable = Path(directory) / ("control-session.exe" if os.name == "nt" else "control-session")
    subprocess.run([compiler, "-std=c++11", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(executable)], check=True)
    subprocess.run([str(executable)], check=True)
