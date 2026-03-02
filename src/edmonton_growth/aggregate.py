"""Aggregate data by neighbourhood and year."""

import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


def aggregate_business_licences(business_gdf, neighbourhoods_gdf):
    """Aggregate business licences by neighbourhood and year."""
    if len(business_gdf) == 0:
        return pd.DataFrame()
    
    from .spatial_join import join_points_to_neighbourhoods
    
    joined = join_points_to_neighbourhoods(business_gdf, neighbourhoods_gdf)
    if len(joined) == 0:
        return pd.DataFrame()
    
    joined["year"] = joined["issue_date"].dt.year
    
    # Group by neighbourhood and year
    agg = joined.groupby(["name", "year"]).agg({
        "issue_date": "count"  # Total licences issued
    }).rename(columns={"issue_date": "new_businesses"})
    
    # Active businesses (if status available)
    if "status" in joined.columns:
        active = joined[joined["status"].str.contains("active|current|issued", case=False, na=False)]
        active_agg = active.groupby(["name", "year"]).size().reset_index(name="active_businesses")
        agg = agg.merge(active_agg, on=["name", "year"], how="left")
        agg["active_businesses"] = agg["active_businesses"].fillna(0)
    else:
        # Cumulative count as proxy
        agg["active_businesses"] = agg.groupby("name")["new_businesses"].cumsum()
    
    return agg.reset_index()


def aggregate_permits(permits_gdf, neighbourhoods_gdf, permit_type="development"):
    """Aggregate permits by neighbourhood and year."""
    if len(permits_gdf) == 0:
        return pd.DataFrame()
    
    from .spatial_join import join_points_to_neighbourhoods
    
    joined = join_points_to_neighbourhoods(permits_gdf, neighbourhoods_gdf)
    if len(joined) == 0:
        return pd.DataFrame()
    
    joined["year"] = joined["issue_date"].dt.year
    
    agg = joined.groupby(["name", "year"]).size().reset_index(name=f"total_{permit_type}_permits")
    
    # Type breakdown if available
    if "permit_type" in joined.columns:
        type_agg = joined.groupby(["name", "year", "permit_type"]).size().unstack(fill_value=0)
        type_agg.columns = [f"{permit_type}_{col.lower().replace(' ', '_')}_permits" for col in type_agg.columns]
        agg = agg.merge(type_agg.reset_index(), on=["name", "year"], how="left")
    
    # Construction value for building permits
    if permit_type == "building" and "construction_value" in joined.columns:
        value_agg = joined.groupby(["name", "year"])["construction_value"].sum().reset_index(name="total_construction_value")
        agg = agg.merge(value_agg, on=["name", "year"], how="left")
        agg["total_construction_value"] = agg["total_construction_value"].fillna(0)
    
    return agg


def aggregate_ped_bike(ped_bike_gdf, neighbourhoods_gdf):
    """Aggregate pedestrian/bicycle counts by neighbourhood and year."""
    if len(ped_bike_gdf) == 0:
        return pd.DataFrame()
    
    from .spatial_join import join_points_to_neighbourhoods
    
    joined = join_points_to_neighbourhoods(ped_bike_gdf, neighbourhoods_gdf)
    if len(joined) == 0:
        return pd.DataFrame()
    
    joined["year"] = joined["date"].dt.year
    
    agg = joined.groupby(["name", "year"])["count"].mean().reset_index(name="avg_ped_bike_count")
    
    return agg
