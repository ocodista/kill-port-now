export type KillPortProtocol = 'tcp' | 'udp' | 'all'

export interface PortProcess {
  pid: number
  port: number
  protocol: 'tcp' | 'udp'
  command?: string
  path?: string
}

export interface KillPortFailure {
  pid: number
  code: string
  message: string
}

export interface KillPortOptions {
  /** Default: all. */
  protocol?: KillPortProtocol
  /** Compatibility alias for the legacy kill-port API. */
  method?: KillPortProtocol
  /** Advanced protocol escape hatch. */
  tcpOnly?: boolean
  /** Advanced protocol escape hatch. */
  udpOnly?: boolean
  signal?: string | number
  dryRun?: boolean
  /** Explicit alias for the default forceful behavior. */
  force?: boolean
  /** Send SIGTERM, wait, then SIGKILL remaining processes. */
  graceful?: boolean
  /** Graceful wait before SIGKILL. Default: 500. */
  gracefulTimeoutMs?: number
  /** Match kill-port's not-found rejection when true. Default: true for killPort, false for killPorts. */
  rejectOnNotFound?: boolean
}

export interface KillPortResult {
  port: number
  protocol: KillPortProtocol
  processes: PortProcess[]
  pids: number[]
  killed: number[]
  failed: KillPortFailure[]
  dryRun: boolean
  signal: string | number
  graceful: boolean
}

declare function killPort(port: string | number, method?: KillPortProtocol): Promise<KillPortResult>
declare function killPort(port: string | number, options?: KillPortOptions): Promise<KillPortResult>

export default killPort
export { killPort }
export function killPorts(ports: Array<string | number> | string | number, method?: KillPortProtocol): Promise<KillPortResult[]>
export function killPorts(ports: Array<string | number> | string | number, options?: KillPortOptions): Promise<KillPortResult[]>
export function findPortProcesses(port: string | number, method?: KillPortProtocol): Promise<PortProcess[]>
export function findPortProcesses(port: string | number, options?: Pick<KillPortOptions, 'protocol' | 'method' | 'tcpOnly' | 'udpOnly'>): Promise<PortProcess[]>
export function findPidsForPort(port: string | number, method?: KillPortProtocol): Promise<number[]>
export function findPidsForPort(port: string | number, options?: Pick<KillPortOptions, 'protocol' | 'method' | 'tcpOnly' | 'udpOnly'>): Promise<number[]>
export function parsePort(port: string | number): number
export function parsePorts(ports: Array<string | number> | string | number): number[]
