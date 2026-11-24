export type TurnActivity<Message> = {
  readonly key: string;
  readonly anchor: Message | null;
  readonly anchorIndex: number;
  readonly active: boolean;
  readonly startConfirmed?: boolean;
  readonly startedAt: number | null;
  readonly durationMs: number | null;
  readonly messages: readonly Message[];
};

/** Unknown start is not elapsed zero; a remount never fabricates an epoch. */
export function activityElapsed(startedAt: number | null, now: number): number | null {
  return startedAt === null || !Number.isFinite(startedAt) || startedAt <= 0 ? null : Math.max(0, now - startedAt);
}
