const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { buildGeneration } = require("./src/compiler");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const metrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  repairs: 0,
  totalLatencyMs: 0,
  failureTypes: {}
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function safeStaticPath(rawPath) {
  const requested = rawPath === "/" ? "/index.html" : rawPath;
  const decoded = decodeURIComponent(requested);
  const resolved = path.resolve(publicDir, `.${decoded}`);
  return resolved.startsWith(publicDir) ? resolved : null;
}

function serveStatic(req, res, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

async function handleGenerate(req, res) {
  const started = Date.now();
  metrics.requests += 1;

  try {
    const body = await readBody(req);
    const input = JSON.parse(body || "{}");
    const result = buildGeneration({
      prompt: String(input.prompt || ""),
      strictness: input.strictness || "balanced",
      mode: input.mode || "web-app"
    });

    metrics.totalLatencyMs += Date.now() - started;
    metrics.repairs += result.repairs.length;
    if (result.status === "ready") {
      metrics.successes += 1;
    } else {
      metrics.failures += 1;
      for (const issue of result.issues) {
        metrics.failureTypes[issue.type] = (metrics.failureTypes[issue.type] || 0) + 1;
      }
    }

    sendJson(res, 200, {
      ...result,
      requestId: crypto.randomUUID(),
      latencyMs: Date.now() - started
    });
  } catch (error) {
    metrics.failures += 1;
    metrics.failureTypes.exception = (metrics.failureTypes.exception || 0) + 1;
    sendJson(res, 400, { status: "failed", message: error.message });
  }
}

function handleMetrics(res) {
  const avgLatencyMs = metrics.requests ? Math.round(metrics.totalLatencyMs / metrics.requests) : 0;
  sendJson(res, 200, { ...metrics, avgLatencyMs });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/metrics") {
    handleMetrics(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    await handleGenerate(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res, url.pathname);
    return;
  }

  sendJson(res, 405, { message: "Method not allowed" });
});

server.listen(port, () => {
  console.log(`AI Software Compiler running at http://localhost:${port}`);
});
