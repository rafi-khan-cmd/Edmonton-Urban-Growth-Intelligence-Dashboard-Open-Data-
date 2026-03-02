"""Build feature table for modeling."""

import pandas as pd
import numpy as np
import logging
from .utils import load_config

logger = logging.getLogger(__name__)


def build_modeling_table(neighbourhoods_gdf, business_agg, dev_permits_agg, building_permits_agg, 
                        ped_bike_agg, zoning_shares):
    """Build the final modeling table with features and target."""
    params = load_config("parameters")
    
    # Get all neighbourhoods and years
    all_years = set()
    for df in [business_agg, dev_permits_agg, building_permits_agg, ped_bike_agg]:
        if len(df) > 0 and "year" in df.columns:
            all_years.update(df["year"].unique())
    
    if not all_years:
        raise ValueError("No data found to build modeling table")
    
    min_year = params["features"]["min_year"]
    max_year = params["features"].get("max_year")
    if max_year is None:
        max_year = max(all_years)
    
    years = [y for y in range(min_year, max_year + 1) if y in all_years]
    neighbourhoods = neighbourhoods_gdf["name"].unique()
    
    # Create base table
    base = pd.DataFrame([
        {"name": n, "year": y}
        for n in neighbourhoods
        for y in years
    ])
    
    # Merge business data
    if len(business_agg) > 0:
        base = base.merge(business_agg, on=["name", "year"], how="left")
        base["new_businesses"] = base["new_businesses"].fillna(0)
        base["active_businesses"] = base["active_businesses"].fillna(0)
    else:
        base["new_businesses"] = 0
        base["active_businesses"] = 0
    
    # Create target: new_businesses in year t+1
    base = base.sort_values(["name", "year"])
    base["y"] = base.groupby("name")["new_businesses"].shift(-1)
    
    # Merge permit data - robust handling
    if len(dev_permits_agg) > 0:
        logger.info(f"Dev permits agg columns: {list(dev_permits_agg.columns)}")
        base = base.merge(dev_permits_agg, on=["name", "year"], how="left")
        # Handle different possible column names from aggregate function
        if "total_dev_permits" in base.columns:
            base["total_dev_permits"] = base["total_dev_permits"].fillna(0)
        elif "total_development_permits" in base.columns:
            base["total_dev_permits"] = base["total_development_permits"].fillna(0)
            base = base.drop(columns=["total_development_permits"], errors="ignore")
        else:
            logger.warning(f"Could not find dev permits column. Available: {list(base.columns)}")
            base["total_dev_permits"] = 0
    else:
        base["total_dev_permits"] = 0
    
    if len(building_permits_agg) > 0:
        logger.info(f"Building permits agg columns: {list(building_permits_agg.columns)}")
        base = base.merge(building_permits_agg, on=["name", "year"], how="left")
        # Handle different possible column names
        if "total_building_permits" in base.columns:
            base["total_building_permits"] = base["total_building_permits"].fillna(0)
        else:
            logger.warning(f"Could not find building permits column. Available: {list(base.columns)}")
            base["total_building_permits"] = 0
        
        if "total_construction_value" in base.columns:
            base["total_construction_value"] = base["total_construction_value"].fillna(0)
        else:
            base["total_construction_value"] = 0
    else:
        base["total_building_permits"] = 0
        base["total_construction_value"] = 0
    
    # Merge ped/bike
    if len(ped_bike_agg) > 0:
        base = base.merge(ped_bike_agg, on=["name", "year"], how="left")
        base["avg_ped_bike_count"] = base["avg_ped_bike_count"].fillna(0)
    else:
        base["avg_ped_bike_count"] = 0
    
    # Merge zoning (static, same for all years)
    if len(zoning_shares) > 0:
        base = base.merge(zoning_shares[["name", "zoning_residential_pct", "zoning_commercial_pct", 
                                        "zoning_industrial_pct", "zoning_future_dev_pct", "zoning_diversity"]],
                         on="name", how="left")
        for col in ["zoning_residential_pct", "zoning_commercial_pct", "zoning_industrial_pct", 
                   "zoning_future_dev_pct", "zoning_diversity"]:
            base[col] = base[col].fillna(0)
    else:
        for col in ["zoning_residential_pct", "zoning_commercial_pct", "zoning_industrial_pct", 
                   "zoning_future_dev_pct", "zoning_diversity"]:
            base[col] = 0
    
    # Compute growth rates
    base = base.sort_values(["name", "year"])
    
    # Business growth rate
    base["business_growth_rate"] = base.groupby("name")["new_businesses"].pct_change().fillna(0)
    
    # Permit growth rate
    base["permit_growth_rate"] = base.groupby("name")["total_dev_permits"].pct_change().fillna(0)
    
    # Ped/bike growth rate
    base["ped_bike_growth_rate"] = base.groupby("name")["avg_ped_bike_count"].pct_change().fillna(0)
    
    # Remove rows where target is NaN (last year for each neighbourhood)
    base = base.dropna(subset=["y"])
    
    # Compute novel metrics
    # Emergence Score = growth acceleration (second derivative)
    base = base.sort_values(["name", "year"])
    base["business_acceleration"] = base.groupby("name")["business_growth_rate"].diff()
    base["emergence_score"] = base["business_acceleration"] * base["business_growth_rate"]
    
    # Build-Pressure Score = permits growth × future-dev zoning %
    if "permit_growth_rate" in base.columns and "zoning_future_dev_pct" in base.columns:
        base["build_pressure_score"] = (
            base["permit_growth_rate"].fillna(0) * 
            (base["zoning_future_dev_pct"] / 100).fillna(0)
        )
    else:
        base["build_pressure_score"] = 0
    
    # Commercial Gap Score = predicted growth − existing business density
    if "y_pred" in base.columns and "active_businesses" in base.columns:
        # Normalize active_businesses for density proxy
        base["business_density"] = base.groupby("name")["active_businesses"].transform(lambda x: (x - x.min()) / (x.max() - x.min() + 1))
        base["commercial_gap_score"] = base["y_pred"] - base["business_density"] * 10  # Scale factor
    else:
        base["commercial_gap_score"] = 0
    
    return base
