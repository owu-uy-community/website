/** Community roles from least to most: who may do what. Pure, so client code can read it too. */
export const ROLE_RANK = { member: 0, editor: 1, admin: 2, owner: 3 } as const satisfies Record<
  "member" | "editor" | "admin" | "owner",
  number
>;
