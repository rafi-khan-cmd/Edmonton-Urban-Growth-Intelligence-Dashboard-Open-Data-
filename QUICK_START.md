# Quick Start - After Pushing to Main

## Step 1: Enable GitHub Pages

1. Go to: https://github.com/rafi-khan-cmd/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/settings/pages
2. Under **Source**, select **GitHub Actions** (NOT "Deploy from a branch")
3. Click **Save**

## Step 2: Check Workflow Status

1. Go to: https://github.com/rafi-khan-cmd/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/actions
2. You should see a "Build and Deploy" workflow running
3. Click on it to see the progress
4. The workflow will:
   - Fetch data from City of Edmonton APIs
   - Train the model
   - Generate website artifacts
   - Deploy to GitHub Pages

## Step 3: Wait for Completion

The first run may take 10-15 minutes because it needs to:
- Install dependencies
- Fetch all datasets (with pagination)
- Process geospatial data
- Train the model
- Generate artifacts

## Step 4: Access Your Dashboard

Once the workflow completes successfully, your dashboard will be at:

**https://rafi-khan-cmd.github.io/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/**

## Troubleshooting

If the workflow fails:
1. Check the Actions tab for error messages
2. Common issues:
   - Missing `api_endpoints.yml` (should be created automatically)
   - API rate limits (will retry)
   - Missing dependencies (check requirements.txt)

If Pages doesn't show up:
- Make sure you selected "GitHub Actions" as the source (not a branch)
- Wait a few minutes after the workflow completes
- Check Settings → Pages for the URL
