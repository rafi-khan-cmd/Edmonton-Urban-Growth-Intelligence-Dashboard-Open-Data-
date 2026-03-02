# Edmonton Urban Growth Intelligence Dashboard

An end-to-end project that uses City of Edmonton open datasets to forecast neighbourhood-level commercial growth and publishes results as an interactive static website.

## Project Summary

This dashboard predicts **next-year commercial growth** (number of new business licences in year t+1) for each Edmonton neighbourhood using features from year t. The model uses:

- Business activity signals (licences issued, active businesses)
- Development indicators (permits, construction value)
- Zoning capacity (area-weighted zoning shares)
- Vibrancy metrics (pedestrian/bicycle counts, if available)

All processing happens offline in the pipeline. The deployed site is static (no backend, no database required).

## Growth Definition

**Growth** = Number of NEW business licences in a neighbourhood in year (t+1), predicted using features from year t.

This is a **proxy measure**. Actual commercial growth depends on many factors not captured in open data.

## Data Requirements

You have two options for providing data:

### Option 1: Fetch from APIs (Recommended)

If you have City of Edmonton Socrata API endpoints:

1. Copy `config/api_endpoints.yml.example` to `config/api_endpoints.yml`
2. Fill in the resource IDs from https://data.edmonton.ca
3. Specify API version: `"soda2"` (default) or `"soda3"`
4. The pipeline will automatically fetch data before processing

The GitHub Actions workflow will fetch fresh data on each run.

### Option 2: Manual CSV Files

Place the following CSV/GeoJSON files in `data/raw/`:

### Required Files

1. **Neighbourhood boundaries**
   - `neighbourhoods.geojson` OR `neighbourhoods.csv` with geometry column
   - Must include neighbourhood names and polygon boundaries

2. **Business licences** (`business_licences.csv`)
   - Must have: issue_date, latitude, longitude
   - Optional: status (for active business counts)

3. **Zoning data** (`Zoning_Bylaw_Geographical_Data_20260301.csv`)
   - Must have: geometry_multipolygon (WKT), zoning_code, description

### Optional Files

4. **Development permits** (`development_permits.csv`)
   - Should have: issue_date, latitude, longitude
   - Optional: permit_type

5. **Building permits** (`building_permits.csv`)
   - Should have: issue_date, latitude, longitude
   - Optional: construction_value

6. **Pedestrian/Bicycle counts** (`ped_bike_counts.csv`)
   - Should have: date, count, latitude, longitude

### Column Mapping

If your CSV columns differ from expected names, edit `config/datasets.yml` to map your column names. The pipeline will automatically find columns using primary names or alternates.

### API Configuration

To use API fetching, create `config/api_endpoints.yml` based on `config/api_endpoints.yml.example`. 

**SODA2 vs SODA3:**
- **SODA2** (default): Uses format `https://data.edmonton.ca/resource/{resource_id}.json`
- **SODA3**: Uses format `https://data.edmonton.ca/api/views/{resource_id}/rows.json`

Most Edmonton datasets use SODA2. Check the API documentation on the dataset page to confirm.

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Or install as package
pip install -e .
```

## Running Locally

### Full Pipeline

Run the complete pipeline:

```bash
python -m edmonton_growth.run_all
```

This will:
1. Validate and load input files
2. Build neighbourhood-year feature table
3. Train gradient boosting model
4. Evaluate performance
5. Export artifacts to `site/assets/`:
   - `predictions.geojson` - Neighbourhood predictions with geometries
   - `timeseries.csv` - Time series data for charts
   - `model_card.json` - Model metrics and metadata

### View Website Locally

```bash
# Using Python's built-in server
cd site
python -m http.server 8000

# Or using any static file server
# Open http://localhost:8000 in your browser
```

## Deployment

The project uses **GitHub Pages** for free hosting and **GitHub Actions** for automated builds.

### Setup GitHub Pages

1. Go to repository Settings → Pages
2. Set source to "GitHub Actions"
3. The workflow will automatically deploy on:
   - Push to `main` branch
   - Weekly schedule (Sunday 06:00 UTC)
   - Manual trigger via workflow_dispatch

### Workflow Details

The `.github/workflows/build_and_deploy.yml` workflow:
- Installs Python dependencies
- Runs the pipeline using CSV snapshots in the repo
- Builds static artifacts
- Deploys to GitHub Pages

**No secrets or API keys required** - everything uses local CSV files.

## Methodology

### Features

**A) Business Activity**
- `active_businesses_t`: Count of active licences in year t
- `new_businesses_t`: Count of licences issued in year t
- `business_growth_rate_t`: Year-over-year growth rate

**B) Development Signals**
- `total_dev_permits_t`: Development permits issued
- `total_building_permits_t`: Building permits issued
- `total_construction_value_t`: Sum of construction values
- `permit_growth_rate_t`: Year-over-year permit growth

**C) Zoning Capacity** (static, area-weighted)
- `zoning_residential_pct`: % of neighbourhood zoned residential
- `zoning_commercial_pct`: % zoned commercial
- `zoning_industrial_pct`: % zoned industrial
- `zoning_future_dev_pct`: % zoned for future development
- `zoning_diversity`: Shannon diversity index

**D) Vibrancy** (optional)
- `avg_ped_bike_count_t`: Average pedestrian/bicycle counts
- `ped_bike_growth_rate_t`: Year-over-year growth

### Model

- **Baseline**: Simple lag model (predicts using `new_businesses_t`)
- **Main Model**: Gradient Boosting (LightGBM)
- **Validation**: Time-based split (train on earlier years, test on most recent 1-2 years)
- **Metrics**: MAE, RMSE, Top-K ranking overlap

### Geospatial Processing

- Point-in-polygon joins for licences/permits → neighbourhoods
- Area-weighted intersection for zoning polygons → neighbourhoods
- All geometries use EPSG:4326 (WGS84) with local UTM projection for area calculations

## Configuration

Edit `config/parameters.yml` to adjust:
- Train/test split years
- Feature engineering parameters
- Zoning keyword matching
- Evaluation metrics

Edit `config/datasets.yml` to map your CSV column names.

## Limitations

1. **Proxy Target**: New business licences are a proxy for commercial growth, not a perfect measure.
2. **Incomplete Coverage**: Some neighbourhoods may have missing data for certain years.
3. **Static Zoning**: Zoning features are computed once and assumed static (real zoning changes over time).
4. **Data Quality**: Results depend on quality and completeness of input CSVs.
5. **No External Factors**: Model doesn't account for economic conditions, policy changes, etc.

## Testing

Run tests:

```bash
pytest tests/
```

Tests cover:
- WKT multipolygon parsing
- Area-weighted zoning share calculations
- Time-lag target creation (t → t+1)

## Project Structure

```
repo/
├── config/
│   ├── datasets.yml      # Column mapping configuration
│   └── parameters.yml    # Model and feature parameters
├── data/
│   ├── raw/              # Place CSV files here
│   └── processed/        # Intermediate files (if needed)
├── src/
│   └── edmonton_growth/
│       ├── ingest.py           # Data loading
│       ├── spatial_join.py     # Geospatial operations
│       ├── aggregate.py        # Neighbourhood-year aggregation
│       ├── build_features.py   # Feature engineering
│       ├── model.py            # Model training
│       ├── evaluate.py         # Evaluation metrics
│       ├── export_artifacts.py # Export for website
│       └── run_all.py          # Main pipeline
├── site/
│   ├── index.html        # Website
│   ├── app.js            # Interactive map logic
│   ├── styles.css        # Styling
│   └── assets/           # Generated artifacts (gitignored)
├── tests/                # Unit tests
├── .github/workflows/    # CI/CD
└── README.md
```

## License

See LICENSE file.

## Contributing

This project uses City of Edmonton open data. Ensure all data sources are publicly available and properly attributed.
