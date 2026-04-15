# nodered-orcamentos

Node-RED flows for the **Orcamentos** module (Module F) of the Supabase migration project.

## Scope
This repo holds Node-RED flows migrated from Power Automate for Module F (Sales/Orcamentos). Entities in scope include `orcamento`, `orcamentoitem`, `credito`, `clicksign`, PDF generation, and publicar pedido operations.

## Instances
- **DEV** — `https://dev-nodered-orcamentos.unium.me` (TrueNAS app `dev-nodered-orcamentos`, port 1899, container `ix-dev-nodered-orcamentos-node-red-1`, `NODE_RED_ENV=dev`)
- **PROD** — not yet provisioned (will be created in a future session)

## Deploy workflow
Git is the source of truth. Standard flow:
1. Edit `flows.json` locally
2. `git add`, `git commit`, `git push`
3. Projects API pull on DEV via Node-RED Projects API
4. `POST /flows` with `Node-RED-Deployment-Type: reload`

Use the `agent-nodered` (via `/nodered`) for deploys.

## Environment guard
Flows with production side effects must include the `NODE_RED_ENV` guard and a `Manual Test (DEV)` inject with `msg.devBypass=true`.

## Related
- Supabase migration roadmap: `.memory/project_supabase_migration_roadmap.md`
- Entity registry: `src/config/entityRegistry.ts`
- Dataverse metadata: `DATAVERSE_METADATA.md`
- Spec: `.claude/plans/specs/2026-04-15-migrate-module-f-flows.md`
