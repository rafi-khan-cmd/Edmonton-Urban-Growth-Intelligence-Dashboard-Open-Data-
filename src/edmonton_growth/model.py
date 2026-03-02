"""Model training and prediction."""

import pandas as pd
import numpy as np
import logging
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split
import lightgbm as lgb
from .utils import load_config

logger = logging.getLogger(__name__)


def get_feature_columns():
    """Get list of feature columns."""
    return [
        "new_businesses",
        "active_businesses",
        "business_growth_rate",
        "total_dev_permits",
        "total_building_permits",
        "total_construction_value",
        "permit_growth_rate",
        "zoning_residential_pct",
        "zoning_commercial_pct",
        "zoning_industrial_pct",
        "zoning_future_dev_pct",
        "zoning_diversity",
        "avg_ped_bike_count",
        "ped_bike_growth_rate"
    ]


def baseline_lag_model(X_train, y_train, X_test):
    """Simple baseline: predict using lag (new_businesses_t)."""
    if "new_businesses" in X_train.columns:
        y_pred = X_test["new_businesses"].values
    else:
        y_pred = np.full(len(X_test), y_train.mean())
    return y_pred


def train_gradient_boosting(X_train, y_train, X_val=None, y_val=None):
    """Train LightGBM model."""
    feature_cols = [c for c in get_feature_columns() if c in X_train.columns]
    
    train_data = lgb.Dataset(X_train[feature_cols], label=y_train)
    
    params = {
        'objective': 'regression',
        'metric': 'rmse',
        'boosting_type': 'gbdt',
        'num_leaves': 31,
        'learning_rate': 0.05,
        'feature_fraction': 0.9,
        'bagging_fraction': 0.8,
        'bagging_freq': 5,
        'verbose': -1
    }
    
    valid_sets = [train_data]
    valid_names = ['train']
    if X_val is not None and y_val is not None:
        val_data = lgb.Dataset(X_val[feature_cols], label=y_val)
        valid_sets.append(val_data)
        valid_names.append('val')
    
    model = lgb.train(
        params,
        train_data,
        num_boost_round=100,
        valid_sets=valid_sets,
        valid_names=valid_names,
        callbacks=[lgb.early_stopping(stopping_rounds=10, verbose=False)]
    )
    
    return model, feature_cols


def train_and_evaluate(df):
    """Train models and return predictions."""
    params = load_config("parameters")
    
    # Prepare data
    feature_cols = [c for c in get_feature_columns() if c in df.columns]
    X = df[["name", "year"] + feature_cols].copy()
    y = df["y"].values
    
    # Time-based split
    test_years = params["model"]["test_years"]
    max_year = df["year"].max()
    test_year_threshold = max_year - test_years + 1
    
    train_mask = df["year"] < test_year_threshold
    test_mask = df["year"] >= test_year_threshold
    
    X_train = X[train_mask].copy()
    y_train = y[train_mask]
    X_test = X[test_mask].copy()
    y_test = y[test_mask]
    
    logger.info(f"Train: {len(X_train)} samples, Test: {len(X_test)} samples")
    
    # Baseline
    y_pred_baseline = baseline_lag_model(X_train, y_train, X_test)
    mae_baseline = mean_absolute_error(y_test, y_pred_baseline)
    rmse_baseline = np.sqrt(mean_squared_error(y_test, y_pred_baseline))
    
    logger.info(f"Baseline - MAE: {mae_baseline:.2f}, RMSE: {rmse_baseline:.2f}")
    
    # Gradient Boosting
    model, model_feature_cols = train_gradient_boosting(
        X_train[feature_cols], y_train,
        X_test[feature_cols], y_test
    )
    
    y_pred_gb = model.predict(X_test[model_feature_cols])
    mae_gb = mean_absolute_error(y_test, y_pred_gb)
    rmse_gb = np.sqrt(mean_squared_error(y_test, y_pred_gb))
    
    logger.info(f"Gradient Boosting - MAE: {mae_gb:.2f}, RMSE: {rmse_gb:.2f}")
    
    # Feature importance
    importance = pd.DataFrame({
        "feature": model_feature_cols,
        "importance": model.feature_importance(importance_type='gain')
    }).sort_values("importance", ascending=False)
    
    # Add predictions to test set
    X_test["y_true"] = y_test
    X_test["y_pred"] = y_pred_gb
    X_test["y_pred_baseline"] = y_pred_baseline
    
    return {
        "model": model,
        "feature_cols": model_feature_cols,
        "predictions": X_test,
        "importance": importance,
        "metrics": {
            "baseline": {"mae": mae_baseline, "rmse": rmse_baseline},
            "gradient_boosting": {"mae": mae_gb, "rmse": rmse_gb}
        }
    }
