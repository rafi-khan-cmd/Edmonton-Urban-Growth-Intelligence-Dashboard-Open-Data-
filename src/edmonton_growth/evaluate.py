"""Model evaluation metrics."""

import pandas as pd
import numpy as np
import logging
from .utils import load_config

logger = logging.getLogger(__name__)


def compute_top_k_overlap(y_true, y_pred, k=20):
    """Compute overlap between top K neighbourhoods by true vs predicted."""
    params = load_config("parameters")
    k = params["evaluation"]["top_k"]
    
    # Get top K by true and predicted
    top_true = y_true.nlargest(k).index.tolist()
    top_pred = y_pred.nlargest(k).index.tolist()
    
    overlap = len(set(top_true) & set(top_pred))
    return overlap / k


def evaluate_model(results, full_df):
    """Compute comprehensive evaluation metrics."""
    pred_df = results["predictions"]
    
    # Top-K overlap
    top_k = load_config("parameters")["evaluation"]["top_k"]
    
    # Group by neighbourhood and aggregate
    neigh_agg = pred_df.groupby("name").agg({
        "y_true": "sum",
        "y_pred": "sum"
    })
    
    overlap = compute_top_k_overlap(neigh_agg["y_true"], neigh_agg["y_pred"], top_k)
    
    metrics = results["metrics"]
    metrics["top_k_overlap"] = overlap
    
    # Compute error analysis (worst predictions)
    pred_df["error"] = abs(pred_df["y_pred"] - pred_df["y_true"])
    worst_errors = pred_df.nlargest(10, "error")[["name", "year", "y_true", "y_pred", "error"]].to_dict("records")
    metrics["worst_errors"] = worst_errors
    
    logger.info(f"Top-{top_k} overlap: {overlap:.3f}")
    
    return metrics
