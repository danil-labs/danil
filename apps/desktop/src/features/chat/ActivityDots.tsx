/** Busy is a lifecycle fact, not evidence that new output is arriving. */
export function ActivityDots(props: { paused?: boolean; active?: boolean }) {
  return <span class="activity-dots-slot" classList={{ "activity-dots-exited": props.active === false }} aria-hidden="true" data-activity-slot="">
    <svg width="22" height="20" viewBox="0 0 22 20" class="activity-dots" classList={{ "activity-dots-paused": props.paused || props.active === false }} data-activity-dots="">
      <circle cx="4" cy="10" r="2" /><circle cx="11" cy="10" r="2" /><circle cx="18" cy="10" r="2" />
    </svg>
  </span>;
}
