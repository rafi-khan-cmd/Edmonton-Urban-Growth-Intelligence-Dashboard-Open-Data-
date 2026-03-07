# Edmonton Urban Growth Intelligence Dashboard

[Live Dashboard](https://rafi-khan-cmd.github.io/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/)

Forecasts new business licences issued for each Edmonton neighbourhood using City of Edmonton open data. The dashboard uses a gradient boosting model to predict commercial growth indicators and displays results on an interactive map.

## What It Does

Predicts the number of new business licences issued in year t+1 for each neighbourhood using features from year t. This serves as a proxy for commercial growth. The model uses:

- Business activity signals (licences issued, active businesses)
- Development indicators (permits, construction value)
- Zoning capacity (area-weighted zoning shares)
- Vibrancy metrics (pedestrian/bicycle counts, if available)

All processing happens offline. The deployed site is static (no backend, no database).

## Installation

```bash
git clone https://github.com/rafi-khan-cmd/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-.git
cd Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-
pip install -r requirements.txt
```

## Data Setup

### Option 1: Fetch from APIs

1. Copy `config/api_endpoints.yml.example` to `config/api_endpoints.yml`
2. Fill in resource IDs from https://data.edmonton.ca
3. Specify API version: `"soda2"` (default) or `"soda3"`

Most Edmonton datasets use SODA2. The GitHub Actions workflow automatically fetches fresh data on each run.

### Option 2: Manual CSV Files

Place CSV/GeoJSON files in `data/raw/`:

**Required:**
- `neighbourhoods.geojson` or `neighbourhoods.csv` (with geometry column)
- `business_licences.csv` (columns: `issue_date`, `latitude`, `longitude`)
- `Zoning_Bylaw_Geographical_Data_20260301.csv` (columns: `geometry_multipolygon`, `zoning_code`, `description`)

**Optional:**
- `development_permits.csv`
- `building_permits.csv`
- `ped_bike_counts.csv`

If your CSV columns differ, edit `config/datasets.yml` to map column names.

## Running the Pipeline

```bash
python -m edmonton_growth.run_all
```

Or with API fetching:

```bash
python -m edmonton_growth.run_all --fetch-from-api
```

This generates artifacts in `site/assets/`:
- `predictions.geojson` - Neighbourhood predictions with geometries
- `timeseries.csv` - Time series data for charts
- `model_card.json` - Model metrics and metadata

To view locally:

```bash
cd site
python -m http.server 8000
```

Open http://localhost:8000 in your browser.

## Methodology

### Target Variable

Number of new business licences issued in year (t+1) for each neighbourhood, predicted using features from year t only (no data leakage).

### Features

**Business Activity:**
- `active_businesses_t`, `new_businesses_t`, `business_growth_rate_t`

**Development Signals:**
- `total_dev_permits_t`, `total_building_permits_t`, `total_construction_value_t`, `permit_growth_rate_t`

**Zoning Capacity (static, area-weighted):**
- `zoning_residential_pct`, `zoning_commercial_pct`, `zoning_industrial_pct`, `zoning_future_dev_pct`, `zoning_diversity`

**Vibrancy (optional):**
- `avg_ped_bike_count_t`, `ped_bike_growth_rate_t`

**Derived Features:**
- `emergence_score`, `build_pressure_score`, `commercial_gap_score`

Total: ~14 features (13 if ped/bike data unavailable)

### Model

- Algorithm: Gradient Boosting (LightGBM)
- Baseline: Simple lag model (predicts using `new_businesses_t`)
- Validation: Time-based split (train on earlier years, test on most recent 1-2 years)
- Metrics: MAE, RMSE, Top-K ranking overlap

### Growth Score

The Growth Score (0-100) prioritizes growth acceleration over absolute counts:
1. Emergence Score (growth acceleration - second derivative)
2. Business Growth Rate (year-over-year percentage change)
3. Calculated YoY Change
4. Absolute Values (fallback)

A small neighbourhood going from 2→10 businesses gets a higher score than a large one going from 100→105.

## Dashboard Features

- **Interactive Map**: Color-coded neighbourhoods (blue = low, red = high growth)
- **View Modes**: Growth Score, Predicted Count, Actual Count
- **Top Rankings**: Emerging neighbourhoods, highest absolute growth, under-served opportunity areas
- **Scenario Analysis**: "What-if" exploration with adjustable parameters (heuristic-based, not full retraining)
- **Neighbourhood Comparison**: Side-by-side comparison of up to 2 neighbourhoods
- **Time Series Charts**: Historical trends and year-over-year comparisons
- **Model Card**: Displays MAE, RMSE, Top-20 Accuracy, training/test periods

## Deployment

Uses GitHub Pages with GitHub Actions for automated builds.

1. Go to repository Settings → Pages
2. Set source to "GitHub Actions"
3. The workflow automatically runs on push to `main` and weekly (Sunday 06:00 UTC)

The workflow:
- Fetches data from APIs (or uses local CSVs)
- Runs the full pipeline
- Generates static artifacts
- Deploys to GitHub Pages

No secrets or API keys required.

## Configuration

Edit `config/parameters.yml` for model settings:
- Train/test split years
- LightGBM hyperparameters
- Feature engineering parameters

Edit `config/datasets.yml` to map CSV column names.

## Project Structure

```
repo/
├── config/              # Configuration files
├── data/raw/            # Input CSV files
├── src/edmonton_growth/ # Pipeline code
├── site/                # Frontend (HTML/CSS/JS)
├── tests/              # Unit tests
└── .github/workflows/  # CI/CD
```

## Testing

```bash
pytest tests/
```

Tests cover WKT parsing, area-weighted calculations, time-lag target creation, and feature engineering.

## Limitations

1. New business licences are a proxy for commercial growth, not a perfect measure
2. Some neighbourhoods may have missing data for certain years
3. Zoning features are static (real zoning changes over time)
4. Model doesn't account for economic conditions, policy changes, or major events
5. Scenario mode uses heuristic adjustments, not full model retraining
6. Intended for exploratory planning, not guaranteed outcomes

## Documentation

- [DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md) - User guide for dashboard
- [MODEL_DOCUMENTATION.md](MODEL_DOCUMENTATION.md) - Model details
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide

## License

See LICENSE file.
