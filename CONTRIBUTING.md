# Contributing

Before contributing to this repository, please discuss any changes you wish to make via issue, email, Slack channel, or any other method.

Please adhere to our code of conduct in all interactions with the project.

## Pull Request Process

1. Remove any install or build dependencies before finalizing the build.
2. Update the README.md with details of changes to the interface, including new environment variables, exposed ports, useful file locations, and container parameters.
3. Increment version numbers in example files and the README.md to reflect the new version represented by this Pull Request. We use the [SemVer](http://semver.org/) versioning scheme.
4. You can merge the Pull Request once you have approval from two other developers, or if you lack merge permissions, request the second reviewer to do it for you.

## Checks

CI runs all of these on every pull request; run them locally before pushing.

| Command                 | What it does                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | oxlint (type-aware) and oxfmt. `pnpm fix` applies what they can fix themselves.                                                                   |
| `pnpm typecheck`        | `tsc --noEmit`                                                                                                                                    |
| `pnpm test:unit`        | Vitest: `*.test.ts` runs in Node, `*.test.tsx` in happy-dom. `pnpm test` watches.                                                                 |
| `pnpm test:integration` | Procedures against a real Postgres. Needs `docker compose up -d`; recreates the `owu_test` database each run (override with `TEST_DATABASE_URL`). |
| `pnpm e2e`              | Playwright against the app, the realtime sidecar and a mock OBS. Recreates `owu_e2e` each run (override with `E2E_DATABASE_URL`).                 |

### Writing tests

- Unit tests sit next to the code as `*.test.ts(x)`; integration tests as `*.integration.test.ts`; end-to-end specs live in `e2e/` as `*.e2e.ts`.
- A test must fail if the rule it covers were deleted or inverted: assert values, not just shapes; pin the arguments of a spy, not just that it was called; cover both sides of every boundary.
- Use `test()`, not `it()`. Build each test's state with a local `setup()` function instead of `beforeEach`; hooks are for cleanup only.
- No snapshots — write the expected value out.
- Data that repeats across tests comes from the factories in `src/test/factories.ts`.
- Outbound HTTP is mocked with MSW; a request nothing mocked fails the test.
- Playwright never retries. A flaky spec is a race to find, not a timeout to raise.

### Our Responsibilities

Project maintainers are responsible for defining acceptable behavior standards and taking appropriate, fair corrective actions in response to any unacceptable behavior.

They have the right and responsibility to remove, edit, or reject comments, commits, code, wiki edits, issues, and other contributions that do not align with this Code of Conduct. They can also temporarily or permanently ban any contributor for inappropriate, threatening, offensive, or harmful behavior.

### Scope

This Code of Conduct applies both within project spaces and in public spaces when an individual represents the project or its community. This includes using an official project email address, posting via an official social media account, or acting as an appointed representative at online or offline events. Project maintainers may further define and clarify representation of the project.

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior can be reported by contacting the project team at Slack. All complaints will be reviewed and investigated, resulting in a response deemed appropriate for the circumstances. The project team is committed to maintaining confidentiality regarding the reporter of an incident. Additional specific enforcement policies may be posted separately.

Project maintainers who do not follow or enforce the Code of Conduct in good faith may face temporary or permanent repercussions as determined by other project leaders.

### Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage], version 1.4, available at [http://contributor-covenant.org/version/1/4][version].
