# Module Context SQLite Storage

## Decision

YouthLM's Hackathon MVP stores completed, partial, and blocked
`AnalysisResult` objects in a local SQLite database. This implements the
existing Contract v0 `ModuleContext` semantics without adding or changing a
public request or response field.

The default database path is `var/youthlm.sqlite3`. It can be changed with
`YOUTHLM_SQLITE_PATH`. SQLite database and sidecar files are gitignored and must
not be committed. An in-memory implementation exists only as an isolated test
double; the runtime default remains SQLite.

The repository Docker image overrides the database path to
`/data/youthlm.sqlite3` and stores generated PPTX files in `/data/artifacts`.
`/data` must be mounted on storage that survives container recreation. A writable
image layer, container filesystem, or ephemeral task disk does not satisfy this
requirement.

## Project isolation

The database primary key is:

```text
(project_id, module_id)
```

Every upstream lookup supplies both values. A request from `project_b` asking
for `analysis_1` cannot see `project_a/analysis_1`; it receives the same
structured `module_not_found` response as any other missing module. Module IDs
are opaque and are not parsed to infer ownership.

## Request lifecycle

For `POST /v1/analysis`, the API:

1. resolves every `upstream_module_id` within the request's `project_id`;
2. returns HTTP 404 with only the unresolved IDs when any are missing;
3. converts stored results to Contract-valid `ModuleContext` objects;
4. supplies those structured contexts to the existing Research Agent;
5. builds and validates the new `AnalysisResult`;
6. persists the new result before returning HTTP 200.

The Agent never guesses what an upstream module contained. The context includes
the prior question, status, sources, filters, dimensions, result records,
summary, warnings, provenance, and dataset versions. Canvas position and other
frontend state are not stored.

If storage cannot be read or written, the API returns HTTP 500 with the shared
`internal_error` payload. It does not return an analysis that was not persisted.

`GET /ready` performs a status-only writability probe for the SQLite parent and
artifact directory. It does not reveal paths and cannot prove that the directory
is backed by persistent storage. Deployment configuration and a restart test must
prove that separately.

## Single-container deployment constraint

While this SQLite store and the local PPTX artifact store remain in use, run one
Uvicorn worker and one application replica. Do not enable autoscaling or point
multiple containers at the same SQLite file. The repository `Dockerfile` already
starts one worker, but the AWS service must also keep the replica count at one.

Before accepting a deployment:

1. create an analysis and a presentation through the deployed API;
2. record their opaque IDs only in the private test session;
3. recreate the container without deleting or replacing the `/data` volume;
4. resolve the stored analysis as upstream context and download the existing PPTX;
5. fail the deployment if either lookup is unavailable.

For a fixed EC2 Docker host, a named Docker volume or tested persistent block
volume can satisfy the demo constraint. Other AWS runtimes require a storage
adapter or a separately verified persistent volume; do not assume task-local
storage survives replacement.

## Scope

This checkpoint intentionally does not add:

- a managed or remote database;
- project-uploaded source storage;
- user authentication or authorization;
- Canvas layout persistence;
- Assistant conversation history;
- automatic dependency graph construction.

Authentication and multi-machine deployment require a later storage adapter.
The `ModuleStore` protocol keeps that replacement separate from the Agent and
public Contract v0 models.
