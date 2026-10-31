// Runs students' Python code in the background with Pyodide (Python for the browser).
// Running it in a "worker" keeps the page responsive, and lets the Stop button
// end a program that never finishes (like an infinite loop).

const params = new URL(self.location.href).searchParams;
const PYODIDE_BASE = params.get("base") || "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

importScripts(PYODIDE_BASE + "pyodide.js");

// Called from Python whenever the student's code uses input().
// It asks the page to show a typing box and waits for the answer.
let pendingInput = null;
self.c2c_request_input = (prompt) =>
  new Promise((resolve) => {
    pendingInput = resolve;
    postMessage({ type: "input", prompt: String(prompt) });
  });

const HELPER = `
import ast, sys, traceback
from js import c2c_request_input

async def _c2c_input(prompt=""):
    sys.stdout.flush()
    value = await c2c_request_input(str(prompt))
    return str(value)

def _c2c_no_input(prompt=""):
    raise RuntimeError("input() inside a function isn't supported on this site yet. Try using input() outside the function.")

class _AwaitInput(ast.NodeTransformer):
    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == "input":
            return ast.copy_location(ast.Await(value=node), node)
        return node

def _input_in_function(tree):
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            for m in ast.walk(n):
                if isinstance(m, ast.Call) and isinstance(m.func, ast.Name) and m.func.id == "input":
                    return True
    return False

def _error_info(e):
    line = None
    if isinstance(e, SyntaxError):
        line = e.lineno
        msg = e.msg
    else:
        msg = str(e)
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == "<exec>":
                line = fr.lineno
    return {"name": type(e).__name__, "message": msg, "line": line}

async def c2c_run(src):
    try:
        tree = ast.parse(src, filename="<exec>")
        ns = {"__name__": "__main__"}
        if _input_in_function(tree):
            ns["input"] = _c2c_no_input
        else:
            tree = ast.fix_missing_locations(_AwaitInput().visit(tree))
            ns["input"] = _c2c_input
        code = compile(tree, "<exec>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
        result = eval(code, ns)
        if result is not None:
            await result
        sys.stdout.flush()
        return None
    except BaseException as e:
        sys.stdout.flush()
        return _error_info(e)
`;

let runFn = null;

async function boot() {
  self.pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  const out = new TextDecoder();
  const err = new TextDecoder();
  pyodide.setStdout({
    write: (buf) => {
      postMessage({ type: "out", text: out.decode(buf, { stream: true }) });
      return buf.length;
    },
  });
  pyodide.setStderr({
    write: (buf) => {
      postMessage({ type: "out", text: err.decode(buf, { stream: true }) });
      return buf.length;
    },
  });
  pyodide.runPython(HELPER);
  runFn = pyodide.globals.get("c2c_run");
  postMessage({ type: "ready" });
}

const ready = boot().catch((e) => postMessage({ type: "load-error", message: String(e) }));

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "input-reply") {
    if (pendingInput) {
      const resolve = pendingInput;
      pendingInput = null;
      resolve(msg.value);
    }
  } else if (msg.type === "run") {
    await ready;
    if (!runFn) return;
    let error = null;
    try {
      const res = await runFn(msg.code);
      if (res) {
        error = res.toJs({ dict_converter: Object.fromEntries });
        res.destroy();
      }
    } catch (e) {
      error = { name: "Error", message: String(e), line: null };
    }
    postMessage({ type: "done", error });
  }
};
