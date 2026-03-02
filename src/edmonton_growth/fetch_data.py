"""Fetch data from City of Edmonton open data APIs (Socrata SODA)."""

import requests
from requests.compat import urlencode
import pandas as pd
import geopandas as gpd
from pathlib import Path
import logging
from .utils import get_project_root, load_config

logger = logging.getLogger(__name__)


def fetch_with_pagination(resource_id, output_path, api_version="soda2", base_url="https://data.edmonton.ca",
                          format_type="csv", where_clause=None, select_cols=None, page_size=None):
    """
    Fetch large datasets using pagination with $offset parameter.
    
    Uses $offset to page through data in increments (default 1000, or page_size if specified).
    """
    from io import StringIO
    
    # Default page size: 1000 (Socrata default limit) or use max allowed
    if page_size is None:
        if api_version == "soda2":
            page_size = 50000  # Max for SODA 2.0
        else:
            page_size = 1000  # Default for SODA 3
    
    all_data = []
    offset = 0
    total_fetched = 0
    page_num = 1
    
    logger.info(f"Fetching {resource_id} with pagination (page_size: {page_size}, using $offset)")
    
    while True:
        params = {
            "$limit": page_size,
            "$offset": offset
        }
        if where_clause:
            params["$where"] = where_clause
        if select_cols:
            params["$select"] = ",".join(select_cols)
        
        # Build URL
        if api_version == "soda2":
            url = f"{base_url}/resource/{resource_id}.{format_type}"
        else:
            url = f"{base_url}/api/v3/views/{resource_id}/query.{format_type}"
        
        try:
            logger.info(f"Fetching page {page_num} (offset: {offset})...")
            response = requests.get(url, params=params, timeout=120)
            response.raise_for_status()
            
            if format_type == "csv":
                # Read CSV chunk from response content
                chunk_df = pd.read_csv(StringIO(response.text))
                if len(chunk_df) == 0:
                    logger.info("No more data to fetch")
                    break
                all_data.append(chunk_df)
                total_fetched += len(chunk_df)
                logger.info(f"Page {page_num}: Fetched {len(chunk_df)} rows (total: {total_fetched})")
                
                # If we got fewer rows than requested, we've reached the end
                if len(chunk_df) < page_size:
                    logger.info("Reached end of dataset")
                    break
                    
            elif format_type == "geojson":
                # For GeoJSON, we need to combine features
                data = response.json()
                if isinstance(data, dict) and "features" in data:
                    if len(data["features"]) == 0:
                        break
                    all_data.append(data["features"])
                    total_fetched += len(data["features"])
                    logger.info(f"Page {page_num}: Fetched {len(data['features'])} features (total: {total_fetched})")
                    if len(data["features"]) < page_size:
                        break
                else:
                    logger.warning("Unexpected GeoJSON format")
                    break
            else:
                # JSON format
                data = response.json()
                if isinstance(data, list):
                    if len(data) == 0:
                        break
                    all_data.extend(data)
                    total_fetched += len(data)
                    logger.info(f"Page {page_num}: Fetched {len(data)} records (total: {total_fetched})")
                    if len(data) < page_size:
                        break
                elif isinstance(data, dict) and "data" in data:
                    # SODA3 format
                    records = data["data"]
                    if len(records) == 0:
                        break
                    all_data.extend(records)
                    total_fetched += len(records)
                    logger.info(f"Page {page_num}: Fetched {len(records)} records (total: {total_fetched})")
                    if len(records) < page_size:
                        break
                else:
                    logger.warning(f"Unexpected JSON format: {type(data)}")
                    break
            
            # Move to next page
            offset += page_size
            page_num += 1
            
            # Safety limit: prevent infinite loops
            if page_num > 1000:
                logger.warning("Reached safety limit of 1000 pages. Stopping pagination.")
                break
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching page {page_num} at offset {offset}: {e}")
            break
        except Exception as e:
            logger.error(f"Unexpected error on page {page_num}: {e}")
            break
    
    # Combine all pages
    if format_type == "csv" and all_data:
        df = pd.concat(all_data, ignore_index=True)
        df.to_csv(output_path, index=False)
        logger.info(f"✅ Saved {len(df)} total records to {output_path}")
        return True
    elif format_type == "geojson" and all_data:
        # Combine GeoJSON features
        all_features = []
        for page_features in all_data:
            all_features.extend(page_features)
        feature_collection = {
            "type": "FeatureCollection",
            "features": all_features
        }
        import json
        with open(output_path, 'w') as f:
            json.dump(feature_collection, f)
        logger.info(f"✅ Saved {len(all_features)} total features to {output_path}")
        return True
    elif all_data:
        # For JSON, combine into DataFrame
        if isinstance(all_data[0], dict) and "data" in all_data[0]:
            # SODA3 format - would need column names from first response
            logger.warning("SODA3 JSON pagination needs column metadata - consider using CSV format")
            return False
        else:
            df = pd.DataFrame(all_data)
            df.to_csv(output_path, index=False)
            logger.info(f"✅ Saved {len(df)} total records to {output_path}")
            return True
    
    logger.warning("No data fetched")
    return False


def fetch_socrata_data(resource_id, output_path, api_version="soda2", base_url="https://data.edmonton.ca", 
                       limit=None, where_clause=None, select_cols=None, format_type="auto", use_pagination=False):
    """
    Fetch data from Socrata API.
    
    Args:
        resource_id: Socrata resource ID (4x4 code for SODA2, or view ID for SODA3)
        output_path: Path to save the CSV/GeoJSON file
        api_version: "soda2" or "soda3"
        base_url: Base URL for the Socrata portal
        limit: Maximum number of records to fetch
        where_clause: SOQL WHERE clause (e.g., "issue_date > '2020-01-01'")
        select_cols: List of columns to select
        format_type: "csv", "json", "geojson", or "auto" (detect from output_path extension)
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Auto-detect format from file extension if not specified
    if format_type == "auto":
        ext = output_path.suffix.lower()
        if ext == ".csv":
            format_type = "csv"
        elif ext == ".geojson":
            format_type = "geojson"
        else:
            format_type = "json"
    
    # Build URL based on format and API version
    if api_version == "soda2":
        if format_type == "csv":
            url = f"{base_url}/resource/{resource_id}.csv"
        elif format_type == "geojson":
            url = f"{base_url}/resource/{resource_id}.geojson"
        else:
            url = f"{base_url}/resource/{resource_id}.json"
    elif api_version == "soda3":
        # SODA3 can use /api/views/ or /api/v3/views/
        # Try v3 first (newer format), fallback to v1
        if format_type == "csv":
            url = f"{base_url}/api/v3/views/{resource_id}/query.csv"
        elif format_type == "geojson":
            url = f"{base_url}/api/v3/views/{resource_id}/query.geojson"
        else:
            url = f"{base_url}/api/v3/views/{resource_id}/query.json"
    else:
        raise ValueError(f"Unknown API version: {api_version}")
    
    params = {}
    # Socrata default limit is 1,000 rows
    # SODA 2.0 max limit: 50,000, SODA 2.1: no limit
    # User can override with limit parameter
    if limit:
        params["$limit"] = limit
    else:
        # Default to 50,000 for SODA2 (max allowed), or use pagination
        # For SODA3, we'll use pagination with smaller chunks
        if api_version == "soda2":
            params["$limit"] = 50000
        else:
            params["$limit"] = 1000  # Start with default, use pagination if needed
    
    if where_clause:
        params["$where"] = where_clause
    if select_cols:
        params["$select"] = ",".join(select_cols)
    
    logger.info(f"Fetching {resource_id} from {url} (format: {format_type}, limit: {params.get('$limit')})")
    if params:
        logger.info(f"Full URL: {url}?{urlencode(params)}")
    else:
        logger.info(f"Full URL: {url}")
    
    try:
        response = requests.get(url, params=params, timeout=120)  # Longer timeout for large datasets
        logger.info(f"Response status: {response.status_code}")
        if response.status_code != 200:
            logger.error(f"API returned status {response.status_code}: {response.text[:500]}")
        response.raise_for_status()
        
        # Check if we hit the limit and need pagination
        total_size = None
        if response.headers.get('X-SODA2-TrueSize'):
            total_size = int(response.headers.get('X-SODA2-TrueSize', 0))
        elif response.headers.get('X-Content-Range'):
            # Parse Content-Range header: "items 0-49999/150000"
            range_header = response.headers.get('X-Content-Range', '')
            if '/' in range_header:
                total_size = int(range_header.split('/')[-1])
        
        # Check response headers for total size
        fetched_count = None
        if format_type == "csv":
            # Count rows in CSV response
            from io import StringIO
            temp_df = pd.read_csv(StringIO(response.text))
            fetched_count = len(temp_df)
        elif isinstance(data, list):
            fetched_count = len(data)
        elif isinstance(data, dict):
            if "data" in data:
                fetched_count = len(data["data"])
            elif "features" in data:
                fetched_count = len(data["features"])
        
        # Check if we need pagination
        if total_size and total_size > params["$limit"]:
            logger.warning(f"Dataset has {total_size} rows but limit is {params['$limit']}")
            if use_pagination:
                logger.info("Using pagination to fetch all records...")
                return fetch_with_pagination(
                    resource_id, output_path, api_version, base_url,
                    format_type, where_clause, select_cols, page_size=params["$limit"]
                )
            else:
                logger.warning("Pagination disabled. Only partial data will be fetched.")
        elif fetched_count and fetched_count == params["$limit"] and use_pagination:
            # We got exactly the limit, might be more data
            logger.info("Fetched exactly the limit. Using pagination to check for more records...")
            return fetch_with_pagination(
                resource_id, output_path, api_version, base_url,
                format_type, where_clause, select_cols, page_size=params["$limit"]
            )
        
        # Handle CSV directly (most efficient)
        if format_type == "csv":
            with open(output_path, 'wb') as f:
                f.write(response.content)
            # Verify it's valid CSV
            df = pd.read_csv(output_path, nrows=1)
            logger.info(f"Saved CSV with {len(pd.read_csv(output_path))} records to {output_path}")
            return True
        
        # Handle GeoJSON directly
        if format_type == "geojson":
            with open(output_path, 'wb') as f:
                f.write(response.content)
            # Verify it's valid GeoJSON
            gdf = gpd.read_file(output_path)
            logger.info(f"Saved GeoJSON with {len(gdf)} records to {output_path}")
            return True
        
        # Handle JSON
        data = response.json()
        
        if api_version == "soda2":
            # SODA2 returns list of records directly
            if isinstance(data, list) and len(data) > 0:
                df = pd.DataFrame(data)
            elif isinstance(data, dict) and "features" in data:
                # GeoJSON FeatureCollection
                gdf = gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")
                gdf.to_file(output_path, driver="GeoJSON" if output_path.suffix == ".geojson" else "ESRI Shapefile")
                logger.info(f"Saved {len(gdf)} geospatial records to {output_path}")
                return True
            else:
                df = pd.DataFrame(data) if data else pd.DataFrame()
        else:
            # SODA3 can return different formats
            # Format 1: {"data": [[...], ...], "meta": {...}}
            if "data" in data and len(data["data"]) > 0:
                columns = [col["name"] for col in data["meta"]["view"]["columns"]]
                df = pd.DataFrame(data["data"], columns=columns)
            # Format 2: Direct list of records (like SODA2)
            elif isinstance(data, list) and len(data) > 0:
                df = pd.DataFrame(data)
            # Format 3: GeoJSON FeatureCollection
            elif isinstance(data, dict) and "features" in data:
                gdf = gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")
                gdf.to_file(output_path, driver="GeoJSON" if output_path.suffix == ".geojson" else "ESRI Shapefile")
                logger.info(f"Saved {len(gdf)} geospatial records to {output_path}")
                return True
            else:
                df = pd.DataFrame()
        
        if len(df) == 0:
            logger.warning(f"No data returned for {resource_id}")
            return False
        
        # Check if it's geospatial data
        geom_cols = ["geometry", "the_geom", "location", "point", "shape"]
        geom_col = None
        for col in geom_cols:
            if col in df.columns:
                geom_col = col
                break
        
        if geom_col:
            try:
                # Parse GeoJSON strings or WKT
                import json
                from shapely.geometry import shape
                from shapely import wkt
                
                def parse_geom(x):
                    if pd.isna(x):
                        return None
                    if isinstance(x, str):
                        try:
                            # Try GeoJSON first
                            return shape(json.loads(x))
                        except:
                            try:
                                # Try WKT
                                return wkt.loads(x)
                            except:
                                return None
                    return x
                
                df["geometry"] = df[geom_col].apply(parse_geom)
                gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
                gdf = gdf.drop(columns=[geom_col], errors="ignore")
                
                if output_path.suffix == ".geojson":
                    gdf.to_file(output_path, driver="GeoJSON")
                else:
                    gdf.to_file(output_path, driver="ESRI Shapefile")
                logger.info(f"Saved {len(gdf)} geospatial records to {output_path}")
                return True
            except Exception as e:
                logger.warning(f"Could not parse geometry, saving as CSV: {e}")
        
        # Save as CSV
        df.to_csv(output_path, index=False)
        logger.info(f"Saved {len(df)} records to {output_path}")
        return True
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching {resource_id}: {e}")
        logger.error(f"URL was: {url}")
        logger.error(f"Params were: {params}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Response status: {e.response.status_code}")
            logger.error(f"Response text: {e.response.text[:500]}")
        return False
    except Exception as e:
        logger.error(f"Error processing {resource_id}: {e}")
        logger.error(f"Exception type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False


def fetch_all_datasets():
    """Fetch all datasets based on config."""
    root = get_project_root()
    data_dir = root / "data" / "raw"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    # Load API config
    try:
        api_config = load_config("api_endpoints")
    except FileNotFoundError:
        logger.error("No api_endpoints.yml found. Create config/api_endpoints.yml with resource IDs.")
        logger.error("Copy config/api_endpoints.yml.example to config/api_endpoints.yml")
        raise FileNotFoundError("config/api_endpoints.yml not found")
    
    datasets_config = load_config("datasets")
    
    results = {}
    
    for dataset_name, api_info in api_config.items():
        if dataset_name not in datasets_config:
            logger.warning(f"Dataset {dataset_name} in API config but not in datasets.yml, skipping")
            continue
        
        resource_id = api_info.get("resource_id")
        if not resource_id:
            logger.warning(f"No resource_id for {dataset_name}, skipping")
            continue
        
        output_file = api_info.get("output_file", datasets_config[dataset_name]["file"])
        output_path = data_dir / output_file
        api_version = api_info.get("api_version", "soda2")
        format_type = api_info.get("format", "auto")  # csv, json, geojson, or auto
        limit = api_info.get("limit")
        where_clause = api_info.get("where")
        select_cols = api_info.get("select")
        use_pagination = api_info.get("use_pagination", False)  # Enable pagination for large datasets
        
        success = fetch_socrata_data(
            resource_id=resource_id,
            output_path=output_path,
            api_version=api_version,
            format_type=format_type,
            limit=limit,
            where_clause=where_clause,
            select_cols=select_cols,
            use_pagination=use_pagination
        )
        
        results[dataset_name] = success
        if not success:
            logger.error(f"Failed to fetch {dataset_name} from API")
        else:
            logger.info(f"Successfully fetched {dataset_name}")
    
    # Check if we got at least the required files
    required_files = ["neighbourhoods", "business_licences", "zoning"]
    success_count = sum(1 for name in required_files if results.get(name, False))
    
    if success_count < len(required_files):
        logger.error(f"Only {success_count}/{len(required_files)} required datasets fetched successfully")
        logger.error("Required datasets: neighbourhoods, business_licences, zoning")
        for name in required_files:
            if not results.get(name, False):
                logger.error(f"  - {name}: FAILED")
        raise RuntimeError(f"Failed to fetch required datasets. Only {success_count}/{len(required_files)} succeeded.")
    
    logger.info(f"Successfully fetched {success_count} required datasets")
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    fetch_all_datasets()
