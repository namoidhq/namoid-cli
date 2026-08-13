# Contributing to NamoID CLI

Thanks for helping improve the NamoID developer experience. This repository
contains the [`@namoidhq/cli`](https://www.npmjs.com/package/@namoidhq/cli)
package and is part of the [`namoidhq`](https://github.com/namoidhq)
organization.

## Filing issues

Search existing issues before opening a bug report or feature request. Include
the CLI version, operating system, Node.js version, command, expected result,
and the smallest reproducible example. Never include environment-variable
values, access tokens, client secrets, or other credentials.

Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## Submitting a pull request

1. Fork the repository and branch from `main`.
2. Keep the change focused on one concern.
3. Add or update tests for behavior changes.
4. Run the required checks.
5. Open a pull request and link its related issue.

```bash
npm run check
npm test
npm pack --dry-run
```

The CLI has no runtime dependencies. Please discuss new production
dependencies before adding them. Publishing uses GitHub OIDC and npm staged
publishing; never commit npm tokens or other secrets.

## Code of Conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

Contributions are licensed under this repository's [MIT License](./LICENSE).
