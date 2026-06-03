const elements = {
  prompt: document.querySelector("#prompt"),
  mode: document.querySelector("#mode"),
  strictness: document.querySelector("#strictness"),
  generateBtn: document.querySelector("#generateBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  statusValue: document.querySelector("#statusValue"),
  repairValue: document.querySelector("#repairValue"),
  fileValue: document.querySelector("#fileValue"),
  latencyValue: document.querySelector("#latencyValue"),
  intentOut: document.querySelector("#intentOut"),
  blueprintOut: document.querySelector("#blueprintOut"),
  filePicker: document.querySelector("#filePicker"),
  fileOut: document.querySelector("#fileOut"),
  logOut: document.querySelector("#logOut")
};

let latestResult = null;

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function setStages(status) {
  document.querySelectorAll(".stage").forEach(stage => {
    stage.classList.toggle("active", status === "ready" || status === "needs_input");
  });
}

function setStatus(result) {
  elements.statusValue.textContent = result.status.replace("_", " ");
  elements.statusValue.className = result.status;
  elements.repairValue.textContent = result.repairs?.length || 0;
  elements.fileValue.textContent = result.files?.length || 0;
  elements.latencyValue.textContent = `${result.latencyMs || 0} ms`;
  setStages(result.status);
}

function renderFiles(files) {
  elements.filePicker.innerHTML = "";
  for (const file of files) {
    const option = document.createElement("option");
    option.value = file.path;
    option.textContent = file.path;
    elements.filePicker.append(option);
  }

  const first = files[0];
  elements.fileOut.textContent = first ? first.content : "No files generated.";
}

function renderLog(result) {
  elements.logOut.innerHTML = "";
  const messages = [];

  if (result.issues?.length) {
    for (const issue of result.issues) messages.push(`${issue.severity}: ${issue.message}`);
  } else {
    messages.push("Schema validation passed.");
  }

  for (const repair of result.repairs || []) messages.push(`Repair: ${repair}`);
  for (const question of result.clarifyingQuestions || []) messages.push(`Clarify: ${question}`);

  for (const message of messages) {
    const item = document.createElement("li");
    item.textContent = message;
    elements.logOut.append(item);
  }
}

function renderResult(result) {
  latestResult = result;
  setStatus(result);
  elements.intentOut.textContent = pretty(result.intent || {});
  elements.blueprintOut.textContent = pretty(result.blueprint || {});
  renderFiles(result.files || []);
  renderLog(result);
  elements.downloadBtn.disabled = !result.files?.length;
}

async function generate() {
  elements.generateBtn.disabled = true;
  elements.generateBtn.textContent = "Generating...";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: elements.prompt.value,
        mode: elements.mode.value,
        strictness: elements.strictness.value
      })
    });
    const result = await response.json();
    renderResult(result);
  } catch (error) {
    renderResult({
      status: "blocked",
      repairs: [],
      files: [],
      latencyMs: 0,
      intent: {},
      blueprint: {},
      issues: [{ severity: "critical", message: error.message }]
    });
  } finally {
    elements.generateBtn.disabled = false;
    elements.generateBtn.textContent = "Generate project";
  }
}

function downloadOutput() {
  if (!latestResult) return;
  const payload = {
    generatedAt: new Date().toISOString(),
    blueprint: latestResult.blueprint,
    files: latestResult.files
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${latestResult.blueprint?.appName || "generated-project"}.json`.replace(/\s+/g, "-").toLowerCase();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

elements.generateBtn.addEventListener("click", generate);
elements.downloadBtn.addEventListener("click", downloadOutput);
elements.filePicker.addEventListener("change", () => {
  const selected = latestResult?.files?.find(file => file.path === elements.filePicker.value);
  elements.fileOut.textContent = selected ? selected.content : "";
});

document.querySelectorAll(".sample").forEach(button => {
  button.addEventListener("click", () => {
    elements.prompt.value = button.dataset.prompt;
    generate();
  });
});

generate();
