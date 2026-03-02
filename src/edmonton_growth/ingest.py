"""Data ingestion module."""

import pandas as pd
import geopandas as gpd
from pathlib import Path
import logging
from .utils import get_project_root, load_config, find_column, safe_read_csv

logger = logging.getLogger(__name__)


def load_neighbourhoods():
    """Load neighbourhood boundaries."""
    root = get_project_root()
    data_dir = root / "data" / "raw"
    config = load_config("datasets")["neighbourhoods"]
    
    # Try GeoJSON first
    geojson_path = data_dir / config["file"]
    if geojson_path.exists():
        logger.info(f"Loading neighbourhoods from {geojson_path}")
        gdf = gpd.read_file(geojson_path)
        # Find name column
        name_col = find_column(gdf, config.get("name_col", "name"), config.get("name_col_alt", []))
        if name_col and name_col != "name":
            gdf = gdf.rename(columns={name_col: "name"})
        if "name" not in gdf.columns:
            gdf["name"] = gdf.index.astype(str)
        return gdf
    
    # Try CSV fallback
    csv_path = data_dir / config.get("fallback_file", "neighbourhoods.csv")
    if csv_path.exists():
        logger.info(f"Loading neighbourhoods from {csv_path}")
        df = pd.read_csv(csv_path)
        # Try to find geometry column
        geom_col = find_column(df, config.get("geometry_col", "geometry"), ["geometry", "GEOMETRY", "wkt"])
        if geom_col:
            from shapely import wkt
            df["geometry"] = df[geom_col].apply(wkt.loads)
        gdf = gpd.GeoDataFrame(df, geometry="geometry")
        name_col = find_column(gdf, config.get("name_col", "name"), config.get("name_col_alt", []))
        if name_col and name_col != "name":
            gdf = gdf.rename(columns={name_col: "name"})
        if "name" not in gdf.columns:
            gdf["name"] = gdf.index.astype(str)
        return gdf
    
    raise FileNotFoundError(f"Could not find neighbourhoods file in {data_dir}")


def load_business_licences():
    """Load business licences."""
    root = get_project_root()
    data_dir = root / "data" / "raw"
    config = load_config("datasets")["business_licences"]
    
    df = safe_read_csv(data_dir / config["file"])
    if df is None:
        raise FileNotFoundError(f"Could not find {config['file']}")
    
    # Map columns - try multiple common date column names
    logger.info(f"Business licences columns: {list(df.columns)}")
    
    date_col = find_column(df, config["date_col"], config.get("date_col_alt", []))
    if not date_col:
        # Try common alternative names (including Edmonton-specific)
        for alt in ["most_recent_issue_date", "originalissuedate", "issue_date", "ISSUE_DATE", "issued_date", "date", "DATE", "issue_dt", "licence_date", "LICENCE_DATE"]:
            if alt in df.columns:
                date_col = alt
                logger.info(f"Found date column: {date_col}")
                break
    if not date_col:
        raise ValueError(f"Could not find date column in business_licences. Available columns: {list(df.columns)}")
    
    lat_col = find_column(df, config["lat_col"], config.get("lat_col_alt", []))
    if not lat_col:
        for alt in ["latitude", "LATITUDE", "lat", "LAT", "y", "location_latitude", "LOCATION_LATITUDE"]:
            if alt in df.columns:
                lat_col = alt
                logger.info(f"Found latitude column: {lat_col}")
                break
    
    lon_col = find_column(df, config["lon_col"], config.get("lon_col_alt", []))
    if not lon_col:
        for alt in ["longitude", "LONGITUDE", "lon", "LON", "x", "location_longitude", "LOCATION_LONGITUDE"]:
            if alt in df.columns:
                lon_col = alt
                logger.info(f"Found longitude column: {lon_col}")
                break
    
    if not lat_col or not lon_col:
        raise ValueError(f"Could not find lat/lon columns in business_licences. Available columns: {list(df.columns)}")
    
    # Create geometry
    from shapely.geometry import Point
    df["geometry"] = df.apply(lambda row: Point(row[lon_col], row[lat_col]), axis=1)
    gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
    
    # Rename date column
    gdf = gdf.rename(columns={date_col: "issue_date"})
    
    # Optional status column - use licencetype or expiry_date to determine active status
    status_col = find_column(df, config.get("status_col", ""), config.get("status_col_alt", []))
    if status_col:
        gdf = gdf.rename(columns={status_col: "status"})
    elif "expiry_date" in df.columns:
        # Use expiry_date to determine if active (not expired)
        from datetime import datetime
        gdf["status"] = gdf["expiry_date"].apply(
            lambda x: "Active" if pd.notna(x) and pd.to_datetime(x, errors='coerce') > datetime.now() else "Expired"
        )
    elif "licencetype" in df.columns:
        gdf["status"] = "Active"  # Assume all are active if we have licencetype
    
    # Parse dates
    gdf["issue_date"] = pd.to_datetime(gdf["issue_date"], errors='coerce')
    gdf = gdf.dropna(subset=["issue_date", "geometry"])
    
    return gdf


def load_development_permits():
    """Load development permits."""
    root = get_project_root()
    data_dir = root / "data" / "raw"
    config = load_config("datasets")["development_permits"]
    
    df = safe_read_csv(data_dir / config["file"])
    if df is None:
        logger.warning(f"Could not find {config['file']}, returning empty GeoDataFrame")
        return gpd.GeoDataFrame()
    
    date_col = find_column(df, config["date_col"], config.get("date_col_alt", []))
    if not date_col:
        date_col = find_column(df, "issue_date", ["ISSUE_DATE", "issued_date", "date", "DATE", "permit_date", "PERMIT_DATE"])
    if not date_col:
        logger.warning(f"Could not find date column in development_permits. Available: {list(df.columns)}")
        return gpd.GeoDataFrame()
    
    lat_col = find_column(df, config["lat_col"], config.get("lat_col_alt", []))
    lon_col = find_column(df, config["lon_col"], config.get("lon_col_alt", []))
    
    if not lat_col or not lon_col:
        logger.warning(f"Could not find lat/lon columns in development_permits. Available: {list(df.columns)}")
        return gpd.GeoDataFrame()
    
    from shapely.geometry import Point
    df["geometry"] = df.apply(lambda row: Point(row[lon_col], row[lat_col]), axis=1)
    gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
    gdf = gdf.rename(columns={date_col: "issue_date"})
    
    type_col = find_column(df, config.get("type_col", ""), config.get("type_col_alt", []))
    if type_col:
        gdf = gdf.rename(columns={type_col: "permit_type"})
    
    gdf["issue_date"] = pd.to_datetime(gdf["issue_date"], errors='coerce')
    gdf = gdf.dropna(subset=["issue_date", "geometry"])
    
    return gdf


def load_building_permits():
    """Load building permits."""
    root = get_project_root()
    data_dir = root / "data" / "raw"
    config = load_config("datasets")["building_permits"]
    
    df = safe_read_csv(data_dir / config["file"])
    if df is None:
        logger.warning(f"Could not find {config['file']}, returning empty GeoDataFrame")
        return gpd.GeoDataFrame()
    
    date_col = find_column(df, config["date_col"], config.get("date_col_alt", []))
    if not date_col:
        date_col = find_column(df, "issue_date", ["ISSUE_DATE", "issued_date", "date", "DATE", "permit_date", "PERMIT_DATE"])
    if not date_col:
        logger.warning(f"Could not find date column in building_permits. Available: {list(df.columns)}")
        return gpd.GeoDataFrame()
    
    lat_col = find_column(df, config["lat_col"], config.get("lat_col_alt", []))
    lon_col = find_column(df, config["lon_col"], config.get("lon_col_alt", []))
    
    if not lat_col or not lon_col:
        logger.warning(f"Could not find lat/lon columns in building_permits. Available: {list(df.columns)}")
        return gpd.GeoDataFrame()
    
    from shapely.geometry import Point
    df["geometry"] = df.apply(lambda row: Point(row[lon_col], row[lat_col]), axis=1)
    gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
    gdf = gdf.rename(columns={date_col: "issue_date"})
    
    value_col = find_column(df, config.get("value_col", ""), config.get("value_col_alt", []))
    if value_col:
        gdf = gdf.rename(columns={value_col: "construction_value"})
        gdf["construction_value"] = pd.to_numeric(gdf["construction_value"], errors='coerce').fillna(0)
    else:
        gdf["construction_value"] = 0
        logger.warning("Could not find construction_value column, setting to 0")
    
    gdf["issue_date"] = pd.to_datetime(gdf["issue_date"], errors='coerce')
    gdf = gdf.dropna(subset=["issue_date", "geometry"])
    
    return gdf


def load_zoning():
    """Load zoning data (supports GeoJSON or CSV with WKT geometry)."""
    root = get_project_root()
    data_dir = root / "data" / "raw"
    config = load_config("datasets")["zoning"]
    
    file_path = data_dir / config["file"]
    
    # Try GeoJSON first
    if file_path.suffix.lower() == ".geojson" or "geojson" in config["file"].lower():
        if not file_path.exists():
            raise FileNotFoundError(f"Could not find {file_path}")
        logger.info(f"Loading zoning from GeoJSON: {file_path}")
        gdf = gpd.read_file(file_path)
    else:
        # Try CSV with WKT geometry
        df = safe_read_csv(file_path)
        if df is None:
            raise FileNotFoundError(f"Could not find {file_path}")
        
        geom_col = find_column(df, config["geometry_col"], config.get("geometry_col_alt", []))
        if not geom_col:
            raise ValueError("Could not find geometry column in zoning")
        
        code_col = find_column(df, config["code_col"], config.get("code_col_alt", []))
        desc_col = find_column(df, config["desc_col"], config.get("desc_col_alt", []))
        
        # Parse WKT geometry
        from shapely import wkt
        df["geometry"] = df[geom_col].apply(lambda x: wkt.loads(x) if pd.notna(x) else None)
        gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
        gdf = gdf.dropna(subset=["geometry"])
    
    # Map column names (works for both GeoJSON and CSV)
    code_col = find_column(gdf, config["code_col"], config.get("code_col_alt", []))
    desc_col = find_column(gdf, config["desc_col"], config.get("desc_col_alt", []))
    
    if code_col and code_col != "zoning_code":
        gdf = gdf.rename(columns={code_col: "zoning_code"})
    if desc_col and desc_col != "description":
        gdf = gdf.rename(columns={desc_col: "description"})
    
    return gdf


def load_ped_bike_counts():
    """Load pedestrian/bicycle counts (optional)."""
    root = get_project_root()
    data_dir = root / "data" / "raw"
    config = load_config("datasets")["ped_bike_counts"]
    
    if config.get("optional", True):
        df = safe_read_csv(data_dir / config["file"])
        if df is None:
            logger.info(f"Optional file {config['file']} not found, skipping")
            return gpd.GeoDataFrame()
    else:
        df = safe_read_csv(data_dir / config["file"])
        if df is None:
            raise FileNotFoundError(f"Could not find {config['file']}")
    
    date_col = find_column(df, config["date_col"], config.get("date_col_alt", []))
    count_col = find_column(df, config["count_col"], config.get("count_col_alt", []))
    lat_col = find_column(df, config["lat_col"], config.get("lat_col_alt", []))
    lon_col = find_column(df, config["lon_col"], config.get("lon_col_alt", []))
    
    if not all([date_col, count_col, lat_col, lon_col]):
        logger.warning("Missing required columns in ped_bike_counts, returning empty")
        return gpd.GeoDataFrame()
    
    from shapely.geometry import Point
    df["geometry"] = df.apply(lambda row: Point(row[lon_col], row[lat_col]), axis=1)
    gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
    gdf = gdf.rename(columns={date_col: "date", count_col: "count"})
    
    gdf["date"] = pd.to_datetime(gdf["date"], errors='coerce')
    gdf = gdf.dropna(subset=["date", "geometry", "count"])
    
    return gdf
