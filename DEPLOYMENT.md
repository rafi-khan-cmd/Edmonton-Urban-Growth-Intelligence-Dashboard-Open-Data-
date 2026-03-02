# Deployment Guide

## GitHub Pages Deployment

The dashboard is automatically deployed to **GitHub Pages** when you push to the `main` branch or on a weekly schedule (Sundays at 6:00 UTC).

### Access Your Dashboard

Once deployed, your dashboard will be available at:

```
https://[your-username].github.io/[repository-name]/
```

For example, if your repository is:
- `https://github.com/rafiulalamkhan/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-`

Then your dashboard will be at:
- `https://rafiulalamkhan.github.io/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/`

### Enable GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under **Source**, select **GitHub Actions**
4. Save the settings

The GitHub Actions workflow (`.github/workflows/build_and_deploy.yml`) will:
1. Fetch data from City of Edmonton APIs
2. Run the full pipeline (feature engineering, model training)
3. Generate artifacts (predictions.geojson, timeseries.csv, model_card.json)
4. Deploy the static website to GitHub Pages

### First Deployment

1. Push your code to the `main` branch:
   ```bash
   git add .
   git commit -m "Initial commit: Edmonton Growth Intelligence Dashboard"
   git push origin main
   ```

2. The workflow will automatically:
   - Fetch all datasets from APIs
   - Train the model
   - Generate website artifacts
   - Deploy to GitHub Pages

3. Check the **Actions** tab in your GitHub repository to see the deployment progress

4. Once complete, your dashboard will be live at the GitHub Pages URL

### Manual Deployment

You can also trigger a manual deployment:
1. Go to **Actions** tab in your repository
2. Select **Build and Deploy** workflow
3. Click **Run workflow**
4. Select the branch and click **Run workflow**

### Troubleshooting

- If deployment fails, check the **Actions** tab for error messages
- Make sure GitHub Pages is enabled in repository settings
- Verify that `api_endpoints.yml` exists and has correct resource IDs
- Check that the workflow has `pages: write` permission
