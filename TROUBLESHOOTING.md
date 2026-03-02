# Troubleshooting Guide

## Common Workflow Failures

### 1. "ModuleNotFoundError" or Import Errors

**Solution:** The package needs to be installed. The workflow now includes `pip install -e .` to install the package in editable mode.

### 2. "FileNotFoundError" for data files

**Possible causes:**
- API fetch failed silently
- Missing `api_endpoints.yml` file
- Data files not in `data/raw/` directory

**Solution:**
1. Check if `config/api_endpoints.yml` exists
2. Check the "Fetch data from APIs" step in Actions - it should show what was fetched
3. Verify API endpoints are correct

### 3. "No data found to build modeling table"

**Cause:** No data was successfully loaded or aggregated

**Solution:**
- Check that business_licences.csv has data
- Verify date columns are parseable
- Check that neighbourhoods.geojson exists and has valid geometries

### 4. Geospatial errors (CRS, geometry)

**Solution:**
- Ensure neighbourhoods and zoning data have valid geometries
- Check that CRS is set correctly (should be EPSG:4326)

### 5. Model training errors

**Possible causes:**
- Not enough data (need multiple years)
- All features are NaN
- Target variable has no variance

**Solution:**
- Check the logs to see how many records were in the modeling table
- Verify you have data spanning multiple years

## How to Debug

1. **Check the Actions log:**
   - Go to Actions tab
   - Click on the failed workflow
   - Expand each step to see detailed logs
   - Look for error messages in red

2. **Test locally:**
   ```bash
   # Install dependencies
   pip install -r requirements.txt
   pip install -e .
   
   # Test data fetch
   python -m edmonton_growth.fetch_data
   
   # Test pipeline
   python -m edmonton_growth.run_all
   ```

3. **Check data files:**
   ```bash
   ls -lh data/raw/
   # Should show your CSV/GeoJSON files
   ```

4. **Verify config files:**
   ```bash
   # Check API endpoints exist
   cat config/api_endpoints.yml
   
   # Check datasets config
   cat config/datasets.yml
   ```

## Quick Fixes

### If API fetch fails:
- The workflow will continue with local files if they exist
- Make sure you have at least: neighbourhoods.geojson, business_licences.csv, and zoning data

### If pipeline fails on data loading:
- Check the exact error message
- Verify column names match what's in `config/datasets.yml`
- Check that required files exist in `data/raw/`

### If model training fails:
- You need at least 2-3 years of data
- Check that business_licences has valid date and location data

## Getting Help

If the workflow continues to fail:
1. Copy the full error message from the Actions log
2. Check which step failed (fetch, ingest, aggregate, model, export)
3. Verify your data files are valid (can open them locally)
