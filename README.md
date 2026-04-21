# Book Collection Manager on Netlify

This folder is ready to deploy to Netlify.

## Files

- `index.html` - your webpage
- `netlify/functions/simania-cover.mjs` - server-side function that fetches Simania
- `netlify.toml` - tells Netlify where the functions folder is

## Expected function URL

After deploy, Netlify will expose:

`/.netlify/functions/simania-cover`

Example:

`https://YOUR-SITE.netlify.app/.netlify/functions/simania-cover?title=העמדה&writer=סטיבן%20קינג`

## GitHub steps

1. Create a new empty GitHub repository.
2. Upload all files from this folder into the repository root.
3. Commit the files.
4. Push to GitHub.

## Netlify steps

1. In Netlify, choose `Add new site` -> `Import an existing project`.
2. Connect GitHub.
3. Select your repository.
4. Keep the build command empty.
5. Keep the publish directory empty or set it to `.`.
6. Deploy.

## Test after deploy

1. Open your website.
2. Try a Hebrew title and author.
3. If needed, test the function URL directly in the browser.

