export interface Agent {
  agentId: number
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  categoryName: string | null
  version: string | null
  configJson: string | null
}

export interface Execution {
  executionId: number
  executionGuid: string
  agentId: number
  agentName: string
  status: string
  triggerSource: string | null
  invokedBy: string | null
  startTime: string | null
  finishTime: string | null
  durationSeconds: number | null
  stepCount: number
  errorMessage: string | null
  emailSubject: string | null
  inputCount: number
  outputCount: number
  inputs: InputSummary[]
  outputs: OutputSummary[]
}

export interface InputSummary {
  inputId: number
  inputType: string
  fileName: string | null
  mimeType: string | null
  filePath: string | null
}

export interface OutputSummary {
  outputId: number
  outputType: string
  fileName: string | null
  mimeType: string | null
  filePath: string | null
}

export interface ExecutionStep {
  stepId: number
  stepOrder: number
  stepName: string
  status: string
  description: string | null
  startTime: string | null
  finishTime: string | null
  durationSeconds: number | null
  errorMessage: string | null
}

export interface InputRecord {
  inputId: number
  inputType: string
  contentText: string | null
  fileName: string | null
  mimeType: string | null
  filePath: string | null
  receivedAt: string | null
}

export interface OutputRecord {
  outputId: number
  outputType: string
  contentText: string | null
  fileName: string | null
  mimeType: string | null
  filePath: string | null
  generatedAt: string | null
}

export interface ExecutionDetail extends Execution {
  steps: ExecutionStep[]
  inputs: InputRecord[]
  outputs: OutputRecord[]
}

export interface AgentSummary {
  agentId: number
  name: string
  description: string | null
  totalExecutions: number
  successCount: number
  failedCount: number
  runningCount: number
  lastExecution: string | null
}

export interface DashboardStats {
  totalExecutions: number
  successCount: number
  failedCount: number
  runningCount: number
  avgDurationSeconds: number
  executionsByAgent: { agentId: number; agentName: string; count: number }[]
  executionTrend: { date: string; total: number; success: number; failed: number }[]
}

export interface AuthUser {
  id: number
  email: string
  name: string
  isAdmin: boolean
  groups: { id: number; name: string }[]
  agentAccess: { agentId: number; accessLevel: 'FULL' | 'OWN' }[]
}

export interface AppUserRecord {
  id: number
  email: string
  name: string
  isAdmin: boolean
  isActive: boolean
  createdAt: string
  groups: { id: number; name: string }[]
  directAgents: { agentId: number; agentName: string; accessLevel: 'FULL' | 'OWN' }[]
}

export interface GroupRecord {
  id: number
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  userCount: number
  agents: { agentId: number; agentName: string; accessLevel: 'FULL' | 'OWN' }[]
}
