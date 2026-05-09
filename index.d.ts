export type KillPortProtocol = 'tcp' | 'udp' | 'all'

export interface KillPortFailure {
  pid: number
  code: string
  message: string
}

export interface KillPortOptions {
  protocol?: KillPortProtocol
  /** Compatibility alias for protocol. */
  method?: KillPortProtocol
  signal?: string | number
  dryRun?: boolean
  /** Match kill-port's not-found rejection when true. Default: true for killPort, false for killPorts. */
  rejectOnNotFound?: boolean
}

export interface KillPortResult {
  port: number
  protocol: KillPortProtocol
  pids: number[]
  killed: number[]
  failed: KillPortFailure[]
}

declare function killPort(port: string | number, method?: KillPortProtocol): Promise<KillPortResult>
declare function killPort(port: string | number, options?: KillPortOptions): Promise<KillPortResult>

export default killPort
export { killPort }
export function killPorts(ports: Array<string | number> | string | number, method?: KillPortProtocol): Promise<KillPortResult[]>
export function killPorts(ports: Array<string | number> | string | number, options?: KillPortOptions): Promise<KillPortResult[]>
export function findPidsForPort(port: string | number, method?: KillPortProtocol): Promise<number[]>
export function findPidsForPort(port: string | number, options?: Pick<KillPortOptions, 'protocol' | 'method'>): Promise<number[]>
export function parsePort(port: string | number): number
export function parsePorts(ports: Array<string | number> | string | number): number[]
