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
    
    # Normalize predictions to growth_score (0-100)
    min_pred = pred_df["y_pred"].min()
    max_pred = pred_df["y_pred"].max()
    if max_pred > min_pred:
        pred_with_geom["growth_score"] = (
            (pred_with_geom["y_pred"] - min_pred) / (max_pred - min_pred) * 
            (params["export"]["growth_score_max"] - params["export"]["growth_score_min"]) +
            params["export"]["growth_score_min"]
        )
    else:
        pred_with_geom["growth_score"] = 50
    
    # Add top features (simplified: use global importance)
    pred_with_geom["top_features"] = pred_with_geom.apply(
        lambda x: top_features_list, axis=1
    )
    
    # Export GeoJSON
    pred_with_geom[["name", "year", "y_true", "y_pred", "growth_score", "top_features", "geometry"]].to_file(
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
    
    # Export model card
    model_card = {
        "last_updated": datetime.now().isoformat(),
        "metrics": metrics,
        "features": feature_cols,
        "train_test_split": {
            "method": "time_based",
            "test_years": params["model"]["test_years"]
        },
        "data_ranges": {
            "year_min": int(full_df["year"].min()),
            "year_max": int(full_df["year"].max()),
            "neighbourhoods": int(full_df["name"].nunique()),
            "samples": int(len(full_df))
        },
        "top_features": top_features_list
    }
    
    with open(output_dir / "model_card.json", "w") as f:
        json.dump(model_card, f, indent=2)
    
    logger.info("Exported model_card.json")
    
    return output_dir
