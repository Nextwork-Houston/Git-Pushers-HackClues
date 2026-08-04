# Deployment

## Vercel

### Dashboard deployment

1. Import `Nextwork-Houston/Git-Pushers-HackClues` into Vercel.
2. Select the Next.js framework preset.
3. Keep the repository root as the project root.
4. Use `npm install` and `npm run build`.
5. Deploy the `feature/orbit-desktop-companion` branch for a preview URL.

The repository-level `vercel.json` exposes `/orbit` publicly and adds download headers for files under `/orbit/downloads/`.

### CLI deployment

```bash
npx vercel
npx vercel --prod
```

Use a preview deployment for branch review. Promote to production only after the pull request is approved.

## Desktop release bundle

The hosted ZIP files contain the Electron source, component assets, and operating-system installers. Rebuild a ZIP whenever any file in `orbit/desktop`, the sprite atlases, or an installer script changes.

Platform-specific signed packages should be produced in CI on their native operating systems:

- Windows: signed installer on Windows.
- macOS: signed and notarized application on macOS.
- Linux: AppImage or distribution package on Linux.

The current hackathon download is a source installer. It installs Electron locally with npm on first launch.

## Verification checklist

- `/orbit` loads without authentication.
- Both download links return `200` responses.
- Idle remains visually stable.
- Clicking Orbit opens chat.
- Dragging moves the desktop window without activating chat.
- Size controls persist after restart.
- Speechmatics partial and final events appear in chat.
- `npm run build` and `npm audit` complete successfully.

