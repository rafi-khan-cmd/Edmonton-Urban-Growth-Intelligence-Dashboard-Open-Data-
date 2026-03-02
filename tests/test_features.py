"""Tests for feature engineering."""

import pytest
import pandas as pd
import geopandas as gpd
from shapely.geometry import Polygon
from edmonton_growth.build_features import build_modeling_table


def test_time_lag_target_creation():
    """Test that target y is correctly created as new_businesses at t+1."""
    # Create test neighbourhoods
    neigh_geom = Polygon([(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)])
    neighbourhoods = gpd.GeoDataFrame({
        "name": ["Neigh1", "Neigh2"],
        "geometry": [neigh_geom, neigh_geom]
    }, crs="EPSG:4326")
    
    # Create test business data
    business_agg = pd.DataFrame({
        "name": ["Neigh1", "Neigh1", "Neigh2", "Neigh2"],
        "year": [2020, 2021, 2020, 2021],
        "new_businesses": [10, 15, 5, 8],
        "active_businesses": [50, 65, 20, 28]
    })
    
    # Empty dataframes for other sources
    dev_permits_agg = pd.DataFrame()
    building_permits_agg = pd.DataFrame()
    ped_bike_agg = pd.DataFrame()
    zoning_shares = pd.DataFrame({
        "name": ["Neigh1", "Neigh2"],
        "zoning_residential_pct": [50, 60],
        "zoning_commercial_pct": [30, 25],
        "zoning_industrial_pct": [20, 15],
        "zoning_future_dev_pct": [0, 0],
        "zoning_diversity": [1.0, 1.0]
    })
    
    df = build_modeling_table(
        neighbourhoods, business_agg, dev_permits_agg, 
        building_permits_agg, ped_bike_agg, zoning_shares
    )
    
    # Check that target y is new_businesses at t+1
    # For Neigh1, year 2020: y should be 15 (new_businesses in 2021)
    neigh1_2020 = df[(df["name"] == "Neigh1") & (df["year"] == 2020)]
    assert len(neigh1_2020) == 1
    assert neigh1_2020.iloc[0]["y"] == 15
    
    # For Neigh1, year 2021: y should be NaN (no t+1 data)
    # But build_modeling_table drops rows where y is NaN
    neigh1_2021 = df[(df["name"] == "Neigh1") & (df["year"] == 2021)]
    assert len(neigh1_2021) == 0  # Should be dropped
