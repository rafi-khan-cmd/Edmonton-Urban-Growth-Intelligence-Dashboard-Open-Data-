# Model Documentation

## README Summary

**Project**: Edmonton Urban Growth Intelligence Dashboard  
**Goal**: Forecast new business licences issued (number of new business licences issued in year t+1) using features from year t. This serves as a proxy for neighbourhood-level commercial growth.  
**Deployment**: Static website on GitHub Pages, automated via GitHub Actions  
**Data Source**: City of Edmonton Open Data (Socrata APIs or CSV snapshots)

---

## Model Metrics

### Test Set Metrics (Gradient Boosting Model)
- **MAE (Mean Absolute Error)**: Average absolute forecast error in number of business licences issued
- **RMSE (Root Mean Square Error)**: Penalizes larger forecast misses more heavily
- **Top-K Overlap**: Percentage of neighbourhoods correctly identified in top 20 (true vs predicted). Shows ability to identify the highest-growth neighbourhoods.
- **Worst Errors**: Top 10 neighbourhoods with largest prediction errors (name, year, y_true, y_pred, error)

### Baseline Model Metrics
- **MAE**: Simple lag model (predicts using `new_businesses_t`)
- **RMSE**: Baseline performance for comparison

### Model Card Structure (model_card.json)
```json
{
  "last_updated": "ISO timestamp",
  "data_freshness": "YYYY-MM-DD",
  "metrics": {
    "test": {
      "mae": float,
      "rmse": float,
      "top_k_overlap": float (0-1),
      "worst_errors": [{"name": str, "year": int, "y_true": int, "y_pred": float, "error": float}]
    },
    "baseline": {
      "mae": float,
      "rmse": float
    }
  },
  "train_test_split": {
    "method": "time_based",
    "train_years": "YYYY-YYYY",
    "test_years": "YYYY-YYYY",
    "test_year_threshold": int
  },
  "data_ranges": {
    "year_min": int,
    "year_max": int,
    "neighbourhoods": int,
    "samples": int,
    "train_samples": int,
    "test_samples": int
  },
  "features": [list of feature names],
  "top_features": [top 5 features by importance],
  "feature_importance": [{"feature": str, "importance": float}]
}
```

---

## Feature List

### Business Activity Features
1. **new_businesses**: Count of licences issued in year t
2. **active_businesses**: Total active businesses in year t
3. **business_growth_rate**: Year-over-year percentage change in new businesses

### Development Signals
4. **total_dev_permits**: Total development permits issued in year t
5. **total_building_permits**: Total building permits issued in year t
6. **total_construction_value**: Sum of construction values from building permits
7. **permit_growth_rate**: Year-over-year percentage change in permits

### Zoning Capacity (Static, Area-Weighted)
8. **zoning_residential_pct**: Percentage of neighbourhood zoned residential
9. **zoning_commercial_pct**: Percentage zoned commercial
10. **zoning_industrial_pct**: Percentage zoned industrial
11. **zoning_future_dev_pct**: Percentage zoned for future development
12. **zoning_diversity**: Shannon diversity index of zoning types

### Vibrancy (Optional)
13. **avg_ped_bike_count**: Average pedestrian/bicycle count in year t
14. **ped_bike_growth_rate**: Year-over-year percentage change in ped/bike activity

**Total Features**: 14 features (13 if ped/bike data unavailable)

---

## Train/Test Description

### Split Method
- **Type**: Time-based split (temporal validation)
- **Strategy**: Train on earlier years, test on most recent years
- **Geographic Holdout**: Not implemented (can be enabled but currently false)

### Configuration (config/parameters.yml)
```yaml
model:
  train_test_split_year: null  # null = use last 2 years for test
  test_years: 2                # Number of years to hold out for testing
  geographic_holdout: false    # Not currently used
  holdout_fraction: 0.2        # If geographic holdout enabled
  random_seed: 42
```

### Split Logic
1. Find maximum year in dataset
2. Calculate `test_year_threshold = max_year - test_years + 1`
3. **Train Set**: All years < `test_year_threshold`
4. **Test Set**: All years >= `test_year_threshold`

### Example
- If data spans 2015-2024 and `test_years = 2`:
  - **Train**: 2015-2022 (8 years)
  - **Test**: 2023-2024 (2 years)
  - **Train Samples**: ~407 neighbourhoods × 8 years = ~3,256 samples
  - **Test Samples**: ~407 neighbourhoods × 2 years = ~814 samples

### Model Training
- **Algorithm**: LightGBM (Gradient Boosting)
- **Objective**: Regression (predict count of new businesses)
- **Hyperparameters**:
  - num_leaves: 31
  - learning_rate: 0.05
  - feature_fraction: 0.9
  - bagging_fraction: 0.8
  - bagging_freq: 5
  - num_boost_round: 100
  - early_stopping: 10 rounds
- **Baseline**: Simple lag model (predicts using `new_businesses_t`)

---

## Target Variable

**y**: Number of new business licences issued in year (t+1) for each neighbourhood  
**Created from**: `new_businesses` column shifted forward by 1 year  
**No data leakage**: Only uses features from year t to predict t+1  
**Note**: This serves as a proxy for commercial growth. The dashboard forecasts new business licences issued, not revenue or business success.

---

## Evaluation Approach

1. **Time-based validation**: Ensures no future data leaks into training
2. **Top-K ranking**: Evaluates if model can identify "hottest" growth areas
3. **Error analysis**: Identifies where model struggles most
4. **Baseline comparison**: Shows improvement over simple lag model
