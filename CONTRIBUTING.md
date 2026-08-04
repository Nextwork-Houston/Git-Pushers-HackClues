# Contributing

## Workflow

1. Create a focused branch from `main`.
2. Keep one cohesive feature and its required deployment configuration together.
3. Run the build and relevant runtime checks.
4. Push the branch and open a pull request.
5. Review the Vercel preview before merging.

Recommended branch names:

- `feature/orbit-desktop-companion`
- `feature/speechmatics-backend`
- `fix/orbit-sprite-bleed`
- `docs/orbit-deployment`

Do not create separate branches for source code and the deployment configuration required to run that same source. Separate branches are appropriate when changes can be reviewed, deployed, and reverted independently.

## Commit style

Use imperative, scoped commit messages:

```text
feat(orbit): add cross-platform desktop companion
fix(orbit): prevent idle frame bleed
docs(orbit): document Vercel deployment
```

## Pull request checklist

- [ ] Build passes locally.
- [ ] No secrets or credentials are committed.
- [ ] New behavior is documented.
- [ ] Desktop and web interactions are tested.
- [ ] Vercel preview is available.
- [ ] Download bundles match the committed source.

