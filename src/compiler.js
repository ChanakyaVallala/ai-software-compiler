const KNOWN_STACKS = {
  crm: {
    productType: "CRM",
    pages: ["Dashboard", "Accounts", "Contacts", "Deals", "Tasks", "Settings"],
    entities: ["Account", "Contact", "Deal", "Task", "User"],
    roles: ["admin", "sales_manager", "sales_rep"],
    businessRules: ["Deals must belong to an account.", "Tasks can be assigned only to active users."]
  },
  ecommerce: {
    productType: "E-commerce",
    pages: ["Storefront", "Product Detail", "Cart", "Checkout", "Orders", "Admin"],
    entities: ["Product", "Customer", "CartItem", "Order", "Payment"],
    roles: ["admin", "customer", "support"],
    businessRules: ["Checkout requires at least one cart item.", "Paid orders cannot be deleted."]
  },
  dashboard: {
    productType: "Analytics Dashboard",
    pages: ["Overview", "Reports", "Segments", "Alerts", "Settings"],
    entities: ["Metric", "Report", "Segment", "Alert", "User"],
    roles: ["admin", "analyst", "viewer"],
    businessRules: ["Alerts require a metric threshold.", "Viewer role is read-only."]
  },
  default: {
    productType: "Web Application",
    pages: ["Dashboard", "Records", "Record Detail", "Reports", "Settings"],
    entities: ["Record", "Project", "Activity", "User"],
    roles: ["admin", "member", "viewer"],
    businessRules: ["Every record must have an owner.", "Viewer role cannot mutate data."]
  }
};

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function detectKind(prompt) {
  const lower = prompt.toLowerCase();
  if (/\b(crm|lead|sales|deal|customer relationship)\b/.test(lower)) return "crm";
  if (/\b(ecommerce|e-commerce|shop|store|cart|checkout|payment)\b/.test(lower)) return "ecommerce";
  if (/\b(dashboard|analytics|metric|report|kpi)\b/.test(lower)) return "dashboard";
  return "default";
}

function extractAppName(prompt, kind) {
  const quoted = prompt.match(/["']([^"']{3,50})["']/);
  if (quoted) return titleCase(quoted[1]);

  const called = prompt.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9 -]{2,40})/i);
  if (called) return titleCase(called[1].replace(/[.,;:].*$/, ""));

  const stack = KNOWN_STACKS[kind] || KNOWN_STACKS.default;
  return `${stack.productType} Studio`;
}

function extractIntent(prompt, mode) {
  const kind = detectKind(prompt);
  const stack = KNOWN_STACKS[kind] || KNOWN_STACKS.default;
  const lowered = prompt.toLowerCase();

  return {
    appName: extractAppName(prompt, kind),
    productType: stack.productType,
    mode,
    goals: [
      `Build a ${stack.productType.toLowerCase()} with reliable CRUD workflows.`,
      lowered.includes("premium") ? "Include premium-plan access boundaries." : "Include role-based access boundaries.",
      lowered.includes("dashboard") || kind === "dashboard" ? "Expose KPI visibility for operators." : "Expose operational reporting."
    ],
    pages: [...stack.pages],
    entities: [...stack.entities],
    roles: [...stack.roles],
    apiNeeds: stack.entities.map(entity => ({
      entity,
      endpoints: [`GET /api/${entity.toLowerCase()}s`, `POST /api/${entity.toLowerCase()}s`, `PATCH /api/${entity.toLowerCase()}s/:id`]
    })),
    businessRules: [...stack.businessRules],
    constraints: [
      "Generated output must be executable without hidden services.",
      "Every page must map to data or a documented static purpose.",
      "Every API endpoint must map to an entity."
    ],
    assumptions: [
      "Use local JSON storage for the generated prototype.",
      "Use token-shaped mock auth so reviewers can inspect role logic."
    ]
  };
}

function planProject(intent) {
  const routes = intent.pages.map(page => ({
    page,
    route: `/${page.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "home"}`,
    components: [`${page.replace(/[^a-z0-9]/gi, "")}View`, "ShellNavigation"],
    data: intent.entities.slice(0, 2)
  }));

  const schema = intent.entities.map(entity => ({
    name: entity,
    fields: [
      { name: "id", type: "string", required: true },
      { name: "name", type: "string", required: true },
      { name: "status", type: "enum", values: ["active", "paused", "archived"], required: true },
      { name: "ownerId", type: "string", required: true },
      { name: "createdAt", type: "datetime", required: true }
    ]
  }));

  return {
    appName: intent.appName,
    stack: {
      frontend: "React-compatible static HTML/CSS/JS",
      backend: "Node HTTP server",
      storage: "Local JSON file",
      auth: "Mock role token"
    },
    fileTree: [
      "package.json",
      "server.js",
      "public/index.html",
      "public/styles.css",
      "public/app.js",
      "src/schema.json",
      "README.md"
    ],
    routes,
    schema,
    auth: {
      roles: intent.roles,
      permissions: intent.roles.map((role, index) => ({
        role,
        canRead: true,
        canWrite: index < intent.roles.length - 1,
        canAdmin: index === 0
      }))
    },
    api: intent.apiNeeds,
    businessRules: intent.businessRules
  };
}

function validateBlueprint(blueprint, strictness) {
  const issues = [];

  if (!blueprint.appName) issues.push({ type: "missing_app_name", severity: "critical", message: "App name is required." });
  if (!blueprint.routes.length) issues.push({ type: "missing_routes", severity: "critical", message: "At least one route is required." });
  if (!blueprint.schema.length) issues.push({ type: "missing_schema", severity: "critical", message: "At least one entity schema is required." });

  const schemaNames = new Set(blueprint.schema.map(entity => entity.name));
  for (const api of blueprint.api) {
    if (!schemaNames.has(api.entity)) {
      issues.push({ type: "orphan_api", severity: "high", message: `${api.entity} API has no matching schema.` });
    }
  }

  for (const route of blueprint.routes) {
    if (strictness === "strict" && route.data.some(entity => !schemaNames.has(entity))) {
      issues.push({ type: "route_data_mismatch", severity: "high", message: `${route.page} references unknown data.` });
    }
  }

  const roleNames = new Set(blueprint.auth.roles);
  if (roleNames.size !== blueprint.auth.roles.length) {
    issues.push({ type: "duplicate_roles", severity: "medium", message: "Roles must be unique." });
  }

  return issues;
}

function repairBlueprint(blueprint, issues) {
  const repairs = [];
  const schemaNames = new Set(blueprint.schema.map(entity => entity.name));

  for (const issue of issues) {
    if (issue.type === "missing_app_name") {
      blueprint.appName = "Generated Application";
      repairs.push("Added fallback app name.");
    }
    if (issue.type === "missing_routes") {
      blueprint.routes.push({ page: "Dashboard", route: "/dashboard", components: ["DashboardView"], data: [] });
      repairs.push("Added default dashboard route.");
    }
    if (issue.type === "missing_schema") {
      blueprint.schema.push({ name: "Record", fields: [{ name: "id", type: "string", required: true }] });
      repairs.push("Added default Record schema.");
    }
    if (issue.type === "orphan_api") {
      for (const api of blueprint.api) {
        if (!schemaNames.has(api.entity)) {
          blueprint.schema.push({
            name: api.entity,
            fields: [
              { name: "id", type: "string", required: true },
              { name: "name", type: "string", required: true }
            ]
          });
          repairs.push(`Created schema for ${api.entity}.`);
        }
      }
    }
  }

  return repairs;
}

function generatedReadme(blueprint) {
  return `# ${blueprint.appName}

Generated by AI Software Compiler.

## Run

\`\`\`bash
npm start
\`\`\`

Open http://localhost:3000.

## Architecture

- Frontend: ${blueprint.stack.frontend}
- Backend: ${blueprint.stack.backend}
- Storage: ${blueprint.stack.storage}
- Auth: ${blueprint.stack.auth}

## Routes

${blueprint.routes.map(route => `- ${route.page}: ${route.route}`).join("\n")}

## Entities

${blueprint.schema.map(entity => `- ${entity.name}: ${entity.fields.map(field => field.name).join(", ")}`).join("\n")}
`;
}

function buildFiles(blueprint) {
  const schemaJson = JSON.stringify(blueprint.schema, null, 2);
  const configJson = JSON.stringify({ appName: blueprint.appName, routes: blueprint.routes, auth: blueprint.auth }, null, 2);

  return [
    { path: "README.md", language: "markdown", content: generatedReadme(blueprint) },
    { path: "src/schema.json", language: "json", content: schemaJson },
    { path: "src/config.json", language: "json", content: configJson },
    {
      path: "package.json",
      language: "json",
      content: JSON.stringify({ scripts: { start: "node server.js" }, dependencies: {}, devDependencies: {} }, null, 2)
    },
    {
      path: "server.js",
      language: "javascript",
      content: `const http = require("http");\nconst port = 3000;\nhttp.createServer((req, res) => {\n  res.writeHead(200, { "Content-Type": "application/json" });\n  res.end(JSON.stringify({ app: ${JSON.stringify(blueprint.appName)}, route: req.url }));\n}).listen(port, () => console.log("Running on http://localhost:" + port));\n`
    },
    {
      path: "public/index.html",
      language: "html",
      content: `<!doctype html><html><head><title>${blueprint.appName}</title></head><body><h1>${blueprint.appName}</h1><p>Generated executable prototype.</p></body></html>`
    }
  ];
}

function buildGeneration({ prompt, strictness, mode }) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      status: "needs_input",
      intent: null,
      blueprint: null,
      files: [],
      issues: [{ type: "empty_prompt", severity: "critical", message: "Describe the software you want to generate." }],
      repairs: [],
      clarifyingQuestions: ["What product should be generated?", "Who are the users?", "Which workflows are mandatory?"]
    };
  }

  const intent = extractIntent(trimmed, mode);
  const blueprint = planProject(intent);
  const initialIssues = validateBlueprint(blueprint, strictness);
  const repairs = repairBlueprint(blueprint, initialIssues);
  const remainingIssues = validateBlueprint(blueprint, strictness).filter(issue => issue.severity === "critical");
  const files = buildFiles(blueprint);

  return {
    status: remainingIssues.length ? "blocked" : "ready",
    intent,
    blueprint,
    files,
    issues: remainingIssues,
    repairs,
    clarifyingQuestions: trimmed.length < 40 ? ["Should this include authentication?", "Which reports matter most?"] : []
  };
}

module.exports = { buildGeneration };
