# Releasing

A release publishes one version of `@roonieone/caddy`, `@roonieone/occt-native` and a prebuilt `@roonieone/occt-native-<target>` for each platform: `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-arm64-gnu` and `win32-x64`. Two root tasks do the work, locally and in CI:

- `mise run release:pack` packs every platform package assembled in `packages/occt-native/npm/`, then `occt-native` with exactly those platforms pinned as `optionalDependencies`, then `caddy`, into `.release/`. All of them must carry the same version.
- `mise run release:publish` publishes `.release/` with platform packages first, so nothing published ever depends on a missing version. A prerelease goes out under its identifier as the dist-tag (`1.0.0-alpha.1` → `alpha`), anything else under `latest`. Versions already on npm are skipped, so an interrupted run can be repeated.

## From CI (trusted publishing)

1. Set the new version in `packages/caddy/package.json` and `packages/occt-native/package.json` and commit it as `release: <version>`.
2. Tag the commit `v<version>` and push the branch and the tag.
3. `.github/workflows/release.yml` builds and tests every platform through `native.yml`, then packs and publishes all seven packages through OIDC, with provenance. It fails if the tag doesn't match the package version.

Each package must be linked to `release.yml` on npm once. npm only links packages that already exist, and a new link expires unless `release.yml` publishes within 2 days, so link right before tagging the first CI release. `npm trust` needs npm 11.15 or later and two-factor authentication on the account; the first call asks for approval in the browser, where you can skip two-factor authentication for the next 5 minutes:

```sh
for package in caddy occt-native occt-native-darwin-arm64 occt-native-darwin-x64 \
    occt-native-linux-x64-gnu occt-native-linux-arm64-gnu occt-native-win32-x64; do
    npx -y npm@^11.15.0 trust github "@roonieone/$package" --file release.yml --repo markmals/caddy --allow-publish --yes
    sleep 2
done
```

Once CI releases work, the npm docs recommend setting each package's **Publishing access** to "Require two-factor authentication and disallow tokens".

## By hand

1. Assemble the platform packages: `mise //packages/occt-native:package` for the host, plus `mise //packages/occt-native:build:darwin-x64` and `node packages/occt-native/scripts/package-native.ts --arch x64` for Intel macOS on Apple silicon. To publish every platform, download a green `native` run's artifacts instead: `gh run download <run-id> --pattern 'occt-native-*' --dir packages/occt-native/npm`.
2. `npm login`, then `mise run release:pack` and `mise run release:publish`. npm asks for two-factor approval in the browser for each package.

## 1.0.0-alpha.0

The first release was published by hand from macOS, so only the `darwin-arm64` and `darwin-x64` platform packages exist, and `occt-native@1.0.0-alpha.0` pins only those. The Linux and Windows package names must exist before they can be linked: publish them by hand from a green `native` run's artifacts (step 1 above with `gh run download`). Packing with every platform present and publishing again adds just those three packages at `1.0.0-alpha.0`, because the packages already on npm are skipped.
