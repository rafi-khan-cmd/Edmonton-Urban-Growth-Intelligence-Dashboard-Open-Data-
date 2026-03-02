"""Utility functions for the pipeline."""

import os
import yaml
from pathlib import Path
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_project_root():
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def load_config(config_name):
    """Load a YAML config file."""
    root = get_project_root()
    config_path = root / "config" / f"{config_name}.yml"
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)


def find_column(df, primary, alternates):
    """Find a column in dataframe using primary name or alternates."""
    if primary in df.columns:
        return primary
    for alt in alternates:
        if alt in df.columns:
            return alt
    return None


def safe_read_csv(path, **kwargs):
    """Safely read a CSV file, returning None if it doesn't exist."""
    if not os.path.exists(path):
        return None
    try:
        import pandas as pd
        return pd.read_csv(path, **kwargs)
    except Exception as e:
        logger.warning(f"Could not read {path}: {e}")
        return None
