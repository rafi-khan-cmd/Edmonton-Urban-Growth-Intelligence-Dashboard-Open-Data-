"""Export artifacts for the website."""

import pandas as pd
import geopandas as gpd
import json
from pathlib import Path
import logging
from datetime import datetime
from .utils import get_project_root, load_config

logger = logging.getLogger(__name__)


def export_artifacts(neighbourhoods_gdf, full_df, results, metrics):
    """Export all artifacts for the website."""
    root = get_project_root()
    output_dir = root / "site" / "assets"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    params = load_config("parameters")
    
    # Merge predictions with neighbourhood geometries
    pred_df = results["predictions"].copy()
    
    # Get feature importance for top features
    importance = results["importance"]
    top_features_list = importance.head(params["export"]["top_features_count"])["feature"].tolist()
    
    # Create predictions GeoJSON
    pred_with_geom = neighbourhoods_gdf.merge(
        pred_df[["name", "year", "y_true", "y_pred"]],
        on="name",
        how="inner"
    )
    
    # Calculate Growth Score based on UPTICK (growth rate/acceleration) rather than absolute values
    # This focuses on areas experiencing growth acceleration, not just high absolute counts
    # Merge with full_df to get historical data (growth rates, emergence scores)
    pred_with_geom = pred_with_geom.merge(
        full_df[["name", "year", "new_businesses", "business_growth_rate", "emergence_score"]],
        on=["name", "year"],
        how="left"
    )
    
    # Calculate uptick score: prioritize growth rate and emergence over absolute values
    # Strategy: Use emergence_score > business_growth_rate > calculated YoY change > absolute value
    uptick_scores = []
    
    for idx, row in pred_with_geom.iterrows():
        uptick_score = None
        
        # 1. Prefer emergence_score (acceleration - second derivative)
        if pd.notna(row.get("emergence_score")) and row["emergence_score"] > 0:
            uptick_score = row["emergence_score"] * 100  # Scale up
        
        # 2. Use business_growth_rate (year-over-year percentage change)
        elif pd.notna(row.get("business_growth_rate")) and row["business_growth_rate"] > 0:
            uptick_score = row["business_growth_rate"] * 100  # Already a percentage, scale up
        
        # 3. Calculate year-over-year change from historical data
        else:
            prev_year_data = full_df[
                (full_df["name"] == row["name"]) & 
                (full_df["year"] == row["year"] - 1)
            ]
            if len(prev_year_data) > 0:
                prev_new_businesses = prev_year_data["new_businesses"].iloc[0]
                current_value = row["y_true"] if pd.notna(row["y_true"]) else row["y_pred"]
                if prev_new_businesses > 0:
                    growth_rate = (current_value - prev_new_businesses) / prev_new_businesses
                    uptick_score = max(0, growth_rate) * 100
        
        uptick_scores.append(uptick_score)
    
    pred_with_geom["uptick_score"] = uptick_scores
    
    # Use uptick scores when available, fallback to absolute values
    has_uptick = pd.Series(uptick_scores).notna().any()
    
    if has_uptick:
        # Normalize uptick scores to 0-100
        uptick_series = pd.Series(uptick_scores).fillna(0)
        min_uptick = uptick_series.quantile(0.01)
        max_uptick = uptick_series.quantile(0.99)
        
        if max_uptick > min_uptick:
            normalized_uptick = (uptick_series - min_uptick) / (max_uptick - min_uptick)
            normalized_uptick = normalized_uptick * 0.9 + 0.05  # Scale to 0.05-0.95
            pred_with_geom["growth_score"] = (normalized_uptick * 100).clip(lower=0, upper=100)
        else:
            # Fallback: use absolute value normalization
            value_for_score = pred_with_geom.apply(
                lambda r: r["y_true"] if pd.notna(r["y_true"]) else r["y_pred"],
                axis=1
            )
            min_val = value_for_score.quantile(0.01)
            max_val = value_for_score.quantile(0.99)
            if max_val > min_val:
                normalized = (value_for_score - min_val) / (max_val - min_val)
                normalized_smooth = normalized * 0.9 + 0.05
                pred_with_geom["growth_score"] = (normalized_smooth * 100).clip(lower=0, upper=100)
            else:
                pred_with_geom["growth_score"] = 50
    else:
        # No uptick data available, use absolute values as fallback
        value_for_score = pred_with_geom.apply(
            lambda r: r["y_true"] if pd.notna(r["y_true"]) else r["y_pred"],
            axis=1
        )
        min_val = value_for_score.quantile(0.01)
        max_val = value_for_score.quantile(0.99)
        if max_val > min_val:
            normalized = (value_for_score - min_val) / (max_val - min_val)
            normalized_smooth = normalized * 0.9 + 0.05
            pred_with_geom["growth_score"] = (normalized_smooth * 100).clip(lower=0, upper=100)
        else:
            pred_with_geom["growth_score"] = 50
    
    # Drop temporary columns
    pred_with_geom = pred_with_geom.drop(columns=["uptick_score"], errors="ignore")
    
    # Add top features (simplified: use global importance)
    pred_with_geom["top_features"] = pred_with_geom.apply(
        lambda x: top_features_list, axis=1
    )
    
    # Add feature values for per-neighbourhood explanations
    feature_cols = results["feature_cols"]
    for col in feature_cols:
        if col in full_df.columns:
            pred_with_geom = pred_with_geom.merge(
                full_df[["name", "year", col]].rename(columns={col: f"feat_{col}"}),
                on=["name", "year"],
                how="left"
            )
    
    # Add novel metrics
    novel_metrics = ["emergence_score", "build_pressure_score", "commercial_gap_score"]
    for metric in novel_metrics:
        if metric in full_df.columns:
            pred_with_geom = pred_with_geom.merge(
                full_df[["name", "year", metric]],
                on=["name", "year"],
                how="left"
            )
    
    # Export GeoJSON
    export_cols = ["name", "year", "y_true", "y_pred", "growth_score", "top_features", "geometry"]
    export_cols += [c for c in pred_with_geom.columns if c.startswith("feat_")]
    pred_with_geom[export_cols].to_file(
        output_dir / "predictions.geojson",
        driver="GeoJSON"
    )
    
    logger.info(f"Exported predictions.geojson with {len(pred_with_geom)} records")
    
    # Export timeseries CSV
    timeseries_cols = ["name", "year", "new_businesses", "active_businesses", 
                      "total_dev_permits", "total_building_permits", "y_pred"]
    timeseries_cols = [c for c in timeseries_cols if c in full_df.columns]
    
    timeseries = full_df[timeseries_cols].copy()
    # Add predictions for all years (use model to predict)
    model = results["model"]
    feature_cols = results["feature_cols"]
    
    # Predict for all rows
    X_all = full_df[feature_cols].fillna(0)
    # Ensure all feature columns exist
    for col in feature_cols:
        if col not in X_all.columns:
            X_all[col] = 0
    full_df["y_pred_all"] = model.predict(X_all[feature_cols])
    timeseries = timeseries.merge(
        full_df[["name", "year", "y_pred_all"]],
        on=["name", "year"],
        how="left"
    )
    timeseries["y_pred"] = timeseries["y_pred_all"].fillna(0)
    timeseries = timeseries.drop(columns=["y_pred_all"], errors="ignore")
    
    timeseries.to_csv(output_dir / "timeseries.csv", index=False)
    logger.info(f"Exported timeseries.csv with {len(timeseries)} records")
    
    # Get train/test split info
    test_years = params["model"]["test_years"]
    max_year = full_df["year"].max()
    min_year = full_df["year"].min()
    test_year_threshold = max_year - test_years + 1
    
    train_years = f"{int(min_year)}-{int(test_year_threshold - 1)}"
    test_years_str = f"{int(test_year_threshold)}-{int(max_year)}"
    
    # Export comprehensive model card
    model_card = {
        "last_updated": datetime.now().isoformat(),
        "data_freshness": datetime.now().strftime("%Y-%m-%d"),
        "metrics": {
            "test": {
                "mae": metrics.get("gradient_boosting", {}).get("mae", 0),
                "rmse": metrics.get("gradient_boosting", {}).get("rmse", 0),
                "top_k_overlap": metrics.get("top_k_overlap", 0),
                "worst_errors": metrics.get("worst_errors", [])
            },
            "baseline": {
                "mae": metrics.get("baseline", {}).get("mae", 0),
                "rmse": metrics.get("baseline", {}).get("rmse", 0)
            }
        },
        "train_test_split": {
            "method": "time_based",
            "train_years": train_years,
            "test_years": test_years_str,
            "test_year_threshold": int(test_year_threshold)
        },
        "data_ranges": {
            "year_min": int(full_df["year"].min()),
            "year_max": int(full_df["year"].max()),
            "neighbourhoods": int(full_df["name"].nunique()),
            "samples": int(len(full_df)),
            "train_samples": int(len(full_df[full_df["year"] < test_year_threshold])),
            "test_samples": int(len(full_df[full_df["year"] >= test_year_threshold]))
        },
        "features": feature_cols,
        "top_features": top_features_list,
        "feature_importance": importance.to_dict("records")
    }
    
    with open(output_dir / "model_card.json", "w") as f:
        json.dump(model_card, f, indent=2)
    
    logger.info("Exported model_card.json")
    
    # Export data dictionary
    data_dict = {
        "features": {
            col: {
                "description": _get_feature_description(col),
                "type": "numeric",
                "source": _get_feature_source(col)
            }
            for col in feature_cols
        },
        "target": {
            "y": {
                "description": "New business licences in year (t+1)",
                "type": "integer",
                "source": "City of Edmonton Business Licences"
            }
        }
    }
    
    with open(output_dir / "data_dictionary.json", "w") as f:
        json.dump(data_dict, f, indent=2)
    
    logger.info("Exported data_dictionary.json")
    
    # Generate build report
    build_report = {
        "build_date": datetime.now().isoformat(),
        "status": "success",
        "artifacts_generated": [
            "predictions.geojson",
            "timeseries.csv",
            "model_card.json",
            "data_dictionary.json"
        ],
        "data_summary": {
            "neighbourhoods": int(full_df["name"].nunique()),
            "years": f"{int(full_df['year'].min())}-{int(full_df['year'].max())}",
            "total_samples": int(len(full_df)),
            "features": len(feature_cols)
        },
        "model_performance": {
            "test_mae": metrics.get("gradient_boosting", {}).get("mae", 0),
            "test_rmse": metrics.get("gradient_boosting", {}).get("rmse", 0),
            "top_k_overlap": metrics.get("top_k_overlap", 0)
        }
    }
    
    with open(output_dir / "build_report.json", "w") as f:
        json.dump(build_report, f, indent=2)
    
    logger.info("Exported build_report.json")
    
    return output_dir


def _get_feature_description(col):
    """Get human-readable description for a feature."""
    descriptions = {
        "new_businesses": "New business licences issued in year t",
        "active_businesses": "Total active businesses in year t",
        "business_growth_rate": "Year-over-year growth rate of new businesses",
        "total_dev_permits": "Total development permits issued in year t",
        "total_building_permits": "Total building permits issued in year t",
        "total_construction_value": "Total construction value from building permits",
        "permit_growth_rate": "Year-over-year growth rate of permits",
        "zoning_residential_pct": "Percentage of neighbourhood zoned residential",
        "zoning_commercial_pct": "Percentage of neighbourhood zoned commercial",
        "zoning_industrial_pct": "Percentage of neighbourhood zoned industrial",
        "zoning_future_dev_pct": "Percentage of neighbourhood zoned for future development",
        "zoning_diversity": "Shannon diversity index of zoning types",
        "avg_ped_bike_count": "Average pedestrian/bicycle count",
        "ped_bike_growth_rate": "Year-over-year growth rate of pedestrian/bicycle activity"
    }
    return descriptions.get(col, f"Feature: {col}")


def _get_feature_source(col):
    """Get data source for a feature."""
    sources = {
        "new_businesses": "Business Licences",
        "active_businesses": "Business Licences",
        "business_growth_rate": "Derived from Business Licences",
        "total_dev_permits": "Development Permits",
        "total_building_permits": "Building Permits",
        "total_construction_value": "Building Permits",
        "permit_growth_rate": "Derived from Permits",
        "zoning_residential_pct": "Zoning Bylaw",
        "zoning_commercial_pct": "Zoning Bylaw",
        "zoning_industrial_pct": "Zoning Bylaw",
        "zoning_future_dev_pct": "Zoning Bylaw",
        "zoning_diversity": "Derived from Zoning Bylaw",
        "avg_ped_bike_count": "Pedestrian/Bicycle Counts",
        "ped_bike_growth_rate": "Derived from Pedestrian/Bicycle Counts"
    }
    return sources.get(col, "Unknown")
