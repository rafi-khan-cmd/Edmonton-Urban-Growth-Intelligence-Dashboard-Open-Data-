"""Main pipeline entry point."""

import logging
from pathlib import Path
from .utils import get_project_root
from .ingest import (
    load_neighbourhoods, load_business_licences, load_development_permits,
    load_building_permits, load_zoning, load_ped_bike_counts
)
from .spatial_join import compute_zoning_shares
from .aggregate import (
    aggregate_business_licences, aggregate_permits, aggregate_ped_bike
)
from .build_features import build_modeling_table
from .model import train_and_evaluate
from .evaluate import evaluate_model
from .export_artifacts import export_artifacts

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_pipeline(fetch_from_api=False):
    """Run the complete pipeline.
    
    Args:
        fetch_from_api: If True, fetch data from APIs before running pipeline
    """
    logger.info("Starting Edmonton Growth Intelligence Pipeline")
    
    # Optionally fetch data from APIs
    if fetch_from_api:
        try:
            from .fetch_data import fetch_all_datasets
            logger.info("Fetching data from APIs...")
            results = fetch_all_datasets()
            if results:
                logger.info(f"API fetch results: {results}")
        except FileNotFoundError:
            logger.warning("api_endpoints.yml not found. Skipping API fetch. Using local CSV files.")
        except Exception as e:
            logger.warning(f"Error fetching from API: {e}. Continuing with local files.")
    
    # 1. Ingest data
    logger.info("Step 1: Ingesting data...")
    try:
        neighbourhoods = load_neighbourhoods()
    except Exception as e:
        logger.error(f"Failed to load neighbourhoods: {e}")
        raise
    
    try:
        business_licences = load_business_licences()
    except Exception as e:
        logger.error(f"Failed to load business_licences: {e}")
        raise
    
    dev_permits = load_development_permits()
    building_permits = load_building_permits()
    
    try:
        zoning = load_zoning()
    except Exception as e:
        logger.error(f"Failed to load zoning: {e}")
        raise
    
    ped_bike = load_ped_bike_counts()
    
    logger.info(f"Loaded {len(neighbourhoods)} neighbourhoods")
    logger.info(f"Loaded {len(business_licences)} business licences")
    logger.info(f"Loaded {len(dev_permits)} development permits")
    logger.info(f"Loaded {len(building_permits)} building permits")
    logger.info(f"Loaded {len(zoning)} zoning polygons")
    logger.info(f"Loaded {len(ped_bike)} ped/bike counts")
    
    # 2. Compute zoning shares
    logger.info("Step 2: Computing zoning shares...")
    zoning_shares = compute_zoning_shares(zoning, neighbourhoods)
    logger.info(f"Computed zoning shares for {len(zoning_shares)} neighbourhoods")
    
    # 3. Aggregate by neighbourhood and year
    logger.info("Step 3: Aggregating data...")
    business_agg = aggregate_business_licences(business_licences, neighbourhoods)
    dev_permits_agg = aggregate_permits(dev_permits, neighbourhoods, "development")
    building_permits_agg = aggregate_permits(building_permits, neighbourhoods, "building")
    ped_bike_agg = aggregate_ped_bike(ped_bike, neighbourhoods)
    
    logger.info(f"Aggregated business data: {len(business_agg)} records")
    logger.info(f"Aggregated dev permits: {len(dev_permits_agg)} records")
    logger.info(f"Aggregated building permits: {len(building_permits_agg)} records")
    logger.info(f"Aggregated ped/bike: {len(ped_bike_agg)} records")
    
    # 4. Build modeling table
    logger.info("Step 4: Building feature table...")
    full_df = build_modeling_table(
        neighbourhoods, business_agg, dev_permits_agg, building_permits_agg,
        ped_bike_agg, zoning_shares
    )
    logger.info(f"Built modeling table with {len(full_df)} records")
    
    # 5. Train model
    logger.info("Step 5: Training model...")
    results = train_and_evaluate(full_df)
    
    # 6. Evaluate
    logger.info("Step 6: Evaluating model...")
    metrics = evaluate_model(results, full_df)
    
    # 7. Export artifacts
    logger.info("Step 7: Exporting artifacts...")
    export_artifacts(neighbourhoods, full_df, results, metrics)
    
    logger.info("Pipeline completed successfully!")
    return results, metrics


if __name__ == "__main__":
    run_pipeline()
