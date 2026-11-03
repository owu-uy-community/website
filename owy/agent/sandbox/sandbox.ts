import { DefaultSandbox, defineSandbox } from "eve/sandbox";

/**
 * Vercel deletes a sandbox snapshot after 30 days without use, and the template `eve build` makes
 * (knowledge pack + skills) is one. Once it lapsed, every turn that opened the sandbox (a photo,
 * the knowledge files) died with "Sandbox template … is not provisioned" until someone redeployed.
 * `0` keeps snapshots for good.
 * ponytail: the sessions' own snapshots never expire either; add `keepLastSnapshots` if storage grows.
 */
export const environment = DefaultSandbox.environment({ vercel: { snapshotExpiration: 0 } });

export default defineSandbox(() => environment.open());
