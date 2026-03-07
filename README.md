# Edmonton Urban Growth Intelligence Dashboard

[![Live Dashboard](https://img.shields.io/badge/Live%20Dashboard-View%20Here-blue)](https://rafi-khan-cmd.github.io/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/)

An end-to-end data science and web development project that uses City of Edmonton open datasets to forecast neighbourhood-level commercial growth and publishes results as an interactive, static web dashboard.

## 📊 Live Dashboard

**👉 [View Live Dashboard](https://rafi-khan-cmd.github.io/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/)**

The dashboard provides:
- Interactive map visualization of growth predictions
- Neighbourhood-level forecasts for new business licences issued
- Growth score rankings and trend analysis
- Scenario analysis ("what-if" exploration)
- Neighbourhood comparison tools
- Time series charts and historical trends
- Model performance metrics and evaluation

---

## 🎯 Project Overview

This dashboard forecasts **new business licences issued** (number of new business licences issued in year t+1) for each Edmonton neighbourhood using features from year t. This serves as a **proxy for neighbourhood-level commercial growth**, helping identify areas with high potential for commercial development.

### Key Capabilities

- **Predictive Modeling**: Gradient boosting model (LightGBM) trained on historical data
- **Interactive Visualization**: Leaflet.js map with color-coded neighbourhoods
- **Time Series Analysis**: Historical trends and year-over-year comparisons
- **Scenario Exploration**: "What-if" analysis with adjustable parameters
- **Ranking Metrics**: Multiple ranking methodologies (emerging, absolute growth, under-served opportunity)
- **Static Deployment**: Fully static website (no backend, no database) hosted on GitHub Pages
- **Automated Pipeline**: GitHub Actions workflow for automated data fetching and model retraining

### What This Demonstrates

- **Dashboard Development**: Interactive web dashboard with real-time filtering and visualization
- **Data Engineering**: Multi-source data integration, cleaning, and transformation
- **Geospatial Analysis**: Point-in-polygon joins, area-weighted aggregations, spatial feature engineering
- **Machine Learning**: End-to-end ML pipeline from raw data to deployed predictions
- **Feature Engineering**: Domain-specific features (zoning capacity, development signals, vibrancy metrics)
- **Model Evaluation**: Time-based validation, ranking metrics, error analysis
- **Reproducible Workflows**: Automated pipeline with configuration management
- **Open Data Integration**: API integration with City of Edmonton Socrata datasets

---

## 🏗️ Architecture & Data Flow

```
┌─────────────────┐
│  City of        │
│  Edmonton       │──┐
│  Open Data      │  │
│  (Socrata API)  │  │
└─────────────────┘  │
                     │
┌─────────────────┐  │
│  CSV Files      │──┤
│  (data/raw/)    │  │
└─────────────────┘  │
                     │
                     ▼
         ┌───────────────────────┐
         │  Data Pipeline         │
         │  (Python)              │
         │                        │
         │  1. Fetch/Ingest       │
         │  2. Spatial Joins      │
         │  3. Aggregate          │
         │  4. Feature Engineering│
         │  5. Model Training     │
         │  6. Evaluation         │
         │  7. Export Artifacts   │
         └───────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Static Artifacts      │
         │  (site/assets/)        │
         │                        │
         │  • predictions.geojson │
         │  • timeseries.csv      │
         │  • model_card.json     │
         │  • data_dictionary.json│
         └───────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Frontend Dashboard   │
         │  (HTML/CSS/JavaScript) │
         │                        │
         │  • Leaflet.js (map)   │
         │  • Chart.js (charts)  │
         │  • Papa Parse (CSV)   │
         └───────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  GitHub Pages          │
         │  (Static Hosting)      │
         └───────────────────────┘
```

---

## 📋 Table of Contents

- [Installation](#-installation)
- [Data Requirements](#-data-requirements)
- [Configuration](#-configuration)
- [Running the Pipeline](#-running-the-pipeline)
- [Methodology](#-methodology)
- [Dashboard Features](#-dashboard-features)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Limitations](#-limitations)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- Git (for cloning the repository)

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rafi-khan-cmd/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-.git
   cd Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   Or install as a package:
   ```bash
   pip install -e .
   ```

### Required Python Packages

The project uses:
- **pandas**: Data manipulation and analysis
- **geopandas**: Geospatial data operations
- **lightgbm**: Gradient boosting model
- **scikit-learn**: Model evaluation metrics
- **pyyaml**: Configuration file parsing
- **requests**: API data fetching
- **shapely**: Geometric operations

See `requirements.txt` for the complete list.

---

## 📊 Data Requirements

You have two options for providing data:

### Option 1: Fetch from APIs (Recommended)

The pipeline can automatically fetch data from City of Edmonton Socrata APIs.

1. **Copy the example configuration**:
   ```bash
   cp config/api_endpoints.yml.example config/api_endpoints.yml
   ```

2. **Fill in resource IDs** from https://data.edmonton.ca:
   - Find the dataset you want to use
   - Copy the resource ID from the API endpoint
   - Add it to `config/api_endpoints.yml`

3. **Specify API version**:
   - `"soda2"` (default): Uses format `https://data.edmonton.ca/resource/{resource_id}.json`
   - `"soda3"`: Uses format `https://data.edmonton.ca/api/views/{resource_id}/rows.json`

   Most Edmonton datasets use SODA2. Check the API documentation on the dataset page to confirm.

4. **Run the pipeline**:
   ```bash
   python -m edmonton_growth.run_all --fetch-from-api
   ```

The GitHub Actions workflow automatically fetches fresh data on each run.

### Option 2: Manual CSV Files

Place the following CSV/GeoJSON files in `data/raw/`:

#### Required Files

1. **Neighbourhood boundaries**
   - `neighbourhoods.geojson` OR `neighbourhoods.csv` with geometry column
   - Must include neighbourhood names and polygon boundaries
   - Example columns: `name`, `geometry` (WKT or GeoJSON)

2. **Business licences** (`business_licences.csv`)
   - **Required columns**: `issue_date`, `latitude`, `longitude`
   - **Optional columns**: `status` or `licencetype` (for active business counts)
   - **Format**: CSV with date column parseable by pandas

3. **Zoning data** (`Zoning_Bylaw_Geographical_Data_20260301.csv`)
   - **Required columns**: `geometry_multipolygon` (WKT), `zoning_code`, `description`
   - **Format**: CSV with WKT multipolygon geometries

#### Optional Files

4. **Development permits** (`development_permits.csv`)
   - **Recommended columns**: `issue_date`, `latitude`, `longitude`
   - **Optional columns**: `permit_type`

5. **Building permits** (`building_permits.csv`)
   - **Recommended columns**: `issue_date`, `latitude`, `longitude`
   - **Optional columns**: `construction_value`

6. **Pedestrian/Bicycle counts** (`ped_bike_counts.csv`)
   - **Recommended columns**: `date`, `count`, `latitude`, `longitude`

### Column Mapping

If your CSV columns differ from expected names, edit `config/datasets.yml` to map your column names. The pipeline will automatically find columns using primary names or alternates.

Example:
```yaml
business_licences:
  columns:
    issue_date: ["issue_date", "issued_date", "date"]
    latitude: ["latitude", "lat", "y"]
    longitude: ["longitude", "lon", "lng", "x"]
```

---

## ⚙️ Configuration

### Model Parameters (`config/parameters.yml`)

Adjust model training and evaluation settings:

```yaml
model:
  train_test_split_year: null  # null = use last 2 years for test
  test_years: 2                # Number of years to hold out for testing
  geographic_holdout: false    # Not currently used
  holdout_fraction: 0.2       # If geographic holdout enabled
  random_seed: 42

lightgbm:
  num_leaves: 31
  learning_rate: 0.05
  feature_fraction: 0.9
  bagging_fraction: 0.8
  bagging_freq: 5
  num_boost_round: 100
  early_stopping_rounds: 10
```

### Dataset Configuration (`config/datasets.yml`)

Map your CSV column names to expected names:

```yaml
business_licences:
  file: "business_licences.csv"
  columns:
    issue_date: ["issue_date", "issued_date"]
    latitude: ["latitude", "lat"]
    longitude: ["longitude", "lon"]
```

### API Endpoints (`config/api_endpoints.yml`)

Configure Socrata API endpoints:

```yaml
business_licences:
  resource_id: "your-resource-id"
  api_version: "soda2"  # or "soda3"
  limit: 10000
```

---

## 🔄 Running the Pipeline

### Full Pipeline

Run the complete pipeline (fetch data, train model, export artifacts):

```bash
python -m edmonton_growth.run_all
```

Or with API fetching:

```bash
python -m edmonton_growth.run_all --fetch-from-api
```

This will:
1. **Validate and load** input files
2. **Fetch data** from APIs (if enabled)
3. **Perform spatial joins** (point-in-polygon, area-weighted intersections)
4. **Aggregate** to neighbourhood-year level
5. **Build features** (business activity, development signals, zoning capacity, vibrancy)
6. **Train gradient boosting model** (LightGBM)
7. **Evaluate performance** (MAE, RMSE, Top-K overlap)
8. **Export artifacts** to `site/assets/`:
   - `predictions.geojson` - Neighbourhood predictions with geometries
   - `timeseries.csv` - Time series data for charts
   - `model_card.json` - Model metrics and metadata
   - `data_dictionary.json` - Feature definitions
   - `build_report.json` - Build metadata

### Individual Steps

You can also run individual pipeline steps:

```bash
# Ingest data
python -m edmonton_growth.ingest

# Spatial joins
python -m edmonton_growth.spatial_join

# Aggregate
python -m edmonton_growth.aggregate

# Build features
python -m edmonton_growth.build_features

# Train model
python -m edmonton_growth.model

# Evaluate
python -m edmonton_growth.evaluate

# Export artifacts
python -m edmonton_growth.export_artifacts
```

### View Website Locally

After running the pipeline, view the dashboard locally:

```bash
# Using Python's built-in server
cd site
python -m http.server 8000

# Open http://localhost:8000 in your browser
```

Or using any static file server:
- **Node.js**: `npx http-server site`
- **VS Code**: Use the "Live Server" extension
- **Python**: `python -m http.server 8000` (from `site/` directory)

---

## 🔬 Methodology

### Target Variable

**y**: Number of new business licences issued in year (t+1) for each neighbourhood

- **Created from**: `new_businesses` column shifted forward by 1 year
- **No data leakage**: Only uses features from year t to predict t+1
- **Proxy measure**: Serves as a proxy for commercial growth, not revenue or business success

### Features

The model uses 5 feature groups:

#### A) Business Activity
- `active_businesses_t`: Count of active licences in year t
- `new_businesses_t`: Count of licences issued in year t
- `business_growth_rate_t`: Year-over-year growth rate

#### B) Development Signals
- `total_dev_permits_t`: Development permits issued
- `total_building_permits_t`: Building permits issued
- `total_construction_value_t`: Sum of construction values
- `permit_growth_rate_t`: Year-over-year permit growth

#### C) Zoning Capacity (Static, Area-Weighted)
- `zoning_residential_pct`: % of neighbourhood zoned residential
- `zoning_commercial_pct`: % zoned commercial
- `zoning_industrial_pct`: % zoned industrial
- `zoning_future_dev_pct`: % zoned for future development
- `zoning_diversity`: Shannon diversity index

#### D) Vibrancy (Optional)
- `avg_ped_bike_count_t`: Average pedestrian/bicycle counts
- `ped_bike_growth_rate_t`: Year-over-year growth

#### E) Derived/Emergence Features
- `emergence_score`: Growth acceleration (second derivative)
- `build_pressure_score`: Development activity indicator
- `commercial_gap_score`: Predicted growth - existing density

**Total Features**: ~14 features (13 if ped/bike data unavailable)

### Feature Group Contributions

The model's feature importance (available in `model_card.json`) shows which types of signals matter most:

- **Business Activity**: Strong importance (past licence issuance patterns are strong predictors)
- **Development Signals**: Indicate planned commercial activity
- **Zoning Capacity**: Provides structural constraints and opportunities
- **Vibrancy**: Captures pedestrian activity and neighbourhood vitality (if available)
- **Derived/Emergence**: Captures growth acceleration and development pressure

The top 5 features by importance are displayed in the dashboard's Model Card and info panels.

### Model

- **Algorithm**: Gradient Boosting (LightGBM)
- **Objective**: Regression (predict count of new businesses)
- **Baseline**: Simple lag model (predicts using `new_businesses_t`)
- **Hyperparameters**: See `config/parameters.yml`
- **Validation**: Time-based split (train on earlier years, test on most recent 1-2 years)
- **Metrics**: MAE, RMSE, Top-K ranking overlap

### Train/Test Split

- **Method**: Time-based split (temporal validation)
- **Strategy**: Train on earlier years, test on most recent years
- **Example**: If data spans 2015-2024 and `test_years = 2`:
  - **Train**: 2015-2022 (8 years)
  - **Test**: 2023-2024 (2 years)
- **Geographic Holdout**: Not implemented (can be enabled in config)

### Geospatial Processing

- **Point-in-polygon joins**: Licences/permits → neighbourhoods
- **Area-weighted intersection**: Zoning polygons → neighbourhoods
- **Coordinate system**: EPSG:4326 (WGS84) with local UTM projection for area calculations
- **Spatial indexing**: Uses GeoPandas spatial joins for efficiency

### Growth Score Calculation

The Growth Score (0-100) prioritizes **growth acceleration/uptick** over absolute counts:

1. **Emergence Score** (growth acceleration - second derivative) - highest priority
2. **Business Growth Rate** (year-over-year percentage change)
3. **Calculated YoY Change** (from historical data)
4. **Absolute Values** (fallback only)

This means a small neighbourhood going from 2→10 businesses gets a higher score than a large one going from 100→105, even though the absolute count is lower.

---

## 🎨 Dashboard Features

### Interactive Map

- **Color-coded neighbourhoods**: Blue (low growth) → Purple/Magenta (medium) → Red (high growth)
- **View modes**:
  - **Growth Score**: Normalized 0-100 score showing growth acceleration
  - **Predicted Count**: Actual predicted number of new business licences
  - **Actual Count**: Real number of licences issued (if available)
- **Click neighbourhoods**: View detailed information panel
- **Search bar**: Type to search and filter neighbourhoods

### Model Card

Displays key model metrics:
- **MAE (Mean Absolute Error)**: Average prediction error
- **RMSE (Root Mean Square Error)**: Penalizes larger errors more
- **Top-20 Accuracy**: Percentage of top neighbourhoods correctly identified
- **Training/Test Period**: Years used for training vs. validation
- **Neighbourhood Count**: Total number of neighbourhoods analyzed
- **Last Updated**: Timestamp of last model retraining

### Top Rankings

Three ranking methodologies:

1. **Emerging Neighbourhoods**: Fast-rising areas based on acceleration and recent growth momentum
2. **Highest Absolute Growth**: Neighbourhoods with highest actual or predicted licence issuance
3. **Under-served Opportunity Areas**: Areas with low current business density but strong projected growth

### Scenario Analysis

"What-if" exploration mode:
- **Development Permits Slider**: Adjust total permits issued (-50% to +50%)
- **Construction Value Slider**: Adjust construction investment (-50% to +50%)
- **Future Dev Zoning Slider**: Adjust future-development zoning (-20% to +20%)
- **Real-time updates**: Map and rankings update as you adjust sliders
- **Disclaimer**: Uses approximate heuristic adjustment, not full model retraining

### Neighbourhood Comparison

- **Add to Compare**: Click "Add to Compare" button in info panel
- **Side-by-side comparison**: View up to 2 neighbourhoods simultaneously
- **Comparison chart**: Time series visualization of both neighbourhoods
- **Metric categories**: Core Forecast Metrics, Business Activity, Development Activity, Structural Capacity

### Time Series Charts

- **Historical trends**: Predicted vs. actual over multiple years
- **Year selector**: Switch between years to see trends
- **Interactive tooltips**: Hover to see exact values

### Evaluation Panel

- **Validation Tab**: Shows train/test split details and sample counts
- **Error Analysis Tab**: Top 10 neighbourhoods with largest prediction errors

---

## 🚢 Deployment

The project uses **GitHub Pages** for free hosting and **GitHub Actions** for automated builds.

### Setup GitHub Pages

1. Go to repository **Settings** → **Pages**
2. Set source to **"GitHub Actions"** (NOT "Deploy from a branch")
3. Save the settings

### Automated Deployment

The `.github/workflows/build_and_deploy.yml` workflow automatically:
- Runs on push to `main` branch
- Runs weekly (Sunday 06:00 UTC)
- Can be manually triggered via `workflow_dispatch`

The workflow:
1. Installs Python dependencies
2. Fetches data from City of Edmonton APIs (or uses local CSVs)
3. Runs the full pipeline (feature engineering, model training)
4. Generates static artifacts
5. Deploys to GitHub Pages

**No secrets or API keys required** - everything uses public APIs or local CSV files.

### Access Your Dashboard

Once deployed, your dashboard will be available at:

```
https://[your-username].github.io/[repository-name]/
```

For this repository:
- **https://rafi-khan-cmd.github.io/Edmonton-Urban-Growth-Intelligence-Dashboard-Open-Data-/**

### Manual Deployment

You can also trigger a manual deployment:
1. Go to **Actions** tab in your repository
2. Select **Build and Deploy** workflow
3. Click **Run workflow**
4. Select the branch and click **Run workflow**

See [DEPLOYMENT.md](DEPLOYMENT.md) and [QUICK_START.md](QUICK_START.md) for more details.

---

## 📁 Project Structure

```
repo/
├── config/
│   ├── datasets.yml           # Column mapping configuration
│   ├── parameters.yml         # Model and feature parameters
│   ├── api_endpoints.yml      # API endpoint configuration
│   └── api_endpoints.yml.example
├── data/
│   ├── raw/                   # Place CSV files here
│   │   └── README.md
│   └── processed/             # Intermediate files (if needed)
├── src/
│   └── edmonton_growth/
│       ├── __init__.py
│       ├── ingest.py          # Data loading
│       ├── fetch_data.py      # API data fetching
│       ├── spatial_join.py    # Geospatial operations
│       ├── aggregate.py       # Neighbourhood-year aggregation
│       ├── build_features.py  # Feature engineering
│       ├── model.py           # Model training
│       ├── evaluate.py        # Evaluation metrics
│       ├── export_artifacts.py # Export for website
│       ├── run_all.py         # Main pipeline
│       └── utils.py           # Utility functions
├── site/
│   ├── index.html            # Website HTML
│   ├── app.js                # Interactive map logic
│   ├── styles.css            # Styling
│   └── assets/               # Generated artifacts (gitignored)
│       ├── predictions.geojson
│       ├── timeseries.csv
│       ├── model_card.json
│       ├── data_dictionary.json
│       └── build_report.json
├── tests/
│   ├── __init__.py
│   ├── test_features.py      # Feature engineering tests
│   └── test_spatial.py       # Spatial operation tests
├── notebooks/                # Jupyter notebooks (if any)
├── .github/
│   └── workflows/
│       └── build_and_deploy.yml  # CI/CD workflow
├── requirements.txt          # Python dependencies
├── setup.py                  # Package setup
├── pyproject.toml            # Project metadata
├── README.md                 # This file
├── DASHBOARD_GUIDE.md        # User guide for dashboard
├── MODEL_DOCUMENTATION.md    # Model details
├── DEPLOYMENT.md             # Deployment guide
├── QUICK_START.md            # Quick start guide
└── LICENSE                   # License file
```

---

## 🧪 Testing

Run tests:

```bash
pytest tests/
```

Or with verbose output:

```bash
pytest tests/ -v
```

Tests cover:
- **WKT multipolygon parsing**: Ensures zoning data is correctly parsed
- **Area-weighted zoning share calculations**: Validates spatial aggregation
- **Time-lag target creation**: Verifies t → t+1 target creation (no data leakage)
- **Feature engineering**: Tests derived feature calculations

---

## ⚠️ Limitations

1. **Proxy Target**: New business licences are a proxy for commercial growth, not a perfect measure. Actual commercial growth depends on many factors not captured in open data.

2. **Incomplete Coverage**: Some neighbourhoods may have missing data for certain years, which can affect predictions.

3. **Static Zoning**: Zoning features are computed once and assumed static (real zoning changes over time, but this is not captured).

4. **Data Quality**: Results depend on quality and completeness of input CSVs. Missing or incorrect data will affect model performance.

5. **No External Factors**: Model doesn't account for:
   - Economic conditions (recessions, booms)
   - Policy changes (zoning changes, incentives)
   - Major events (pandemics, natural disasters)
   - Market dynamics (competition, saturation)

6. **Scenario Mode Approximation**: Scenario analysis uses heuristic adjustments, not full model retraining. Results are directional, not exact.

7. **Temporal Validation Only**: Model uses time-based validation, not geographic holdout. Performance may vary across different neighbourhood types.

8. **Exploratory Purpose**: Intended for exploratory planning and screening, not causal claims or guaranteed outcomes. Predictions are probabilistic, not guarantees.

---

## 📚 Documentation

Additional documentation files:

- **[DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)**: Comprehensive user guide for interpreting dashboard metrics and using all features
- **[MODEL_DOCUMENTATION.md](MODEL_DOCUMENTATION.md)**: Detailed model documentation including metrics, features, and train/test description
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Step-by-step deployment guide
- **[QUICK_START.md](QUICK_START.md)**: Quick start guide after pushing to main

---

## 🤝 Contributing

This project uses City of Edmonton open data. Ensure all data sources are:
- Publicly available
- Properly attributed
- Used in accordance with their licenses

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pytest tests/`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Follow PEP 8 for Python code
- Use meaningful variable names
- Add docstrings to functions
- Write tests for new features

---

## 📄 License

See [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **City of Edmonton** for providing open datasets via Socrata API
- **OpenStreetMap** contributors for base map tiles
- **CARTO** for dark theme map tiles
- Open-source libraries: pandas, GeoPandas, LightGBM, Leaflet.js, Chart.js

---

## 📧 Contact

For questions or issues, please open an issue on GitHub.

---

**Last Updated**: See `model_card.json` for the latest model training timestamp.
