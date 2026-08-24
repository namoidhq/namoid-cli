import { createHash } from "node:crypto";
import {
  createProject,
  createWorkspace,
  listEnvironments,
  listProjects,
  listWorkspaces,
} from "./api.js";

const CREATE_NEW = "__create_new__";

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (!slug) return "application";
  return slug.length === 1 ? `${slug}-app` : slug;
}

function workspaceCreationKey(workspaceName, projectName) {
  const digest = createHash("sha256")
    .update(JSON.stringify({ workspaceName, projectName, region: "in" }))
    .digest("hex");
  return `namoid-cli-workspace-${digest}`;
}

function active(rows) {
  return rows.filter((row) => row.status === undefined || row.status === "active");
}

function findRequested(rows, id, kind) {
  const selected = rows.find((row) => row.id === id);
  if (!selected) throw new Error(`The selected ${kind} is unavailable or you do not have access.`);
  return selected;
}

async function createWorkspaceTarget(config, prompt, suggestedProjectName, requestOptions) {
  const workspaceName = await prompt.text("Workspace name (your company or team)", "My workspace");
  const projectName = await prompt.text("Project name", suggestedProjectName);
  const created = await createWorkspace(
    config,
    { workspace_name: workspaceName, project_name: projectName, region: "in" },
    workspaceCreationKey(workspaceName, projectName),
    requestOptions,
  );
  return {
    tenantId: created.workspace.id,
    projectId: created.project.id,
    environmentId: created.test_environment.id,
    labels: {
      workspace: created.workspace.name,
      project: created.project.name,
      environment: created.test_environment.display_name,
    },
    created: { workspace: true, project: true },
  };
}

export async function resolveInitTarget(config, requested, options) {
  const { prompt, suggestedProjectName, accessToken } = options;
  const requestOptions = { accessToken, fetchImpl: options.fetchImpl };
  const workspaces = active(await listWorkspaces(config, requestOptions)).filter(
    (workspace) => workspace.identity_type === "customer_identity",
  );

  let workspace;
  if (requested.tenantId) {
    workspace = findRequested(workspaces, requested.tenantId, "workspace");
  } else {
    const workspaceId = await prompt.select(
      "Choose a workspace",
      [
        ...workspaces.map((item) => ({
          value: item.id,
          label: `${item.name} (${item.slug})`,
        })),
        { value: CREATE_NEW, label: "Create a new workspace" },
      ],
    );
    if (workspaceId === CREATE_NEW) {
      return createWorkspaceTarget(config, prompt, suggestedProjectName, requestOptions);
    }
    workspace = findRequested(workspaces, workspaceId, "workspace");
  }

  const projects = active(await listProjects(config, workspace.id, requestOptions));
  let project;
  let projectWasCreated = false;
  if (requested.projectId) {
    project = findRequested(projects, requested.projectId, "project");
  } else {
    const projectId = await prompt.select(
      `Choose a project in ${workspace.name}`,
      [
        ...projects.map((item) => ({ value: item.id, label: `${item.name} (${item.slug})` })),
        { value: CREATE_NEW, label: "Create a new project" },
      ],
    );
    if (projectId === CREATE_NEW) {
      const projectName = await prompt.text("Project name", suggestedProjectName);
      project = await createProject(
        config,
        workspace.id,
        { name: projectName, slug: slugify(projectName), description: null },
        requestOptions,
      );
      projectWasCreated = true;
    } else {
      project = findRequested(projects, projectId, "project");
    }
  }

  const environments = active(
    await listEnvironments(
      config,
      { tenantId: workspace.id, projectId: project.id },
      requestOptions,
    ),
  ).sort((left, right) => Number(right.slug === "test") - Number(left.slug === "test"));
  if (environments.length === 0) throw new Error("The selected project has no active environments.");

  let environment;
  if (requested.environmentId) {
    environment = findRequested(environments, requested.environmentId, "environment");
  } else if (environments.length === 1) {
    [environment] = environments;
    prompt.note(`Using ${environment.display_name} environment.`);
  } else {
    const environmentId = await prompt.select(
      `Choose an environment in ${project.name}`,
      environments.map((item) => ({
        value: item.id,
        label: `${item.display_name} (${item.environment_type})`,
      })),
    );
    environment = findRequested(environments, environmentId, "environment");
  }

  return {
    tenantId: workspace.id,
    projectId: project.id,
    environmentId: environment.id,
    labels: {
      workspace: workspace.name,
      project: project.name,
      environment: environment.display_name,
    },
    created: { workspace: false, project: projectWasCreated },
  };
}

export { slugify };
