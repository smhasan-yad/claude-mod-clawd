export type Now = { startedAt: number; steps: number; activity: string }

declare module 'claude-code' {
  interface PluginState {
    clawd: { now: Now }
  }
}
