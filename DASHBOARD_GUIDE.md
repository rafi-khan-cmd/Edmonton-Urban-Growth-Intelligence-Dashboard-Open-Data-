# Edmonton Urban Growth Intelligence Dashboard - Interpretation Guide

## 📊 Model Card Metrics (Top Panel)

### **MAE (Mean Absolute Error)**
- **What it means**: Average prediction error in number of business licences
- **How to read**: Lower is better. If MAE = 2.5, predictions are off by ~2.5 licences on average
- **Example**: MAE of 3.2 means the model predicts within ±3.2 new business licences on average

### **RMSE (Root Mean Square Error)**
- **What it means**: Similar to MAE but penalizes larger errors more
- **How to read**: Lower is better. Usually higher than MAE
- **Example**: RMSE of 4.5 means larger prediction errors are weighted more heavily

### **Top-20 Accuracy**
- **What it means**: Percentage of neighbourhoods that appear in both predicted top 20 and actual top 20
- **How to read**: Higher is better (0-100%). 80% means 16 out of 20 top neighbourhoods were correctly identified
- **Why it matters**: Shows if the model can identify the "hottest" growth areas, not just exact counts

### **Training Period / Test Period**
- **What it means**: Years used to train vs. validate the model
- **How to read**: Model learned from training years, tested on test years
- **Example**: Train 2015-2020, Test 2021-2022 means model was trained on older data and tested on recent data

### **Neighbourhoods**
- **What it means**: Total number of neighbourhoods analyzed
- **How to read**: More neighbourhoods = more comprehensive analysis

---

## 🗺️ Map Visualization

### **Growth Score (0-100)**
- **What it means**: Normalized score showing **growth acceleration/uptick** compared to previous years
- **How it's calculated**: Prioritizes growth rates and acceleration over absolute counts:
  1. **Emergence Score** (growth acceleration - second derivative) - highest priority
  2. **Business Growth Rate** (year-over-year percentage change)
  3. **Calculated YoY Change** (from historical data)
  4. **Absolute Values** (fallback only)
- **How to read**: 
  - **0-20**: Low or negative growth acceleration
  - **20-40**: Below average growth rate
  - **40-60**: Average growth rate
  - **60-80**: Above average growth acceleration
  - **80-100**: High growth acceleration (emerging areas)
- **Color coding**: Blue (low) → Purple/Magenta (medium) → Red (high)
- **Important**: This focuses on **momentum and acceleration**, not absolute counts. A small neighborhood going from 2→10 businesses gets a higher score than a large one going from 100→105, even though the absolute count is lower.

### **Predicted Licences Issued**
- **What it means**: Actual predicted number of new business licences issued for next year
- **How to read**: Direct prediction from the model (e.g., "5.3 new licences issued")
- **Example**: If predicted = 8.5, the model expects ~8-9 new business licences to be issued next year
- **Note**: This serves as a proxy for commercial growth, not revenue or business success

### **Actual Licences Issued**
- **What it means**: Real number of new business licences issued that actually occurred (if available)
- **How to read**: Compare with predicted to see model accuracy
- **Example**: Predicted = 8.5, Actual = 7 means model was close but slightly optimistic

---

## 📈 Top Rankings Lists

### **Emerging Neighbourhoods**
- **What it means**: Fast-rising areas based on acceleration and recent growth momentum
- **How to read**: Neighbourhoods with highest growth rate (percentage increase), even if starting from low base
- **Use case**: Identify areas experiencing rapid commercial development

### **Highest Absolute Growth**
- **What it means**: Neighbourhoods with the highest actual or predicted licence issuance
- **How to read**: Areas expecting most new business licences issued, regardless of current size
- **Use case**: Identify major commercial expansion areas

### **Under-served Opportunity Areas**
- **What it means**: Areas with relatively low current business density but strong projected growth
- **How to read**: Neighbourhoods with growth potential but currently lacking businesses
- **Use case**: Identify opportunities for new commercial development

---

## 🎛️ Scenario Mode

### **What it does**: Simulates "what-if" scenarios by adjusting key indicators

### **Development Permits Slider**
- **What it adjusts**: Total number of development permits issued
- **Range**: -50% to +50%
- **Example**: +20% means simulate 20% more permits than actual
- **Impact**: More permits → higher predicted growth (commercial development signals)

### **Construction Value Slider**
- **What it adjusts**: Total construction investment value
- **Range**: -50% to +50%
- **Example**: +30% means simulate 30% more construction spending
- **Impact**: More construction → higher predicted growth (economic activity signal)

### **Future Dev Zoning Slider**
- **What it adjusts**: Percentage of neighbourhood zoned for future development
- **Range**: -20% to +20%
- **Example**: +10% means simulate 10% more future-development zoning
- **Impact**: More future-dev zoning → higher predicted growth (development capacity signal)

### **How to use Scenario Mode**:
1. Enable "Scenario Analysis Mode" checkbox
2. Adjust sliders to simulate different scenarios
3. Map updates in real-time showing new rankings
4. Compare how neighbourhood rankings change
5. Click "Reset All" to return to actual predictions

---

## 🔍 Neighbourhood Info Panel (Click on Map)

When you click a neighbourhood, you see:

### **Predicted New Licences Issued**
- Model's forecast for next year
- Example: "8.5" means ~8-9 new business licences issued expected
- Serves as a proxy for commercial growth

### **Actual New Licences Issued** (if available)
- What actually happened
- Compare with predicted to assess model accuracy

### **Growth Score**
- Normalized 0-100 score for easy comparison
- Higher = more growth potential relative to other neighbourhoods

### **Top Drivers**
- Key factors contributing to this neighbourhood's growth prediction
- Examples: "↑ permits", "↑ construction value", "zoning future dev %"
- Shows what's driving the prediction

### **Time Series Chart**
- Line chart showing predicted vs. actual over multiple years
- Helps see trends and model performance over time

---

## 📊 Evaluation Section

### **Validation Tab**
- **Time Split**: Shows train/test years and sample counts
- **Geographic Holdout**: (If implemented) Shows neighbourhoods held out for testing

### **Error Analysis Tab**
- **Worst Predictions**: Top 10 neighbourhoods with largest prediction errors
- Shows where the model struggles most
- Helps identify data quality issues or edge cases

---

## 🎯 Key Concepts

### **Growth Definition**
- **Target**: Number of new business licences issued in year (t+1)
- **Features**: Uses data from year (t) only (no data leakage)
- **What it predicts**: New business licences issued, which serves as a proxy for commercial growth

### **Why This Matters**
- Helps identify where commercial development is likely
- Useful for urban planning, business location decisions, investment
- Based on real City of Edmonton open data

### **Limitations**
- Forecasts new business licences issued, not revenue or business success
- Uses open-data proxies and historical patterns
- Zoning treated as static (doesn't change over time)
- Scenario mode is approximate
- Intended for exploratory planning and screening, not causal claims or guaranteed outcomes
- Predictions are probabilistic, not guarantees
- Model accuracy varies by neighbourhood type
- Explanations show correlation, not causation

---

## 💡 Quick Tips

1. **Start with Growth Score view** to see relative rankings
2. **Switch to Predicted Count** to see actual numbers
3. **Use Scenario Mode** to explore "what-if" questions
4. **Check Top Rankings** to find opportunities quickly
5. **Click neighbourhoods** to see detailed explanations
6. **Compare years** using the year selector to see trends

---

## 📚 Data Sources

All data comes from **City of Edmonton Open Data**:
- Business Licences
- Development Permits  
- Building Permits
- Zoning Bylaw
- Pedestrian/Bicycle Counts (optional)

**Last Updated**: Shows when the model was last retrained with fresh data
