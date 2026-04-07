# Agent AI Services - Dashboard

## Project Overview

A monitoring dashboard for AI agent executions, built with React 19 + TypeScript + Vite 6. The API backend uses Azure Functions (Node.js) integrated into Azure Static Web Apps.

## Tech Stack

- **Frontend**: React 19, TypeScript 5.7, Vite 6, Tailwind CSS 3, Lucide React icons
- **Data**: @tanstack/react-query for server state, recharts for charts
- **Routing**: react-router-dom v7
- **API Backend**: Azure Functions v4 (Node.js, `api/` folder) with tedious for SQL
- **Database**: Azure SQL (SQL Server) - `sqlserver-agent-ai-services-qualitahub.database.windows.net` / `db-agent-ai-services-qualitahub`
- **Hosting**: Azure Static Web Apps (SWA) with integrated API

## Project Structure

```
/                          Root (Vite frontend)
├── src/
│   ├── api/client.ts      API fetch client
│   ├── auth/              Simulated Entra ID auth (v1)
│   ├── components/        Layout, shared components
│   ├── lib/utils.ts       cn(), formatDuration(), formatDate(), statusColor()
│   ├── pages/             Page-level components
│   ├── types.ts           All TypeScript interfaces (camelCase API responses)
│   ├── App.tsx            Route definitions
│   └── main.tsx           Entry point
├── api/                   Azure Functions backend
│   ├── src/
│   │   ├── db.ts          Database connection (tedious)
│   │   └── functions.ts   All HTTP function endpoints
│   ├── host.json
│   ├── local.settings.json
│   └── package.json
├── staticwebapp.config.json
├── tailwind.config.js
└── vite.config.ts
```

## Database Schema

12 tables: Agent, AgentStep, StepCatalog, Execution, ExecutionStep, ExecutionLog, Input, Output, DataType, StatusCatalog, StorageProviderCatalog, UserAgentAccess.

Key relationships:
- Execution.AgentId -> Agent.Id
- Execution.OverallStatus -> StatusCatalog.Id (PENDING/RUNNING/SUCCESS/FAILED/WARNING/SKIPPED)
- ExecutionStep.AgentStepId -> AgentStep.Id, ExecutionStep.StatusId -> StatusCatalog.Id
- Input.InputType -> DataType.Id, Output.OutputType -> DataType.Id
- ExecutionLog.ExecutionId -> Execution.Id, ExecutionLog.StepId -> ExecutionStep.Id

All tables use `BIGINT IDENTITY` PKs, audit columns (CreatedAtUtc, CreatedBy, UpdatedAtUtc, UpdatedBy, RowVersion).

## API Endpoints

All endpoints are under `/api/`:
- `GET /api/dashboard/stats` - KPIs and execution counts by agent
- `GET /api/agents` - List all agents
- `GET /api/agents/{id}` - Agent details
- `GET /api/executions?page=&pageSize=&status=&search=&agentId=` - Paginated executions
- `GET /api/executions/{id}` - Execution detail with steps, inputs, outputs, logs

API returns camelCase JSON. Status codes are mapped from DB codes (SUCCESS -> "Completed", FAILED -> "Failed", etc.).

## Coding Conventions

- Use functional React components with hooks
- Path alias `@/` maps to `src/`
- Use `cn()` for conditional class merging (clsx + tailwind-merge)
- Enterprise style: no emojis, use Lucide React icons (formal, professional)
- No legacy branding - project is titled "Agent AI Services"
- Auth is simulated in v1 (demo users: admin@agentai.demo / viewer@agentai.demo, password: demo123)
- API backend uses tedious (raw SQL queries, not an ORM)
- Use parameterized queries for all SQL (prevent injection)

## Azure Resources

- Resource group: `rg-agent-ai-services-qualitahub` (swedencentral)
- SQL Server: `sqlserver-agent-ai-services-qualitahub.database.windows.net`
- Database: `db-agent-ai-services-qualitahub` (Basic tier, 5 DTU)
- SWA: To be created as `swa-agent-ai-services-qualitahub`

## Development

```bash
# Frontend dev
npm install
npm run dev

# API dev (requires Azure Functions Core Tools)
cd api
npm install
npm run start

# Build
npm run build        # Frontend
cd api && npm run build  # API
```

## Future (v2+)

- Real Microsoft Entra ID authentication with App Roles (admin/viewer)
- UserAgentAccess table for per-agent permissions
- File attachment handling (Input/Output file downloads)
- Trend charts and time-series analytics
