import type { Grants } from "lib/authz/catalog";

export type MatrixRow = {
  resource: string;
  actions: readonly string[];
  /** Role → the actions of this resource it holds. */
  held: Record<string, string[]>;
};

/** One row per resource of `statements`: which of its actions each role holds. Rows no role holds are left out. */
export function rolesMatrix(roles: Record<string, Grants>, statements: Grants): MatrixRow[] {
  return Object.entries(statements)
    .map(([resource, actions]) => ({
      resource,
      actions,
      held: Object.fromEntries(
        Object.entries(roles).map(([role, grants]) => [
          role,
          actions.filter((action) => grants[resource]?.includes(action)),
        ])
      ),
    }))
    .filter((row) => Object.values(row.held).some((held) => held.length > 0));
}
