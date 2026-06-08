MY GUIDING LIGHT — DEPLOY INSTRUCTIONS
====================================

This guide uses only websites in your browser. No terminal,
no command line, no code editing. About 10-15 minutes total.

You will need:
  - Your existing GitHub account
  - About $5 for an Anthropic API key (covers many months of use)
  - A web browser


===============================================================
 STEP 1 — Unzip the project on your computer
===============================================================

  1. Find "my-guiding-light.zip" wherever you downloaded it.

  2. Unzip it (double-click on Mac; right-click > Extract All
     on Windows). You should get a folder called "my-guiding-light"
     with files inside like package.json, vite.config.js, etc.

  3. Remember where it is — you'll upload these files in Step 3.


===============================================================
 STEP 2 — Get your Anthropic API key
===============================================================

  1. Go to:  https://console.anthropic.com/

  2. Sign up or log in.

  3. In the left sidebar, click "API Keys".

  4. Click "Create Key", give it any name (e.g., "My Guiding Light"),
     and click Create.

  5. COPY THE KEY THAT APPEARS. It starts with "sk-ant-".
     This is the ONLY time you'll see the full key.
     Paste it into a notes app for now.

  6. Click "Plans & Billing" and add at least $5 in credits.
     The app costs about 1-3 cents per response, so $5 lasts a
     long time. While you're there, set a monthly spending cap
     for peace of mind.


===============================================================
 STEP 3 — Upload files to a new GitHub repository
===============================================================

  1. Go to:  https://github.com/new

     (Or click the "+" in the top-right of GitHub and choose
     "New repository".)

  2. Fill in:
       Repository name:  my-guiding-light
       Description:      (optional)
       Public OR Private: either is fine
       Check:  "Add a README file"  (Vercel needs at least one
                                     file to exist before importing)

  3. Click "Create repository".

  4. On the new repo page, click "Add file" > "Upload files"
     (it's a button near the top of the file list).

  5. Drag the contents of your "my-guiding-light" folder
     (the files INSIDE the folder, not the folder itself) into
     the upload area on GitHub.

     Be sure to include the subfolders: "api", "src", and
     hidden files like ".gitignore" if your computer shows them.

     Note: On Mac, hidden files (those starting with a dot) are
     hidden by default. To show them, press Cmd+Shift+. (period)
     in Finder. The .gitignore file is not strictly required,
     so you can skip it if you can't see it.

  6. Wait for all files to finish uploading (you'll see green
     checkmarks).

  7. Scroll down. In the "Commit changes" section, click the green
     "Commit changes" button.


===============================================================
 STEP 4 — Connect Vercel to your GitHub repo
===============================================================

  1. Go to:  https://vercel.com/signup
     (or https://vercel.com/login if you already have an account)

  2. Sign up using "Continue with GitHub" — this auto-connects.

  3. Choose the free "Hobby" plan when asked.

  4. On the Vercel dashboard, click "Add New..." > "Project"
     (top-right).

  5. You'll see a list of your GitHub repos. Find "my-guiding-light"
     and click "Import" next to it.

     If you don't see it, click "Adjust GitHub App Permissions"
     and give Vercel access to that repo. Then refresh.

  6. On the "Configure Project" page:
       - Framework Preset: Vercel should auto-detect "Vite".
         If it doesn't, choose Vite from the dropdown.
       - All other settings: leave at defaults.

  7. EXPAND THE "Environment Variables" SECTION (it's collapsed
     by default). Add this variable:

       Name:    ANTHROPIC_API_KEY
       Value:   (paste your sk-ant-... key here)

     Adding it here means you won't need to redeploy later.

  8. Click "Deploy".

  9. Wait 1-2 minutes. When you see confetti and a screenshot,
     you're live.


===============================================================
 STEP 5 — Visit your site
===============================================================

  Vercel shows you a URL like:
    https://my-guiding-light-yourname.vercel.app

  Click it. The site loads. Try the app.

  The "Save Image" button now works properly on both desktop
  and mobile — no more sandbox restrictions.

  You can share this URL with anyone.


===============================================================
 IF YOU SKIPPED THE API KEY IN STEP 4
===============================================================

  If you forgot to add the API key during the import:

  1. In Vercel, open your project.
  2. Click "Settings" at the top.
  3. Click "Environment Variables" in the left sidebar.
  4. Add:    Name: ANTHROPIC_API_KEY
             Value: (your sk-ant-... key)
  5. Check all three environments (Production, Preview, Development).
  6. Click "Save".
  7. Go to "Deployments" tab, find the latest, click the
     three-dot menu (•••) > "Redeploy".


===============================================================
 OPTIONAL — Custom domain (e.g., inhisvoice.com)
===============================================================

  1. Buy a domain (Namecheap, Cloudflare, etc. — about $12/year).

  2. In Vercel: Settings > Domains > Add. Enter your domain.

  3. Vercel shows you DNS records to add at your registrar.
     Copy them into your registrar's DNS settings. Save.

  4. Wait 5-30 minutes. HTTPS is set up automatically.


===============================================================
 UPDATING THE APP LATER
===============================================================

  When you want to update the code:

  1. In GitHub, open the file you want to change.
  2. Click the pencil icon to edit.
  3. Make changes, scroll down, click "Commit changes".
  4. Vercel automatically rebuilds and deploys within a minute.

  Or upload new files the same way as Step 3 (use
  "Add file" > "Upload files" and overwrite).


===============================================================
 TROUBLESHOOTING
===============================================================

 App loads but "Receive a Word" shows an error:
   The API key isn't set or active. See "IF YOU SKIPPED THE API
   KEY" above. The most common cause is forgetting to redeploy
   after setting the key.

 Build fails on Vercel:
   Click into the failed deployment > "Build Logs". Look for the
   error. Common causes:
     - Files didn't upload completely (re-upload the folder)
     - Missed uploading a subfolder like "src" or "api"

 GitHub upload says "files too large":
   Don't include "node_modules" if it somehow ended up in your
   folder. It's not needed.

 Can't find a file when uploading:
   On Mac, press Cmd+Shift+. (period) in Finder to show hidden
   files like ".gitignore".


===============================================================
 WHAT'S IN THE PROJECT
===============================================================

  src/App.jsx       The app itself
  src/main.jsx      React entry point
  api/claude.js     Tiny serverless function that hides your
                    API key (runs on Vercel, never sees your
                    visitors' browsers)
  index.html        Page wrapper
  package.json      Lists dependencies
  vite.config.js    Build settings
  .gitignore        Tells Git what to skip
  README.txt        This file


That's it. The hardest part is just the file upload in Step 3.
Take it slow and you'll be fine.
