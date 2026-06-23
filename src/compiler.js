const KNOWN_STACKS = {
  crm: {
    productType: "CRM",
    pages: ["Dashboard", "Accounts", "Contacts", "Deals", "Tasks", "Settings"],
    entities: ["Account", "Contact", "Deal", "Task", "User"],
    roles: ["admin", "sales_manager", "sales_rep"],
    businessRules: ["Deals must belong to an account.", "Tasks can be assigned only to active users."],
    assumptions: [
      "authentication enabled",
      "admin role exists",
      "contact management exists",
      "sales dashboard included"
    ]
  },
  ecommerce: {
    productType: "E-commerce",
    pages: ["Storefront", "Product Detail", "Cart", "Checkout", "Orders", "Admin"],
    entities: ["Product", "Customer", "CartItem", "Order", "Payment"],
    roles: ["admin", "customer", "support"],
    businessRules: ["Checkout requires at least one cart item.", "Paid orders cannot be deleted."],
    assumptions: [
      "product catalog exists",
      "checkout workflow exists",
      "admin inventory role exists"
    ]
  },
  dashboard: {
    productType: "Analytics Dashboard",
    pages: ["Overview", "Reports", "Segments", "Alerts", "Settings"],
    entities: ["Metric", "Report", "Segment", "Alert", "User"],
    roles: ["admin", "analyst", "viewer"],
    businessRules: ["Alerts require a metric threshold.", "Viewer role is read-only."],
    assumptions: [
      "role-based read access exists",
      "metrics are refreshed manually",
      "reports support saved segments"
    ]
  },
  school: {
    productType: "School Management",
    pages: ["Dashboard", "Students", "Attendance", "Fees", "Classes", "Settings"],
    entities: ["Student", "Attendance", "Fee", "Class", "User"],
    roles: ["admin", "teacher", "accountant", "parent"],
    businessRules: ["Attendance must reference a student.", "Fee records must reference a student."],
    assumptions: [
      "student management exists",
      "attendance tracking exists",
      "fee management exists",
      "admin role exists"
    ]
  },
  default: {
    productType: "Web Application",
    pages: ["Dashboard", "Records", "Record Detail", "Reports", "Settings"],
    entities: ["Record", "Project", "Activity", "User"],
    roles: ["admin", "member", "viewer"],
    businessRules: ["Every record must have an owner.", "Viewer role cannot mutate data."],
    assumptions: [
      "authentication enabled",
      "admin role exists",
      "CRUD workflows exist"
    ]
  }
};

const FIELD_TYPES = new Set(["string", "enum", "datetime", "number", "boolean", "date"]);
const AMBIGUOUS_DOMAINS = {
  school: ["Student management?", "Fee management?", "Attendance tracking?"],
  healthcare: ["Patient records?", "Appointment scheduling?", "Billing and insurance?"],
  finance: ["Expense tracking?", "Approval workflows?", "Reporting dashboards?"]
};

function titleCase(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "home";
}

function camelCase(value) {
  const titled = titleCase(value).replace(/[^a-z0-9]/gi, "");
  return titled.charAt(0).toLowerCase() + titled.slice(1);
}

function pluralize(entity) {
  if (entity.endsWith("y")) return `${entity.slice(0, -1).toLowerCase()}ies`;
  if (entity.endsWith("s")) return entity.toLowerCase();
  return `${entity.toLowerCase()}s`;
}

function detectKind(prompt) {
  const lower = prompt.toLowerCase();
  if (/\b(crm|lead|sales|deal|customer relationship)\b/.test(lower)) return "crm";
  if (/\b(ecommerce|e-commerce|shop|store|cart|checkout|payment)\b/.test(lower)) return "ecommerce";
  if (/\b(dashboard|analytics|metric|report|kpi)\b/.test(lower)) return "dashboard";
  if (/\b(school|student|attendance|class|fee)\b/.test(lower)) return "school";
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

function getConfidence(prompt, kind) {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  let score = kind === "default" ? 0.48 : 0.74;
  if (words.length >= 8) score += 0.12;
  if (/\b(auth|login|role|dashboard|report|api|payment|admin|crud)\b/i.test(prompt)) score += 0.08;
  if (/\b(and|with|including|include)\b/i.test(prompt)) score += 0.04;
  if (words.length <= 3) score -= 0.18;
  return Math.max(0.1, Math.min(0.98, Number(score.toFixed(2))));
}

function buildAssumptions(prompt, kind) {
  const stack = KNOWN_STACKS[kind] || KNOWN_STACKS.default;
  const lower = prompt.toLowerCase();
  const base = [
    ...stack.assumptions,
    "local development setup is acceptable",
    "generated output must be deterministic"
  ];

  if (!lower.includes("auth") && !lower.includes("login")) base.push("mock authentication enabled");
  if (!lower.includes("database") && !lower.includes("sql")) base.push("SQL schema generated from entities");

  return [...new Set(base)].map((text, index) => ({
    id: `assumption_${index + 1}`,
    text,
    source: index < stack.assumptions.length ? "domain-default" : "compiler-default",
    confidence: index < stack.assumptions.length ? 0.82 : 0.72
  }));
}

function buildClarifications(prompt, kind, confidence, threshold) {
  const lower = prompt.toLowerCase();
  const questions = [];

  if (confidence < threshold) {
    questions.push("Which users and roles are required?");
    questions.push("Which workflows are mandatory for the first version?");
  }

  if (/\bschool|schools\b/.test(lower)) questions.push(...AMBIGUOUS_DOMAINS.school);
  if (/\bhealth|clinic|hospital\b/.test(lower)) questions.push(...AMBIGUOUS_DOMAINS.healthcare);
  if (/\bfinance|money|expense\b/.test(lower)) questions.push(...AMBIGUOUS_DOMAINS.finance);
  if (!/\b(auth|login|role|user)\b/.test(lower)) questions.push("Should authentication be required?");
  if (kind === "default" && !/\b(api|database|dashboard|crud|report)\b/.test(lower)) questions.push("What data should the system manage?");

  return [...new Set(questions)].map((question, index) => ({
    id: `clarification_${index + 1}`,
    question,
    reason: confidence < threshold ? "low_confidence" : "domain_ambiguity",
    confidence
  }));
}

function extractIntent(prompt, mode) {
  const kind = detectKind(prompt);
  const stack = KNOWN_STACKS[kind] || KNOWN_STACKS.default;
  const lowered = prompt.toLowerCase();

  return {
    appName: extractAppName(prompt, kind),
    productType: stack.productType,
    kind,
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
      endpoints: [`GET /api/${pluralize(entity)}`, `POST /api/${pluralize(entity)}`, `PATCH /api/${pluralize(entity)}/:id`]
    })),
    businessRules: [...stack.businessRules],
    constraints: [
      "Generated output must be executable without hidden services.",
      "Every page must map to data or a documented static purpose.",
      "Every API endpoint must map to an entity."
    ]
  };
}

function buildFields(entity) {
  const fields = [
    { name: "id", type: "string", required: true, source: "compiler" },
    { name: "name", type: "string", required: true, source: "compiler" },
    { name: "status", type: "enum", values: ["active", "paused", "archived"], required: true, source: "compiler" },
    { name: "ownerId", type: "string", required: true, source: "auth" },
    { name: "createdAt", type: "datetime", required: true, source: "compiler" }
  ];

  if (entity === "Payment" || entity === "Fee") fields.push({ name: "amount", type: "number", required: true, source: "domain" });
  if (entity === "Attendance") fields.push({ name: "attendanceDate", type: "date", required: true, source: "domain" });
  if (entity === "User") fields.push({ name: "role", type: "string", required: true, source: "auth" });
  return fields;
}

function planProject(intent, assumptions) {
  const primaryEntities = intent.entities.slice(0, 2);
  const routes = intent.pages.map(page => ({
    page,
    route: `/${slugify(page)}`,
    components: [`${page.replace(/[^a-z0-9]/gi, "")}View`, "ShellNavigation"],
    data: page === "Settings" ? ["User"] : primaryEntities,
    roles: intent.roles
  }));

  const schema = intent.entities.map(entity => ({
    name: entity,
    table: pluralize(entity),
    fields: buildFields(entity),
    relationships: entity === "User" ? [] : [{ field: "ownerId", references: "User.id" }]
  }));

  const api = intent.apiNeeds.map(apiNeed => ({
    entity: apiNeed.entity,
    basePath: `/api/${pluralize(apiNeed.entity)}`,
    endpoints: apiNeed.endpoints.map(endpoint => {
      const [method, route] = endpoint.split(" ");
      return {
        method,
        route,
        entity: apiNeed.entity,
        requestFields: method === "GET" ? [] : ["name", "status", "ownerId"],
        responseFields: ["id", "name", "status", "ownerId", "createdAt"],
        roles: method === "GET" ? intent.roles : intent.roles.filter(role => role !== "viewer" && role !== "parent")
      };
    })
  }));

  return {
    appName: intent.appName,
    stack: {
      frontend: "React",
      backend: "Express",
      storage: "SQL schema",
      auth: "Mock role token"
    },
    systemDesign: {
      ui: {
        framework: "React",
        routes: routes.map(route => ({ path: route.route, component: route.components[0], data: route.data, roles: route.roles }))
      },
      api: {
        framework: "Express",
        endpoints: api.flatMap(group => group.endpoints)
      },
      database: {
        engine: "SQL",
        tables: schema.map(entity => ({ table: entity.table, entity: entity.name, fields: entity.fields }))
      },
      auth: {
        strategy: "mock-role-token",
        roles: intent.roles
      }
    },
    fileTree: [
      "generated-project/frontend/package.json",
      "generated-project/frontend/src/App.jsx",
      "generated-project/frontend/src/main.jsx",
      "generated-project/backend/package.json",
      "generated-project/backend/server.js",
      "generated-project/database/schema.sql",
      "generated-project/docs/README.md"
    ],
    routes,
    schema,
    auth: {
      roles: intent.roles,
      permissions: intent.roles.map((role, index) => ({
        role,
        canRead: true,
        canWrite: index < intent.roles.length - 1 && role !== "viewer" && role !== "parent",
        canAdmin: index === 0
      }))
    },
    api,
    businessRules: intent.businessRules,
    assumptions
  };
}

function makeIssue({ type, severity, layer, path, message, expected = null, actual = null, repairable = true }) {
  return {
    id: `${layer}_${type}_${path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase()}`,
    type,
    severity,
    layer,
    path,
    message,
    expected,
    actual,
    repairable
  };
}

function validateBlueprint(blueprint, strictness = "balanced") {
  const issues = [];
  if (!blueprint) return [makeIssue({ type: "missing_blueprint", severity: "critical", layer: "system", path: "blueprint", message: "Blueprint is required.", repairable: false })];

  if (!blueprint.appName) issues.push(makeIssue({ type: "missing_app_name", severity: "critical", layer: "system", path: "appName", message: "App name is required.", expected: "non-empty string", actual: blueprint.appName }));
  if (!blueprint.routes?.length) issues.push(makeIssue({ type: "missing_routes", severity: "critical", layer: "ui", path: "routes", message: "At least one route is required.", expected: "one or more routes", actual: 0 }));
  if (!blueprint.schema?.length) issues.push(makeIssue({ type: "missing_schema", severity: "critical", layer: "database", path: "schema", message: "At least one entity schema is required.", expected: "one or more schemas", actual: 0 }));

  const schemaNames = new Set((blueprint.schema || []).map(entity => entity.name));
  const tableNames = new Set((blueprint.schema || []).map(entity => entity.table));
  const roleNames = new Set(blueprint.auth?.roles || []);
  const roleUsage = new Set();

  for (const entity of blueprint.schema || []) {
    if (!entity.table) {
      issues.push(makeIssue({ type: "missing_mapping", severity: "high", layer: "database", path: `schema.${entity.name}.table`, message: `${entity.name} has no database table mapping.`, expected: "table name", actual: entity.table }));
    }

    const fieldNames = new Set();
    for (const field of entity.fields || []) {
      if (fieldNames.has(field.name)) {
        issues.push(makeIssue({ type: "orphan_field", severity: "medium", layer: "database", path: `schema.${entity.name}.fields.${field.name}`, message: `${entity.name}.${field.name} is duplicated.`, expected: "unique field", actual: field.name }));
      }
      fieldNames.add(field.name);
      if (!FIELD_TYPES.has(field.type)) {
        issues.push(makeIssue({ type: "schema_mismatch", severity: "high", layer: "database", path: `schema.${entity.name}.fields.${field.name}.type`, message: `${entity.name}.${field.name} has unsupported type.`, expected: [...FIELD_TYPES], actual: field.type }));
      }
    }

    for (const relationship of entity.relationships || []) {
      const [targetEntity, targetField] = String(relationship.references || "").split(".");
      if (!schemaNames.has(targetEntity) || !targetField) {
        issues.push(makeIssue({ type: "broken_reference", severity: "high", layer: "database", path: `schema.${entity.name}.relationships.${relationship.field}`, message: `${entity.name}.${relationship.field} references an unknown schema target.`, expected: "Entity.field reference", actual: relationship.references }));
      }
    }
  }

  for (const route of blueprint.routes || []) {
    if (!route.route || !route.components?.length) {
      issues.push(makeIssue({ type: "missing_mapping", severity: "high", layer: "ui", path: `routes.${route.page}`, message: `${route.page} is missing route or component mapping.`, expected: "route and component", actual: route }));
    }

    for (const entityName of route.data || []) {
      if (!schemaNames.has(entityName)) {
        issues.push(makeIssue({ type: "broken_reference", severity: "high", layer: "ui", path: `routes.${route.page}.data.${entityName}`, message: `${route.page} references unknown data entity ${entityName}.`, expected: [...schemaNames], actual: entityName }));
      }
    }

    for (const role of route.roles || []) {
      roleUsage.add(role);
      if (!roleNames.has(role)) {
        issues.push(makeIssue({ type: "broken_reference", severity: "high", layer: "auth", path: `routes.${route.page}.roles.${role}`, message: `${route.page} references unknown role ${role}.`, expected: [...roleNames], actual: role }));
      }
    }
  }

  for (const group of blueprint.api || []) {
    if (!schemaNames.has(group.entity)) {
      issues.push(makeIssue({ type: "orphan_endpoint", severity: "high", layer: "api", path: `api.${group.entity}`, message: `${group.entity} API has no matching schema.`, expected: [...schemaNames], actual: group.entity }));
    }

    for (const endpoint of group.endpoints || []) {
      if (!endpoint.route?.startsWith("/api/")) {
        issues.push(makeIssue({ type: "missing_mapping", severity: "high", layer: "api", path: `api.${group.entity}.${endpoint.method}`, message: `${group.entity} endpoint has invalid route.`, expected: "/api/*", actual: endpoint.route }));
      }
      if (!tableNames.has(pluralize(group.entity))) {
        issues.push(makeIssue({ type: "missing_mapping", severity: "high", layer: "api", path: `api.${group.entity}.table`, message: `${group.entity} endpoint has no database table mapping.`, expected: pluralize(group.entity), actual: [...tableNames] }));
      }

      const entity = (blueprint.schema || []).find(item => item.name === group.entity);
      const fieldNames = new Set((entity?.fields || []).map(field => field.name));
      for (const field of [...(endpoint.requestFields || []), ...(endpoint.responseFields || [])]) {
        if (!fieldNames.has(field)) {
          issues.push(makeIssue({ type: "orphan_field", severity: "medium", layer: "api", path: `api.${group.entity}.${endpoint.method}.${field}`, message: `${endpoint.method} ${endpoint.route} references missing field ${field}.`, expected: [...fieldNames], actual: field }));
        }
      }

      for (const role of endpoint.roles || []) {
        roleUsage.add(role);
        if (!roleNames.has(role)) {
          issues.push(makeIssue({ type: "broken_reference", severity: "high", layer: "auth", path: `api.${group.entity}.${endpoint.method}.roles.${role}`, message: `${endpoint.method} ${endpoint.route} references unknown role ${role}.`, expected: [...roleNames], actual: role }));
        }
      }
    }
  }

  for (const permission of blueprint.auth?.permissions || []) {
    roleUsage.add(permission.role);
    if (!roleNames.has(permission.role)) {
      issues.push(makeIssue({ type: "broken_reference", severity: "high", layer: "auth", path: `auth.permissions.${permission.role}`, message: `Permission references unknown role ${permission.role}.`, expected: [...roleNames], actual: permission.role }));
    }
  }

  for (const role of roleNames) {
    if (!roleUsage.has(role)) {
      issues.push(makeIssue({ type: "unused_role", severity: strictness === "strict" ? "medium" : "low", layer: "auth", path: `auth.roles.${role}`, message: `${role} is defined but not used by UI, API, or permissions.`, expected: "role is referenced", actual: "unused" }));
    }
  }

  return issues;
}

function addField(entity, fieldName) {
  const exists = entity.fields.some(field => field.name === fieldName);
  if (!exists) entity.fields.push({ name: fieldName, type: "string", required: false, source: "repair" });
}

function repairBlueprint(blueprint, issues) {
  const repairs = [];
  const getEntity = name => blueprint.schema.find(entity => entity.name === name);

  for (const issue of issues) {
    const beforeCount = JSON.stringify(blueprint).length;
    let action = null;
    let targetPath = issue.path;

    if (issue.type === "missing_app_name") {
      blueprint.appName = "Generated Application";
      action = "set_fallback_app_name";
    } else if (issue.type === "missing_routes") {
      blueprint.routes.push({ page: "Dashboard", route: "/dashboard", components: ["DashboardView"], data: [], roles: blueprint.auth.roles });
      action = "add_default_route";
    } else if (issue.type === "missing_schema") {
      blueprint.schema.push({ name: "Record", table: "records", fields: buildFields("Record"), relationships: [] });
      action = "add_default_schema";
    } else if (issue.type === "orphan_endpoint") {
      const entityName = issue.actual;
      blueprint.schema.push({ name: entityName, table: pluralize(entityName), fields: buildFields(entityName), relationships: [] });
      action = "add_schema_for_endpoint";
    } else if (issue.type === "orphan_field" && issue.layer === "api") {
      const match = issue.path.match(/^api\.([^.]+)\./);
      const entity = match ? getEntity(match[1]) : null;
      if (entity) {
        addField(entity, issue.actual);
        action = "add_missing_api_field_to_schema";
        targetPath = `schema.${entity.name}.fields.${issue.actual}`;
      }
    } else if (issue.type === "unused_role") {
      const role = String(issue.path.split(".").pop());
      blueprint.auth.roles = blueprint.auth.roles.filter(item => item !== role);
      blueprint.auth.permissions = blueprint.auth.permissions.filter(permission => permission.role !== role);
      action = "remove_unused_role";
    } else if (issue.type === "broken_reference" && issue.layer === "ui") {
      const routeName = issue.path.split(".")[1];
      const route = blueprint.routes.find(item => item.page === routeName);
      if (route) {
        route.data = route.data.filter(entityName => blueprint.schema.some(entity => entity.name === entityName));
        action = "remove_unknown_route_data_reference";
      }
    } else if (issue.type === "broken_reference" && issue.layer === "database") {
      const [targetEntity] = String(issue.actual || "").split(".");
      if (targetEntity && !blueprint.schema.some(entity => entity.name === targetEntity)) {
        blueprint.schema.push({ name: targetEntity, table: pluralize(targetEntity), fields: buildFields(targetEntity), relationships: [] });
        action = "add_referenced_schema";
        targetPath = `schema.${targetEntity}`;
      }
    } else if (issue.type === "broken_reference" && issue.layer === "auth") {
      const invalidRole = issue.actual;
      for (const route of blueprint.routes) route.roles = (route.roles || []).filter(role => role !== invalidRole);
      for (const group of blueprint.api) {
        for (const endpoint of group.endpoints) endpoint.roles = (endpoint.roles || []).filter(role => role !== invalidRole);
      }
      blueprint.auth.permissions = blueprint.auth.permissions.filter(permission => permission.role !== invalidRole);
      action = "remove_unknown_role_reference";
    } else if (issue.type === "missing_mapping" && issue.layer === "database") {
      const entityName = issue.path.split(".")[1];
      const entity = getEntity(entityName);
      if (entity) {
        entity.table = pluralize(entity.name);
        action = "add_database_table_mapping";
      }
    }

    if (action && JSON.stringify(blueprint).length !== beforeCount) {
      repairs.push({
        id: `repair_${repairs.length + 1}`,
        issueId: issue.id,
        type: issue.type,
        layer: issue.layer,
        targetPath,
        action,
        count: 1
      });
    }
  }

  return repairs;
}

function verifyRuntime(blueprint) {
  const checks = [];
  const schemaNames = new Set(blueprint.schema.map(entity => entity.name));
  const roles = new Set(blueprint.auth.roles);

  for (const route of blueprint.routes) {
    checks.push({
      type: "route_registration",
      target: route.route,
      status: route.route.startsWith("/") && route.components.length ? "pass" : "fail"
    });
  }

  for (const group of blueprint.api) {
    for (const endpoint of group.endpoints) {
      checks.push({
        type: "api_registration",
        target: `${endpoint.method} ${endpoint.route}`,
        status: endpoint.route.startsWith("/api/") && schemaNames.has(endpoint.entity) ? "pass" : "fail"
      });
    }
  }

  for (const entity of blueprint.schema) {
    checks.push({
      type: "database_schema_creation",
      target: entity.table,
      status: entity.table && entity.fields.some(field => field.name === "id") ? "pass" : "fail"
    });
  }

  for (const permission of blueprint.auth.permissions) {
    checks.push({
      type: "permission_check",
      target: permission.role,
      status: roles.has(permission.role) && permission.canRead === true ? "pass" : "fail"
    });
  }

  const failed = checks.filter(check => check.status === "fail");
  return {
    status: failed.length ? "fail" : "pass",
    checks,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length
    }
  };
}

function sqlType(field) {
  if (field.type === "number") return "NUMERIC";
  if (field.type === "boolean") return "BOOLEAN";
  if (field.type === "datetime" || field.type === "date") return "TEXT";
  return "TEXT";
}

function generatedSql(blueprint) {
  return blueprint.schema.map(entity => {
    const columns = entity.fields.map(field => `  ${field.name} ${sqlType(field)}${field.required ? " NOT NULL" : ""}`);
    return `CREATE TABLE ${entity.table} (\n${columns.join(",\n")},\n  PRIMARY KEY (id)\n);`;
  }).join("\n\n");
}

function generatedFrontendApp(blueprint) {
  const routes = blueprint.routes.map(route => ({
    path: route.route,
    label: route.page,
    component: route.components[0],
    data: route.data
  }));

  return `import React, { useMemo, useState } from "react";

const routes = ${JSON.stringify(routes, null, 2)};
const appName = ${JSON.stringify(blueprint.appName)};

export default function App() {
  const [activePath, setActivePath] = useState(routes[0].path);
  const active = useMemo(() => routes.find(route => route.path === activePath) || routes[0], [activePath]);

  return (
    <main className="shell">
      <aside className="nav">
        <h1>{appName}</h1>
        {routes.map(route => (
          <button key={route.path} onClick={() => setActivePath(route.path)} className={route.path === activePath ? "active" : ""}>
            {route.label}
          </button>
        ))}
      </aside>
      <section className="workspace">
        <p className="eyebrow">Generated React frontend</p>
        <h2>{active.label}</h2>
        <p>Data sources: {active.data.length ? active.data.join(", ") : "static page"}</p>
      </section>
    </main>
  );
}
`;
}

function generatedFrontendCss() {
  return `body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #18202a; background: #f5f7fa; }
.shell { min-height: 100vh; display: grid; grid-template-columns: 280px 1fr; }
.nav { padding: 24px; background: white; border-right: 1px solid #d9e0e7; display: grid; align-content: start; gap: 10px; }
.nav h1 { font-size: 20px; margin: 0 0 18px; }
.nav button { min-height: 40px; border: 1px solid #d9e0e7; border-radius: 8px; background: white; text-align: left; padding: 0 12px; cursor: pointer; }
.nav button.active { border-color: #0f766e; color: #0f766e; font-weight: 800; }
.workspace { padding: 32px; }
.eyebrow { color: #5d6b78; text-transform: uppercase; font-size: 13px; font-weight: 800; }
`;
}

function generatedBackend(blueprint) {
  const endpoints = blueprint.api.flatMap(group => group.endpoints.map(endpoint => ({ ...endpoint, group: group.entity })));
  return `const express = require("express");
const app = express();
const port = Number(process.env.PORT || 3000);
const endpoints = ${JSON.stringify(endpoints, null, 2)};

app.use(express.json());

function requireRole(allowed) {
  return (req, res, next) => {
    const role = req.headers["x-role"] || "viewer";
    if (!allowed.includes(role)) return res.status(403).json({ error: "forbidden", role });
    next();
  };
}

for (const endpoint of endpoints) {
  const method = endpoint.method.toLowerCase();
  app[method](endpoint.route.replace(":id", ":id"), requireRole(endpoint.roles), (req, res) => {
    res.json({
      entity: endpoint.entity,
      method: endpoint.method,
      route: endpoint.route,
      request: req.body,
      fields: endpoint.responseFields
    });
  });
}

app.get("/health", (req, res) => res.json({ status: "ok", app: ${JSON.stringify(blueprint.appName)} }));
app.listen(port, () => console.log("Backend running on http://localhost:" + port));
`;
}

function generatedProjectReadme(blueprint, runtimeReport) {
  return `# ${blueprint.appName}

Generated by AI Software Compiler.

## Structure

- \`frontend/\`: React app
- \`backend/\`: Express API
- \`database/\`: SQL schema
- \`docs/\`: project documentation

## Run

\`\`\`bash
cd backend
npm install
npm start
\`\`\`

In another terminal:

\`\`\`bash
cd frontend
npm install
npm start
\`\`\`

## Runtime Verification

- Status: ${runtimeReport.status}
- Checks: ${runtimeReport.summary.passed}/${runtimeReport.summary.total} passed
`;
}

function buildFiles(blueprint, runtimeReport) {
  const schemaJson = JSON.stringify(blueprint.schema, null, 2);
  const configJson = JSON.stringify({ appName: blueprint.appName, routes: blueprint.routes, auth: blueprint.auth }, null, 2);

  return [
    { path: "generated-project/docs/README.md", language: "markdown", content: generatedProjectReadme(blueprint, runtimeReport) },
    { path: "generated-project/docs/blueprint.json", language: "json", content: JSON.stringify(blueprint, null, 2) },
    { path: "generated-project/frontend/package.json", language: "json", content: JSON.stringify({ scripts: { start: "vite --host 0.0.0.0" }, dependencies: { "@vitejs/plugin-react": "latest", vite: "latest", react: "latest", "react-dom": "latest" }, devDependencies: {} }, null, 2) },
    { path: "generated-project/frontend/index.html", language: "html", content: '<!doctype html><html><head><title>Generated Project</title><script type="module" src="/src/main.jsx"></script></head><body><div id="root"></div></body></html>' },
    { path: "generated-project/frontend/src/main.jsx", language: "javascript", content: 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")).render(<App />);\n' },
    { path: "generated-project/frontend/src/App.jsx", language: "javascript", content: generatedFrontendApp(blueprint) },
    { path: "generated-project/frontend/src/styles.css", language: "css", content: generatedFrontendCss() },
    { path: "generated-project/backend/package.json", language: "json", content: JSON.stringify({ scripts: { start: "node server.js" }, dependencies: { express: "latest" }, devDependencies: {} }, null, 2) },
    { path: "generated-project/backend/server.js", language: "javascript", content: generatedBackend(blueprint) },
    { path: "generated-project/database/schema.sql", language: "sql", content: generatedSql(blueprint) },
    { path: "generated-project/database/schema.json", language: "json", content: schemaJson },
    { path: "generated-project/docs/config.json", language: "json", content: configJson },
    { path: "generated-project/docs/runtime-report.json", language: "json", content: JSON.stringify(runtimeReport, null, 2) }
  ];
}

function buildGeneration({ prompt, strictness = "balanced", mode = "web-app", confidenceThreshold = 0.7 }) {
  const trimmed = String(prompt || "").trim();
  const threshold = Number.isFinite(Number(confidenceThreshold)) ? Number(confidenceThreshold) : 0.7;

  if (!trimmed) {
    return {
      status: "needs_input",
      intent: null,
      assumptions: [],
      blueprint: null,
      files: [],
      issues: [makeIssue({ type: "empty_prompt", severity: "critical", layer: "intent", path: "prompt", message: "Describe the software you want to generate.", repairable: false })],
      validation: { initialIssues: [], remainingIssues: [] },
      repairs: [],
      repairSummary: { total: 0, byType: {} },
      clarifyingQuestions: [
        { id: "clarification_1", question: "What product should be generated?", reason: "empty_prompt", confidence: 0 },
        { id: "clarification_2", question: "Who are the users?", reason: "empty_prompt", confidence: 0 },
        { id: "clarification_3", question: "Which workflows are mandatory?", reason: "empty_prompt", confidence: 0 }
      ],
      runtimeReport: { status: "not_run", checks: [], summary: { total: 0, passed: 0, failed: 0 } },
      confidence: 0
    };
  }

  const kind = detectKind(trimmed);
  const confidence = getConfidence(trimmed, kind);
  const assumptions = buildAssumptions(trimmed, kind);
  const clarifyingQuestions = buildClarifications(trimmed, kind, confidence, threshold);
  const intent = extractIntent(trimmed, mode);
  const blueprint = planProject(intent, assumptions);
  const initialIssues = validateBlueprint(blueprint, strictness);
  const repairs = repairBlueprint(blueprint, initialIssues.filter(issue => issue.repairable));
  const remainingIssues = validateBlueprint(blueprint, strictness);
  const blockingIssues = remainingIssues.filter(issue => issue.severity === "critical" || issue.severity === "high");
  const runtimeReport = verifyRuntime(blueprint);
  const files = buildFiles(blueprint, runtimeReport);
  const repairSummary = repairs.reduce((summary, repair) => {
    summary.total += repair.count;
    summary.byType[repair.type] = (summary.byType[repair.type] || 0) + repair.count;
    return summary;
  }, { total: 0, byType: {} });

  return {
    status: blockingIssues.length || runtimeReport.status === "fail" ? "blocked" : "ready",
    intent,
    assumptions,
    blueprint,
    files,
    issues: remainingIssues,
    validation: { initialIssues, remainingIssues },
    repairs,
    repairSummary,
    clarifyingQuestions,
    runtimeReport,
    confidence
  };
}

module.exports = {
  buildGeneration,
  validateBlueprint,
  repairBlueprint,
  verifyRuntime,
  buildFiles,
  buildAssumptions,
  buildClarifications
};
