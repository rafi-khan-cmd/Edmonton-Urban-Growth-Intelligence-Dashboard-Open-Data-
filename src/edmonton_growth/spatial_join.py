"""Spatial join operations."""

import geopandas as gpd
import logging
import math

logger = logging.getLogger(__name__)


def join_points_to_neighbourhoods(points_gdf, neighbourhoods_gdf):
    """Join point data to neighbourhoods using spatial join."""
    if len(points_gdf) == 0:
        return gpd.GeoDataFrame()
    
    # Ensure same CRS
    if points_gdf.crs != neighbourhoods_gdf.crs:
        points_gdf = points_gdf.to_crs(neighbourhoods_gdf.crs)
    
    # Spatial join
    joined = gpd.sjoin(points_gdf, neighbourhoods_gdf, how="left", predicate="within")
    return joined


def compute_zoning_shares(zoning_gdf, neighbourhoods_gdf):
    """Compute area-weighted zoning shares per neighbourhood."""
    if len(zoning_gdf) == 0:
        logger.warning("Empty zoning data, returning empty shares")
        return gpd.GeoDataFrame()
    
    # Ensure same CRS
    if zoning_gdf.crs != neighbourhoods_gdf.crs:
        zoning_gdf = zoning_gdf.to_crs(neighbourhoods_gdf.crs)
    
    # Project to a local CRS for area calculations (meters)
    # Edmonton is in UTM zone 12N
    local_crs = "EPSG:32612"
    zoning_proj = zoning_gdf.to_crs(local_crs)
    neigh_proj = neighbourhoods_gdf.to_crs(local_crs)
    
    results = []
    
    for idx, neigh in neigh_proj.iterrows():
        neigh_name = neigh["name"]
        neigh_geom = neigh["geometry"]
        neigh_area = neigh_geom.area
        
        if neigh_area == 0:
            continue
        
        # Intersect zoning with this neighbourhood
        zoning_in_neigh = zoning_proj[zoning_proj.intersects(neigh_geom)].copy()
        
        if len(zoning_in_neigh) == 0:
            continue
        
        # Compute intersection areas
        zoning_in_neigh["intersection"] = zoning_in_neigh.geometry.intersection(neigh_geom)
        zoning_in_neigh["intersection_area"] = zoning_in_neigh["intersection"].area
        
        total_intersection = zoning_in_neigh["intersection_area"].sum()
        
        if total_intersection == 0:
            continue
        
        # Compute shares by zoning code/description
        shares = {}
        for zidx, zone in zoning_in_neigh.iterrows():
            code = zone.get("zoning_code", "UNKNOWN")
            desc = str(zone.get("description", "")).lower()
            area = zone["intersection_area"]
            share = area / total_intersection
            
            # Categorize
            if any(kw in desc for kw in ["residential", "res", "r1", "r2", "r3", "r4", "r5", "rf", "ra"]):
                shares["residential"] = shares.get("residential", 0) + share
            elif any(kw in desc for kw in ["commercial", "comm", "c1", "c2", "cb", "cc", "ch", "cn"]):
                shares["commercial"] = shares.get("commercial", 0) + share
            elif any(kw in desc for kw in ["industrial", "ind", "i1", "i2", "i3", "ib"]):
                shares["industrial"] = shares.get("industrial", 0) + share
            elif any(kw in desc for kw in ["future", "fd", "future development", "planned"]):
                shares["future_dev"] = shares.get("future_dev", 0) + share
        
        # Compute diversity (Shannon index)
        diversity = 0
        for share_val in shares.values():
            if share_val > 0:
                diversity -= share_val * math.log(share_val)
        
        results.append({
            "name": neigh_name,
            "zoning_residential_pct": shares.get("residential", 0) * 100,
            "zoning_commercial_pct": shares.get("commercial", 0) * 100,
            "zoning_industrial_pct": shares.get("industrial", 0) * 100,
            "zoning_future_dev_pct": shares.get("future_dev", 0) * 100,
            "zoning_diversity": diversity
        })
    
    return gpd.GeoDataFrame(results)
