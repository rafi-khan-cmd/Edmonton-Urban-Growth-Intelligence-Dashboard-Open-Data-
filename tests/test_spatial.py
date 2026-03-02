"""Tests for spatial operations."""

import pytest
import geopandas as gpd
from shapely.geometry import Polygon, Point
from shapely import wkt
from edmonton_growth.spatial_join import compute_zoning_shares


def test_wkt_multipolygon_parsing():
    """Test that WKT multipolygon can be parsed."""
    # Create a simple multipolygon WKT
    mp_wkt = "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)))"
    geom = wkt.loads(mp_wkt)
    assert geom.is_valid


def test_area_weighted_zoning_shares():
    """Test that area-weighted zoning shares sum to ~1 per neighbourhood."""
    # Create test neighbourhood
    neigh_geom = Polygon([(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)])
    neighbourhoods = gpd.GeoDataFrame({
        "name": ["TestNeigh"],
        "geometry": [neigh_geom]
    }, crs="EPSG:4326")
    
    # Create test zoning (covers half residential, half commercial)
    zone1 = Polygon([(0, 0), (5, 0), (5, 10), (0, 10), (0, 0)])
    zone2 = Polygon([(5, 0), (10, 0), (10, 10), (5, 10), (5, 0)])
    
    zoning = gpd.GeoDataFrame({
        "zoning_code": ["R1", "C1"],
        "description": ["residential", "commercial"],
        "geometry": [zone1, zone2]
    }, crs="EPSG:4326")
    
    shares = compute_zoning_shares(zoning, neighbourhoods)
    
    assert len(shares) == 1
    assert shares.iloc[0]["name"] == "TestNeigh"
    
    # Shares should sum to approximately 100% (allowing for rounding)
    total = (shares.iloc[0]["zoning_residential_pct"] + 
             shares.iloc[0]["zoning_commercial_pct"]) / 100
    assert abs(total - 1.0) < 0.01  # Within 1% tolerance
