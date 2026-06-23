const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
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
  validationFailures: 0,
  repairs: 0,
  repairTypes: {},
  runtimeFailures: 0,
  benchmarkResults: null,
  totalLatencyMs: 0,
  failureTypes: {}
};

let latestGeneration = null;

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

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();

  for (const file of files) {
    const name = Buffer.from(file.path.replace(/\\/g, "/"));
    const content = Buffer.from(file.content, "utf8");
    const compressed = zlib.deflateRawSync(content);
    const checksum = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, end]);
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
      mode: input.mode || "web-app",
      confidenceThreshold: input.confidenceThreshold || 0.7
    });

    metrics.totalLatencyMs += Date.now() - started;
    metrics.repairs += result.repairSummary?.total || result.repairs.length;
    metrics.validationFailures += result.validation?.remainingIssues?.length || result.issues.length;
    if (result.runtimeReport?.status === "fail") metrics.runtimeFailures += 1;
    for (const repair of result.repairs) {
      metrics.repairTypes[repair.type] = (metrics.repairTypes[repair.type] || 0) + repair.count;
    }
    if (result.status === "ready") {
      metrics.successes += 1;
    } else {
      metrics.failures += 1;
      for (const issue of result.issues) {
        metrics.failureTypes[issue.type] = (metrics.failureTypes[issue.type] || 0) + 1;
      }
    }

    latestGeneration = result;
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

async function handleExport(req, res) {
  try {
    const body = await readBody(req);
    const input = body ? JSON.parse(body) : {};
    const generation = input.files?.length ? input : latestGeneration;
    if (!generation?.files?.length) {
      sendJson(res, 400, { message: "No generated project files are available to export." });
      return;
    }

    const archive = createZip(generation.files);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="generated-project.zip"',
      "Content-Length": archive.length
    });
    res.end(archive);
  } catch (error) {
    sendJson(res, 400, { message: error.message });
  }
}

function handleBenchmarkResult(req, res) {
  readBody(req)
    .then(body => {
      metrics.benchmarkResults = JSON.parse(body || "{}");
      sendJson(res, 200, { status: "recorded" });
    })
    .catch(error => sendJson(res, 400, { message: error.message }));
}

function handleMetrics(res) {
  const avgLatencyMs = metrics.requests ? Math.round(metrics.totalLatencyMs / metrics.requests) : 0;
  const latestBenchmarkPath = path.join(rootDir, "benchmarks", "latest-result.json");
  const benchmarkResults = metrics.benchmarkResults || (fs.existsSync(latestBenchmarkPath) ? JSON.parse(fs.readFileSync(latestBenchmarkPath, "utf8")).summary : null);
  sendJson(res, 200, { ...metrics, benchmarkResults, avgLatencyMs });
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

  if (req.method === "POST" && url.pathname === "/api/export") {
    await handleExport(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/benchmark-result") {
    handleBenchmarkResult(req, res);
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
