/**
 * Points a Railway PR environment's services at a per-PR Neon branch.
 *
 * Railway clones variables from the base environment when it creates a PR
 * environment, which means the preview boots with production's DATABASE_URL and
 * would write to the production read-model. This script overwrites that
 * variable with the PR's Neon branch connection string and redeploys the
 * affected services so the change takes effect.
 *
 * Env:
 *   RAILWAY_API_TOKEN  account-level token (Authorization: Bearer)
 *   RAILWAY_PROJECT_ID standard-reader project id
 *   DATABASE_URL       Neon branch connection string to install
 *   PR_BRANCH          git head branch of the PR (Railway names envs after it)
 *   PR_NUMBER          PR number, used as a fallback env-name match
 *   SERVICES           comma-separated service names to update (default: web)
 */

const API = "https://backboard.railway.com/graphql/v2";

const {
  RAILWAY_API_TOKEN,
  RAILWAY_PROJECT_ID,
  DATABASE_URL,
  PR_BRANCH,
  PR_NUMBER,
  SERVICES = "web",
} = process.env;

for (const [name, value] of Object.entries({
  RAILWAY_API_TOKEN,
  RAILWAY_PROJECT_ID,
  DATABASE_URL,
  PR_BRANCH,
  PR_NUMBER,
})) {
  if (!value) throw new Error(`${name} is required`);
}

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(
      `Railway API error (${res.status}): ${JSON.stringify(
        body.errors ?? body,
      )}`,
    );
  }
  return body.data;
}

const ENVIRONMENTS = `
  query ($projectId: String!) {
    environments(projectId: $projectId) {
      edges { node { id name } }
    }
  }
`;

const SERVICES_QUERY = `
  query ($projectId: String!) {
    project(id: $projectId) {
      services { edges { node { id name } } }
    }
  }
`;

const VARIABLES = `
  query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
    variables(
      projectId: $projectId
      environmentId: $environmentId
      serviceId: $serviceId
    )
  }
`;

const DEPLOYMENTS = `
  query ($input: DeploymentListInput!) {
    deployments(input: $input, first: 1) {
      edges { node { id status } }
    }
  }
`;

const UPSERT = `
  mutation ($input: VariableUpsertInput!) {
    variableUpsert(input: $input)
  }
`;

const REDEPLOY = `
  mutation ($serviceId: String!, $environmentId: String!) {
    serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
  }
`;

/**
 * Railway creates the PR environment asynchronously off the GitHub webhook, so
 * it may not exist yet when this job runs. Poll rather than racing it.
 */
async function findPrEnvironment() {
  // Railway names PR environments `<project>-pr-<number>`. The head branch and
  // bare `pr-<number>` are kept as fallbacks in case that convention shifts.
  const candidates = [
    `standard-reader-pr-${PR_NUMBER}`,
    `pr-${PR_NUMBER}`,
    PR_BRANCH,
  ];

  for (let attempt = 1; attempt <= 10; attempt++) {
    const data = await gql(ENVIRONMENTS, { projectId: RAILWAY_PROJECT_ID });
    const envs = data.environments.edges.map((e) => e.node);
    const match = envs.find((e) => candidates.includes(e.name));
    if (match) return match;

    console.log(
      `PR environment not found yet (attempt ${attempt}/10). ` +
        `Looking for one of ${candidates.join(", ")}; ` +
        `saw: ${envs.map((e) => e.name).join(", ")}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  return null;
}

/**
 * A redeploy issued while Railway's own deploy is still building supersedes it,
 * and Railway reports the superseded deployment to GitHub as a *failed* check
 * even though nothing was wrong with it. Wait for whatever is in flight to
 * settle before replacing it.
 *
 * Best-effort: if the status can't be read, proceed anyway rather than blocking
 * the correction. A noisy check is better than a preview left on the prod DB.
 */
async function waitForIdle(environmentId, serviceId, serviceName) {
  const TERMINAL = new Set([
    "SUCCESS",
    "FAILED",
    "CRASHED",
    "REMOVED",
    "SKIPPED",
  ]);

  for (let attempt = 1; attempt <= 40; attempt++) {
    let status;
    try {
      const data = await gql(DEPLOYMENTS, {
        input: { projectId: RAILWAY_PROJECT_ID, environmentId, serviceId },
      });
      status = data.deployments.edges[0]?.node?.status;
    } catch (error) {
      console.log(
        `Could not read ${serviceName} deploy status: ${error.message}`,
      );
      return;
    }

    if (!status || TERMINAL.has(status)) return;

    console.log(
      `${serviceName} deployment is ${status}; waiting before redeploy ` +
        `(attempt ${attempt}/40)`,
    );
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  console.log(`${serviceName} never went idle; redeploying anyway.`);
}

const environment = await findPrEnvironment();

if (environment) {
  console.log(`Found Railway PR environment: ${environment.name}`);

  const { project } = await gql(SERVICES_QUERY, {
    projectId: RAILWAY_PROJECT_ID,
  });
  const allServices = project.services.edges.map((e) => e.node);
  const wanted = SERVICES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const targets = wanted.map((name) => {
    const service = allServices.find((s) => s.name === name);
    if (!service) {
      throw new Error(
        `Service "${name}" not found in project. ` +
          `Available: ${allServices.map((s) => s.name).join(", ")}`,
      );
    }
    return service;
  });

  for (const service of targets) {
    // Every push to the PR re-runs this job, but the branch URL is stable, so
    // after the first run there is nothing to change. Skipping keeps later
    // pushes from redeploying — and superseding — Railway's own deploys.
    let current;
    try {
      const data = await gql(VARIABLES, {
        projectId: RAILWAY_PROJECT_ID,
        environmentId: environment.id,
        serviceId: service.id,
      });
      current = data.variables?.DATABASE_URL;
    } catch (error) {
      // Degrade to always writing rather than failing outright.
      console.log(`Could not read ${service.name} variables: ${error.message}`);
    }

    if (current === DATABASE_URL) {
      console.log(`${service.name} already points at the branch; skipping.`);
      continue;
    }

    await gql(UPSERT, {
      input: {
        projectId: RAILWAY_PROJECT_ID,
        environmentId: environment.id,
        serviceId: service.id,
        name: "DATABASE_URL",
        value: DATABASE_URL,
      },
    });
    console.log(`Set DATABASE_URL on ${service.name}`);

    await waitForIdle(environment.id, service.id, service.name);

    await gql(REDEPLOY, {
      serviceId: service.id,
      environmentId: environment.id,
    });
    console.log(`Redeployed ${service.name}`);
  }
} else {
  // Not fatal: PR environments may be disabled for this PR, and failing CI over
  // a missing preview would be noise. The Neon branch still exists.
  console.log(
    "No Railway PR environment found after polling — skipping DB wiring.",
  );
}
