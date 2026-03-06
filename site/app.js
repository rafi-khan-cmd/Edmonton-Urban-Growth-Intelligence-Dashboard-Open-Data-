// Global state
let map;
let predictionsLayer;
let predictionsData = {};
let predictionsIndex = {}; // Index: predictionsIndex[year][name] = feature
let timeseriesData = {};
let modelCard = {};
let currentYear = null;
let currentViewMode = 'score';
let chart = null;
let comparisonChart = null;
let scenarioAdjustments = { permits: 0, construction: 0, zoning: 0 };
let compareSelection = []; // Array of {name, year, props} for comparison

// Helper: Safe numeric formatting
function formatNumber(value, decimals = 1) {
    const num = Number(value);
    if (!isFinite(num)) return 'N/A';
    return num.toFixed(decimals);
}

// Helper: Safe numeric conversion
function safeNumber(value, defaultValue = 0) {
    const num = Number(value);
    return isFinite(num) ? num : defaultValue;
}

// Initialize
function initMap() {
    map = L.map('map').setView([53.5461, -113.4938], 11);
    // Use dark theme map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
}

// Load Model Card
async function loadModelCard() {
    try {
        const response = await fetch('./assets/model_card.json?v=' + Date.now());
        if (!response.ok) {
            console.warn('Model card not found, using defaults');
            return;
        }
        modelCard = await response.json();
        
        // Update Model Card UI with safe property access
        const maeEl = document.getElementById('metricMae');
        const rmseEl = document.getElementById('metricRmse');
        const topKEl = document.getElementById('metricTopK');
        const trainYearsEl = document.getElementById('trainYears');
        const testYearsEl = document.getElementById('testYears');
        const numNeighEl = document.getElementById('numNeighbourhoods');
        const freshnessEl = document.getElementById('dataFreshness');
        const updatedEl = document.getElementById('lastUpdated');
        
        if (maeEl && modelCard.metrics && modelCard.metrics.test && modelCard.metrics.test.mae !== undefined) {
            maeEl.textContent = formatNumber(modelCard.metrics.test.mae, 2);
        } else if (maeEl) {
            maeEl.textContent = 'N/A';
        }
        
        if (rmseEl && modelCard.metrics && modelCard.metrics.test && modelCard.metrics.test.rmse !== undefined) {
            rmseEl.textContent = formatNumber(modelCard.metrics.test.rmse, 2);
        } else if (rmseEl) {
            rmseEl.textContent = 'N/A';
        }
        
        if (topKEl && modelCard.metrics && modelCard.metrics.test && modelCard.metrics.test.top_k_overlap !== undefined) {
            topKEl.textContent = formatNumber(modelCard.metrics.test.top_k_overlap * 100, 1) + '%';
        } else if (topKEl) {
            topKEl.textContent = 'N/A';
        }
        
        if (trainYearsEl && modelCard.train_test_split && modelCard.train_test_split.train_years) {
            trainYearsEl.textContent = modelCard.train_test_split.train_years;
        } else if (trainYearsEl) {
            trainYearsEl.textContent = 'N/A';
        }
        
        if (testYearsEl && modelCard.train_test_split && modelCard.train_test_split.test_years) {
            testYearsEl.textContent = modelCard.train_test_split.test_years;
        } else if (testYearsEl) {
            testYearsEl.textContent = 'N/A';
        }
        
        if (numNeighEl && modelCard.data_ranges && modelCard.data_ranges.neighbourhoods !== undefined) {
            numNeighEl.textContent = modelCard.data_ranges.neighbourhoods;
        } else if (numNeighEl) {
            numNeighEl.textContent = 'N/A';
        }
        
        if (freshnessEl) {
            freshnessEl.textContent = modelCard.data_freshness ? 
                `Built from snapshots dated: ${modelCard.data_freshness}` : 
                'City of Edmonton Open Data';
        }
        
        if (updatedEl && modelCard.last_updated) {
            updatedEl.textContent = new Date(modelCard.last_updated).toLocaleString();
        } else if (updatedEl) {
            updatedEl.textContent = 'N/A';
        }
        
        // Update top features section
        updateTopFeatures();
    } catch (error) {
        console.error('Error loading model card:', error);
    }
}

// Update Top Features Section
function updateTopFeatures() {
    const content = document.getElementById('topFeaturesContent');
    if (!content) return;
    
    if (!modelCard || !modelCard.top_features || !Array.isArray(modelCard.top_features) || modelCard.top_features.length === 0) {
        content.innerHTML = '<p style="font-size: 0.85em; color: var(--text-muted);">Feature importance data not available.</p>';
        return;
    }
    
    const topFeatures = modelCard.top_features.slice(0, 5);
    const featureGroups = {
        'Business Activity': ['new_businesses', 'active_businesses', 'business_growth_rate'],
        'Development Signals': ['total_dev_permits', 'total_building_permits', 'total_construction_value', 'permit_growth_rate'],
        'Zoning Capacity': ['zoning_residential_pct', 'zoning_commercial_pct', 'zoning_industrial_pct', 'zoning_future_dev_pct', 'zoning_diversity'],
        'Vibrancy': ['avg_ped_bike_count', 'ped_bike_growth_rate'],
        'Derived/Emergence': ['emergence_score', 'build_pressure_score', 'commercial_gap_score']
    };
    
    let html = '<p style="font-size: 0.85em; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.6;">';
    html += 'Based on the current trained model\'s feature importance, these are the top features for predicting new business licences issued:';
    html += '</p><ul style="list-style: none; padding-left: 0;">';
    
    topFeatures.forEach((feature, idx) => {
        // Find which group this feature belongs to
        let group = 'Other';
        for (const [groupName, features] of Object.entries(featureGroups)) {
            if (features.includes(feature)) {
                group = groupName;
                break;
            }
        }
        
        html += `<li style="padding: 8px 0; border-bottom: 1px solid var(--border);">
            <span style="color: var(--primary-light); font-weight: 600;">#${idx + 1}</span>
            <span style="color: var(--text-primary); margin-left: 8px;">${feature.replace(/_/g, ' ')}</span>
            <span style="color: var(--text-muted); font-size: 0.8em; margin-left: 8px;">(${group})</span>
        </li>`;
    });
    
    html += '</ul>';
    html += '<p style="font-size: 0.75em; color: var(--text-muted); margin-top: 12px; font-style: italic;">';
    html += 'This analysis is based on the current trained model\'s feature importance, not a separate ablation experiment.';
    html += '</p>';
    
    content.innerHTML = html;
}

// Load data
async function loadData() {
    try {
        // Show loading state
        const topKContent = document.getElementById('topKContent');
        if (topKContent) {
            topKContent.innerHTML = '<div class="loading">Loading predictions...</div>';
        }
        
        // Load predictions
        const predictionsResponse = await fetch('./assets/predictions.geojson?v=' + Date.now());
        if (!predictionsResponse.ok) {
            throw new Error('Failed to load predictions.geojson');
        }
        const predictions = await predictionsResponse.json();
        
        // Organize by year and build index
        predictionsData = {};
        predictionsIndex = {};
        if (predictions.features) {
            predictions.features.forEach(feature => {
                const year = feature.properties.year;
                const name = feature.properties.name;
                
                if (!predictionsData[year]) {
                    predictionsData[year] = [];
                    predictionsIndex[year] = {};
                }
                predictionsData[year].push(feature);
                predictionsIndex[year][name] = feature;
            });
        }
        
        // Load timeseries using Papa Parse
        const timeseriesResponse = await fetch('./assets/timeseries.csv?v=' + Date.now());
        if (!timeseriesResponse.ok) {
            console.warn('Timeseries not found, continuing without it');
            timeseriesData = {};
        } else {
            const timeseriesText = await timeseriesResponse.text();
            
            // Use Papa Parse for robust CSV parsing
            if (typeof Papa !== 'undefined') {
                const parsed = Papa.parse(timeseriesText, {
                    header: true,
                    skipEmptyLines: true,
                    dynamicTyping: true // Automatically convert numbers
                });
                
                timeseriesData = {};
                parsed.data.forEach(record => {
                    const name = record.name;
                    if (!name) return;
                    
                    if (!timeseriesData[name]) {
                        timeseriesData[name] = [];
                    }
                    timeseriesData[name].push(record);
                });
            } else {
                // Fallback to manual parsing if Papa Parse not loaded
                console.warn('Papa Parse not loaded, using fallback CSV parsing');
                const lines = timeseriesText.split('\n');
                const headers = lines[0].split(',');
                
                timeseriesData = {};
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const values = lines[i].split(',');
                    const name = values[0];
                    
                    if (!timeseriesData[name]) {
                        timeseriesData[name] = [];
                    }
                    
                    const record = {};
                    headers.forEach((h, idx) => {
                        const val = values[idx];
                        // Try to convert to number
                        const numVal = Number(val);
                        record[h] = isFinite(numVal) ? numVal : val;
                    });
                    timeseriesData[name].push(record);
                }
            }
        }
        
        // Populate year selector with numeric sort
        const years = Object.keys(predictionsData).map(y => Number(y)).filter(y => !isNaN(y)).sort((a, b) => b - a);
        const yearSelect = document.getElementById('yearSelect');
        if (yearSelect && years.length > 0) {
            yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
            currentYear = String(years[0]);
            yearSelect.value = currentYear;
            updateMap();
            updateTopK();
        }
        
        // Initialize search
        initializeSearch();
        
    } catch (error) {
        console.error('Error loading data:', error);
        const topKContent = document.getElementById('topKContent');
        if (topKContent) {
            topKContent.innerHTML = '<div class="empty-state">Error loading data. Make sure assets are generated.</div>';
        }
    }
}

// Initialize search functionality
function initializeSearch() {
    const searchInput = document.getElementById('neighborhoodSearch');
    const suggestionsDiv = document.getElementById('searchSuggestions');
    
    if (!searchInput || !suggestionsDiv) return;
    
    // Get all unique neighborhood names
    const allNames = new Set();
    Object.values(predictionsData).forEach(features => {
        features.forEach(f => {
            if (f.properties && f.properties.name) {
                allNames.add(f.properties.name);
            }
        });
    });
    const namesArray = Array.from(allNames).sort();
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.classList.add('hidden');
        
        if (query.length < 2) return;
        
        const matches = namesArray.filter(name => 
            name.toLowerCase().includes(query)
        ).slice(0, 10);
        
        if (matches.length > 0) {
            matches.forEach(name => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.textContent = name;
                item.addEventListener('click', () => {
                    // Find feature for current year
                    if (currentYear && predictionsIndex[currentYear] && predictionsIndex[currentYear][name]) {
                        showInfoPanel(predictionsIndex[currentYear][name].properties);
                    } else {
                        // Try to find in any year
                        for (const year in predictionsIndex) {
                            if (predictionsIndex[year][name]) {
                                // Switch to that year
                                const yearSelect = document.getElementById('yearSelect');
                                if (yearSelect) {
                                    yearSelect.value = year;
                                    currentYear = year;
                                    updateMap();
                                    updateTopK();
                                }
                                showInfoPanel(predictionsIndex[year][name].properties);
                                break;
                            }
                        }
                    }
                    searchInput.value = '';
                    suggestionsDiv.classList.add('hidden');
                });
                suggestionsDiv.appendChild(item);
            });
            suggestionsDiv.classList.remove('hidden');
        }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.classList.add('hidden');
        }
    });
}

// Update map with selected year and view mode
function updateMap() {
    if (!currentYear || !predictionsData[currentYear]) return;
    
    // Remove existing layer
    if (predictionsLayer) {
        map.removeLayer(predictionsLayer);
    }
    
    // Apply scenario adjustments
    const features = applyScenarioAdjustments(predictionsData[currentYear]);
    
    // Get value based on view mode, handling missing actuals
    const getValue = (feature) => {
        switch(currentViewMode) {
            case 'score':
                return safeNumber(feature.properties.growth_score);
            case 'predicted':
                return safeNumber(feature.properties.y_pred);
            case 'actual':
                const yTrue = feature.properties.y_true;
                // Return null if missing, not 0
                return (yTrue !== null && yTrue !== undefined && isFinite(Number(yTrue))) ? Number(yTrue) : null;
            default:
                return safeNumber(feature.properties.growth_score);
        }
    };
    
    // Get values, filtering out nulls for min/max calculation
    const values = features.map(f => getValue(f)).filter(v => v !== null && isFinite(v));
    
    if (values.length === 0) {
        // Empty state: no valid values
        const topKContent = document.getElementById('topKContent');
        if (topKContent) {
            const emptyMessage = currentViewMode === 'actual' 
                ? 'Actual values unavailable for the selected year.'
                : 'No valid data available for selected view mode.';
            topKContent.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
        }
        return;
    }
    
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue;
    
    predictionsLayer = L.geoJSON(features, {
        style: function(feature) {
            const value = getValue(feature);
            
            // Handle missing actuals with special styling
            if (value === null) {
                return {
                    fillColor: '#808080', // Grey
                    color: 'rgba(255, 255, 255, 0.3)',
                    weight: 1.5,
                    fillOpacity: 0.3, // Lower opacity
                    dashArray: '5, 5' // Hatch pattern
                };
            }
            
            const normalized = range > 0 ? (value - minValue) / range : 0.5;
            
            // Color scale: blue (low) to red (high) - avoiding green
            // Go from 240 (blue) to 360/0 (red) via purple/magenta to skip green
            const hue = 240 + (normalized * 120); // 240 (blue) to 360 (red, wraps to 0)
            const saturation = 70 + (normalized * 20); // 70% to 90%
            const lightness = 45 + (normalized * 10); // 45% to 55%
            return {
                fillColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
                color: 'rgba(255, 255, 255, 0.3)',
                weight: 1.5,
                fillOpacity: 0.8
            };
        },
        onEachFeature: function(feature, layer) {
            const props = feature.properties;
            const value = getValue(feature);
            const label = currentViewMode === 'score' ? 'Score' : 
                         currentViewMode === 'predicted' ? 'Predicted' : 'Actual';
            
            const valueText = value === null ? 'N/A' : formatNumber(value, 1);
            const tooltipText = value === null && currentViewMode === 'actual' 
                ? `<strong>${props.name}</strong><br>${label}: N/A`
                : `<strong>${props.name}</strong><br>${label}: ${valueText}`;
            
            layer.bindTooltip(tooltipText);
            
            layer.on({
                click: function() {
                    showInfoPanel(props);
                }
            });
        }
    }).addTo(map);
    
    // Update legend
    updateLegend(minValue, maxValue);
}

// Apply scenario adjustments
function applyScenarioAdjustments(features) {
    if (scenarioAdjustments.permits === 0 && 
        scenarioAdjustments.construction === 0 && 
        scenarioAdjustments.zoning === 0) {
        return features;
    }
    
    return features.map(f => {
        const newFeature = JSON.parse(JSON.stringify(f));
        const props = newFeature.properties;
        
        // Adjust permits
        if (props.feat_total_dev_permits) {
            props.feat_total_dev_permits *= (1 + scenarioAdjustments.permits / 100);
        }
        
        // Adjust construction value
        if (props.feat_total_construction_value) {
            props.feat_total_construction_value *= (1 + scenarioAdjustments.construction / 100);
        }
        
        // Adjust future dev zoning (assume it's 0-100 scale, if 0-1 scale adjust accordingly)
        if (props.feat_zoning_future_dev_pct !== undefined) {
            const currentZoning = safeNumber(props.feat_zoning_future_dev_pct);
            // Check if it's 0-1 scale (decimal) or 0-100 scale (percentage)
            const isDecimal = currentZoning <= 1.0 && currentZoning >= 0;
            if (isDecimal) {
                // 0-1 scale: convert percentage change to decimal change
                props.feat_zoning_future_dev_pct = Math.max(0, Math.min(1, 
                    currentZoning + (scenarioAdjustments.zoning / 100)));
            } else {
                // 0-100 scale: apply percentage change directly
                props.feat_zoning_future_dev_pct = Math.max(0, Math.min(100, 
                    currentZoning + scenarioAdjustments.zoning));
            }
        }
        
        // Recalculate prediction (simplified heuristic - not a full model re-run)
        // Weight adjustments: permits and construction value are strong signals
        // Zoning is structural capacity, less immediate impact
        const permitsWeight = 0.4;
        const constructionWeight = 0.4;
        const zoningWeight = 0.2;
        const adjustment = (
            (scenarioAdjustments.permits / 100) * permitsWeight +
            (scenarioAdjustments.construction / 100) * constructionWeight +
            (scenarioAdjustments.zoning / 100) * zoningWeight
        );
        // Adjust both y_pred and growth_score proportionally
        props.y_pred = Math.max(0, safeNumber(props.y_pred) * (1 + adjustment));
        props.growth_score = Math.max(0, Math.min(100, safeNumber(props.growth_score) * (1 + adjustment)));
        
        return newFeature;
    });
}

// Update legend
function updateLegend(minValue, maxValue) {
    const legend = document.getElementById('legend');
    if (!legend) return;
    
    const label = currentViewMode === 'score' ? 'Growth Score (0-100)' :
                 currentViewMode === 'predicted' ? 'Predicted New Licences Issued (count)' :
                 'Actual New Licences Issued (count)';
    
    const h4 = legend.querySelector('h4');
    if (h4) h4.textContent = label;
    
    const labels = legend.querySelectorAll('.legend-labels span');
    if (labels.length >= 2) {
        labels[0].textContent = isFinite(minValue) ? formatNumber(minValue, 1) : 'N/A';
        labels[1].textContent = isFinite(maxValue) ? formatNumber(maxValue, 1) : 'N/A';
    }
    
    // Add note for missing actuals if in actual mode
    if (currentViewMode === 'actual') {
        let note = legend.querySelector('.legend-note');
        if (!note) {
            note = document.createElement('div');
            note.className = 'legend-note';
            note.style.cssText = 'font-size: 0.75em; color: #999; margin-top: 5px;';
            legend.appendChild(note);
        }
        note.textContent = 'Grey = Actual N/A';
    } else {
        const note = legend.querySelector('.legend-note');
        if (note) note.remove();
    }
}

// Update Top-K lists
function updateTopK() {
    if (!currentYear || !predictionsData[currentYear]) return;
    
    const features = predictionsData[currentYear];
    const zoningFilter = safeNumber(document.getElementById('zoningFilter')?.value, 0);
    
    // Filter by zoning if needed
    let filtered = features;
    if (zoningFilter > 0) {
        filtered = features.filter(f => {
            const futureDev = safeNumber(f.properties.feat_zoning_future_dev_pct, 0);
            return futureDev >= zoningFilter;
        });
    }
    
    // Sort by different criteria
    const sortedByScore = [...filtered].sort((a, b) => 
        safeNumber(b.properties.growth_score, 0) - safeNumber(a.properties.growth_score, 0)
    );
    
    // Sort by actual growth when available, otherwise predicted
    // This ensures "High Absolute Growth" shows areas with actual high growth, not just predicted
    const sortedByPredicted = [...filtered].sort((a, b) => {
        const aActual = a.properties.y_true !== null && a.properties.y_true !== undefined ? safeNumber(a.properties.y_true) : null;
        const bActual = b.properties.y_true !== null && b.properties.y_true !== undefined ? safeNumber(b.properties.y_true) : null;
        
        // Use actual if available, otherwise predicted
        const aValue = (aActual !== null && isFinite(aActual)) ? aActual : safeNumber(a.properties.y_pred, 0);
        const bValue = (bActual !== null && isFinite(bActual)) ? bActual : safeNumber(b.properties.y_pred, 0);
        
        return bValue - aValue;
    });
    
    // Calculate "Emerging" - should use growth rate or emergence score, not just growth_score
    // Use emergence_score if available, otherwise use business_growth_rate, fallback to growth_score
    const sortedEmerging = [...filtered].map(f => {
        const emergenceScore = safeNumber(f.properties.emergence_score);
        const growthRate = safeNumber(f.properties.feat_business_growth_rate);
        const growthScore = safeNumber(f.properties.growth_score, 0);
        
        // Prefer emergence_score if it exists (even if 0 or negative), then growth_rate, then growth_score
        let emerging_score;
        if (f.properties.emergence_score !== undefined && isFinite(emergenceScore)) {
            // Emergence score can be negative (declining), but we want positive (emerging)
            emerging_score = Math.max(0, emergenceScore) * 100; // Scale up and ensure non-negative
        } else if (f.properties.feat_business_growth_rate !== undefined && isFinite(growthRate)) {
            // Growth rate is percentage change, scale appropriately
            emerging_score = Math.max(0, growthRate) * 100; // Ensure non-negative for "emerging"
        } else {
            // Fallback to growth_score
            emerging_score = growthScore;
        }
        
        return { ...f, emerging_score: emerging_score };
    }).sort((a, b) => b.emerging_score - a.emerging_score);
    
    // Calculate under-served (low business density but high predicted growth)
    // Under-served = areas with LOW current density AND HIGH predicted growth
    // BUT exclude areas where actual >> predicted (they're over-performing/thriving, not under-served)
    // PERFORMANCE: Compute maxActive once before mapping
    const maxActive = Math.max(...filtered.map(f => safeNumber(f.properties.feat_active_businesses, 0)));
    
    const sortedUnderserved = [...filtered].map(f => {
        const activeBusinesses = safeNumber(f.properties.feat_active_businesses, 0);
        const predicted = safeNumber(f.properties.y_pred, 0);
        const actual = f.properties.y_true !== null && f.properties.y_true !== undefined ? safeNumber(f.properties.y_true) : null;
        
        // Normalize active businesses to 0-1 scale (inverse: low density = high score)
        const normalizedDensity = maxActive > 0 ? 1 - (activeBusinesses / maxActive) : 1;
        
        // Check if area is over-performing (actual >> predicted)
        // If so, exclude from under-served - they're thriving, not under-served
        let growthPotential = predicted;
        if (actual !== null && isFinite(actual) && predicted > 0) {
            const overPerformanceRatio = actual / predicted;
            // If actual is 2x+ higher than predicted, this area is thriving (not under-served)
            if (overPerformanceRatio >= 2.0) {
                growthPotential = 0; // Exclude from under-served ranking
            }
        }
        
        // Under-served score = growth potential × (1 - normalized density)
        // This identifies: areas with high predicted growth AND low current density
        // But excludes areas where actual >> predicted (they're already thriving)
        const underserved_score = growthPotential * normalizedDensity;
        
        return { ...f, underserved_score: underserved_score };
    }).sort((a, b) => b.underserved_score - a.underserved_score);
    
    // Get active tab
    const activeTab = document.querySelector('.top-k-tabs .tab-btn.active')?.dataset.tab || 'emerging';
    
    let sorted;
    let title;
    let helperText = '';
    switch(activeTab) {
        case 'emerging':
            sorted = sortedEmerging;
            title = 'Emerging Neighbourhoods';
            helperText = 'Fast-rising areas based on acceleration and recent growth momentum.';
            break;
        case 'absolute':
            sorted = sortedByPredicted;
            title = 'Highest Absolute Growth';
            helperText = 'Neighbourhoods with the highest actual or predicted licence issuance.';
            break;
        case 'underserved':
            sorted = sortedUnderserved;
            title = 'Under-served Opportunity Areas';
            helperText = 'Areas with relatively low current business density but strong projected growth.';
            break;
        default:
            sorted = sortedByScore;
            title = 'Top 10 Neighbourhoods';
    }
    
    // Update helper text
    const helperTextEl = document.getElementById('topKHelperText');
    if (helperTextEl) {
        helperTextEl.textContent = helperText;
        helperTextEl.style.cssText = 'font-size: 0.8em; color: var(--text-muted); margin-bottom: 12px; font-style: italic;';
    }
    
    const container = document.getElementById('topKContent');
    container.innerHTML = `
        <h3 style="font-size: 0.9em; margin-bottom: 10px; color: #667eea;">${title}</h3>
        ${sorted.slice(0, 10).map((f, idx) => {
            const props = f.properties;
            const rank = idx + 1;
            const name = props.name || 'Unknown';
            const year = props.year || currentYear;
            
            // Use index lookup instead of embedding JSON
            return `
                <div class="neighbourhood-item" data-name="${name}" data-year="${year}">
                    <div class="name">
                        <span class="rank">#${rank}</span> ${name}
                    </div>
                    <div class="metrics">
                        <span>Score: ${formatNumber(props.growth_score, 1)}</span>
                        ${props.y_true !== null && props.y_true !== undefined && isFinite(Number(props.y_true)) 
                            ? `<span>Actual: ${formatNumber(props.y_true, 1)}</span>` 
                            : `<span>Predicted: ${formatNumber(props.y_pred, 1)}</span>`}
                    </div>
                </div>
            `;
        }).join('')}
    `;
    
    // Add click handlers using index lookup
    container.querySelectorAll('.neighbourhood-item').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.getAttribute('data-name');
            const year = item.getAttribute('data-year');
            
            if (predictionsIndex[year] && predictionsIndex[year][name]) {
                showInfoPanel(predictionsIndex[year][name].properties);
            }
        });
    });
}

// Show info panel with explanations
function showInfoPanel(props) {
    const panel = document.getElementById('infoPanel');
    const title = document.getElementById('panelTitle');
    const content = document.getElementById('panelContent');
    
    if (!panel || !title || !content) return;
    
    title.textContent = props.name || 'Unknown';
    
    // Get top drivers - use feature importance from model if available, otherwise use feature values
    // First try to use top_features from model (global importance)
    let drivers = [];
    if (modelCard && modelCard.top_features && Array.isArray(modelCard.top_features)) {
        // Use model's top features and show their values for this neighbourhood
        drivers = modelCard.top_features.slice(0, 5).map(featureName => {
            const featKey = `feat_${featureName}`;
            const value = safeNumber(props[featKey], 0);
            return {
                name: featureName.replace(/_/g, ' '),
                value: value,
                importance: true // Mark as important feature
            };
        });
    } else {
        // Fallback: use features with highest absolute values
        const featurePrefix = 'feat_';
        drivers = Object.keys(props)
            .filter(k => k.startsWith(featurePrefix))
            .map(k => ({
                name: k.replace(featurePrefix, '').replace(/_/g, ' '),
                value: safeNumber(props[k], 0),
                importance: false
            }))
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 5);
    }
    
    let html = `
        <div class="info-row">
            <span class="info-label">Year:</span>
            <span class="info-value">${props.year || 'N/A'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Predicted New Licences Issued:</span>
            <span class="info-value">${formatNumber(props.y_pred, 1)}</span>
        </div>
    `;
    
    // Handle missing actuals properly
    if (props.y_true !== null && props.y_true !== undefined && isFinite(Number(props.y_true))) {
        html += `
            <div class="info-row">
                <span class="info-label">Actual New Licences Issued:</span>
                <span class="info-value">${formatNumber(props.y_true, 1)}</span>
            </div>
        `;
    } else {
        html += `
            <div class="info-row">
                <span class="info-label">Actual New Licences Issued:</span>
                <span class="info-value">N/A</span>
            </div>
        `;
    }
    
    html += `
        <div class="info-row">
            <span class="info-label">Growth Score:</span>
            <span class="info-value">${formatNumber(props.growth_score, 1)}</span>
        </div>
    `;
    
    // Add "Why this neighbourhood?" section
    if (drivers.length > 0) {
        html += `
            <div class="why-section" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
                <strong style="display: block; margin-bottom: 12px; color: var(--primary-light); font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.5px;">Why this neighbourhood?</strong>
                <p style="font-size: 0.85em; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.6;">
                    This neighbourhood ranks highly due to a combination of development activity, current business momentum, and structural capacity indicators.
                </p>
                <div class="features-list">
                    <strong>Top Drivers:</strong>
                    <ul>
                        ${drivers.map(d => `<li>${d.name}: ${formatNumber(d.value, 2)}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
    }
    
    if (props.top_features && Array.isArray(props.top_features)) {
        html += `
            <div class="features-list">
                <strong>Important Features:</strong>
                <ul>
                    ${props.top_features.map(f => `<li>${f.replace(/_/g, ' ')}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    // Add scenario mode disclaimer if active
    if (scenarioAdjustments.permits !== 0 || scenarioAdjustments.construction !== 0 || scenarioAdjustments.zoning !== 0) {
        html += `
            <div class="scenario-disclaimer" style="margin-top: 15px; padding: 10px; background: #fff3cd; border-left: 3px solid #ffc107; font-size: 0.85em;">
                <strong>⚠️ Scenario Mode Active:</strong> Values shown are approximate adjustments, not full model re-runs. Best used for directional exploration.
            </div>
        `;
    }
    
    // Add use with caution note
    html += `
        <div class="caution-note" style="margin-top: 15px; padding: 10px; background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--error); font-size: 0.85em; color: var(--text-secondary);">
            <strong>Use with caution:</strong> These predictions are intended for screening and exploratory analysis, not causal claims or guaranteed outcomes.
        </div>
    `;
    
    content.innerHTML = html;
    
    // Show chart
    if (timeseriesData[props.name] && timeseriesData[props.name].length > 0) {
        showChart(props.name);
    } else {
        // Show empty state for chart
        const canvas = document.getElementById('chartCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Could add a message here if needed
        }
    }
    
    panel.classList.remove('hidden');
}

// Show chart
function showChart(neighbourhoodName) {
    const data = timeseriesData[neighbourhoodName];
    if (!data || data.length === 0) return;
    
    const canvas = document.getElementById('chartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (chart) {
        chart.destroy();
    }
    
    // Fix year sorting: numeric sort
    const years = data.map(d => safeNumber(d.year)).filter(y => isFinite(y)).sort((a, b) => a - b);
    
    const predicted = years.map(y => {
        const record = data.find(d => safeNumber(d.year) === y);
        return safeNumber(record?.y_pred, 0);
    });
    const actual = years.map(y => {
        const record = data.find(d => safeNumber(d.year) === y);
        return safeNumber(record?.new_businesses, 0);
    });
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Predicted Licences Issued',
                data: predicted,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }, {
                label: 'Actual Licences Issued',
                data: actual,
                borderColor: '#f093fb',
                backgroundColor: 'rgba(240, 147, 251, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Compare Mode Functions
function addToCompare(props) {
    const name = props.name;
    const year = props.year || currentYear;
    
    // Check if already in comparison
    const exists = compareSelection.find(item => item.name === name && item.year === year);
    if (exists) {
        return; // Already added
    }
    
    // Limit to 2 neighbourhoods
    if (compareSelection.length >= 2) {
        compareSelection.shift(); // Remove oldest
    }
    
    compareSelection.push({ name, year, props });
    updateComparisonTray();
    
    // If we have 2, show comparison panel
    if (compareSelection.length === 2) {
        showComparisonPanel();
    }
}

function removeFromCompare(name, year) {
    compareSelection = compareSelection.filter(item => !(item.name === name && item.year === year));
    updateComparisonTray();
}

function updateComparisonTray() {
    const tray = document.getElementById('comparisonTray');
    if (!tray) return;
    
    // Hide comparison panel if less than 2 items
    const panel = document.getElementById('comparisonPanel');
    if (panel && compareSelection.length < 2) {
        panel.classList.add('hidden');
    }
    
    if (compareSelection.length === 0) {
        tray.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85em;">No neighbourhoods selected for comparison. Click "Add to Compare" in the info panel.</p>';
        return;
    }
    
    tray.innerHTML = `
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            ${compareSelection.map(item => `
                <div class="comparison-item" style="padding: 12px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border); flex: 1; min-width: 200px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <strong>${item.name}</strong>
                            <div style="font-size: 0.8em; color: var(--text-muted);">Year: ${item.year}</div>
                        </div>
                        <button class="remove-compare-btn" data-name="${item.name}" data-year="${item.year}" style="background: var(--error); color: white; border: none; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; font-size: 0.9em;">×</button>
                    </div>
                </div>
            `).join('')}
        </div>
        ${compareSelection.length < 2 ? '<p style="color: var(--text-muted); font-size: 0.85em; margin-top: 12px;">Add one more neighbourhood to compare.</p>' : ''}
        <button id="clearComparison" class="btn-secondary" style="margin-top: 12px;">Clear Comparison</button>
    `;
    
    // Add event listeners
    tray.querySelectorAll('.remove-compare-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-name');
            const year = btn.getAttribute('data-year');
            removeFromCompare(name, year);
        });
    });
    
    const clearBtn = document.getElementById('clearComparison');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            compareSelection = [];
            updateComparisonTray();
            const panel = document.getElementById('comparisonPanel');
            if (panel) panel.classList.add('hidden');
        });
    }
}

function showComparisonPanel() {
    const panel = document.getElementById('comparisonPanel');
    if (!panel || compareSelection.length !== 2) return;
    
    const [item1, item2] = compareSelection;
    const content = document.getElementById('comparisonContent');
    if (!content) return;
    
    // Comparison fields
    const fields = [
        { key: 'y_pred', label: 'Predicted Licences Issued' },
        { key: 'y_true', label: 'Actual Licences Issued' },
        { key: 'growth_score', label: 'Growth Score' },
        { key: 'feat_new_businesses', label: 'New Businesses (t)' },
        { key: 'feat_active_businesses', label: 'Active Businesses' },
        { key: 'feat_total_dev_permits', label: 'Dev Permits' },
        { key: 'feat_total_building_permits', label: 'Building Permits' },
        { key: 'feat_total_construction_value', label: 'Construction Value' },
        { key: 'feat_zoning_future_dev_pct', label: 'Future Dev Zoning %' },
        { key: 'feat_zoning_commercial_pct', label: 'Commercial Zoning %' },
        { key: 'feat_business_growth_rate', label: 'Business Growth Rate' },
        { key: 'emergence_score', label: 'Emergence Score' }
    ];
    
    let html = `
        <div class="comparison-table" style="margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border);">
                        <th style="text-align: left; padding: 12px; color: var(--text-secondary); font-weight: 600;">Metric</th>
                        <th style="text-align: right; padding: 12px; color: var(--text-primary); font-weight: 700;">${item1.name}</th>
                        <th style="text-align: right; padding: 12px; color: var(--text-primary); font-weight: 700;">${item2.name}</th>
                    </tr>
                </thead>
                <tbody>
                    ${fields.map(field => {
                        const val1 = item1.props[field.key];
                        const val2 = item2.props[field.key];
                        const display1 = (val1 !== null && val1 !== undefined && isFinite(Number(val1))) ? formatNumber(val1, 2) : 'N/A';
                        const display2 = (val2 !== null && val2 !== undefined && isFinite(Number(val2))) ? formatNumber(val2, 2) : 'N/A';
                        return `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 10px; color: var(--text-secondary);">${field.label}</td>
                                <td style="padding: 10px; text-align: right; color: var(--text-primary); font-weight: 600;">${display1}</td>
                                <td style="padding: 10px; text-align: right; color: var(--text-primary); font-weight: 600;">${display2}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    content.innerHTML = html;
    
    // Show comparison chart
    showComparisonChart([item1, item2]);
    
    panel.classList.remove('hidden');
}

function showComparisonChart(items) {
    const canvas = document.getElementById('comparisonChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    // Get timeseries data for both
    const datasets = [];
    const colors = ['#667eea', '#f093fb', '#10b981', '#f59e0b'];
    
    items.forEach((item, idx) => {
        const data = timeseriesData[item.name];
        if (!data || data.length === 0) return;
        
        const years = data.map(d => safeNumber(d.year)).filter(y => isFinite(y)).sort((a, b) => a - b);
        const predicted = years.map(y => {
            const record = data.find(d => safeNumber(d.year) === y);
            return safeNumber(record?.y_pred, 0);
        });
        const actual = years.map(y => {
            const record = data.find(d => safeNumber(d.year) === y);
            return safeNumber(record?.new_businesses, 0);
        });
        
        datasets.push({
            label: `${item.name} - Predicted`,
            data: predicted,
            borderColor: colors[idx * 2],
            backgroundColor: colors[idx * 2] + '20',
            tension: 0.4
        });
        
        datasets.push({
            label: `${item.name} - Actual`,
            data: actual,
            borderColor: colors[idx * 2 + 1],
            backgroundColor: colors[idx * 2 + 1] + '20',
            tension: 0.4,
            borderDash: [5, 5]
        });
    });
    
    if (datasets.length === 0) return;
    
    const allYears = new Set();
    items.forEach(item => {
        const data = timeseriesData[item.name];
        if (data) {
            data.forEach(d => {
                const y = safeNumber(d.year);
                if (isFinite(y)) allYears.add(y);
            });
        }
    });
    const sortedYears = Array.from(allYears).sort((a, b) => a - b);
    
    comparisonChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedYears,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Setup event listeners (called after DOM is ready)
function setupEventListeners() {
    const yearSelect = document.getElementById('yearSelect');
    if (yearSelect) {
        yearSelect.addEventListener('change', (e) => {
            currentYear = e.target.value;
            updateMap();
            updateTopK();
        });
    }

    const viewMode = document.getElementById('viewMode');
    if (viewMode) {
        viewMode.addEventListener('change', (e) => {
            currentViewMode = e.target.value;
            updateMap();
        });
    }

    const zoningFilter = document.getElementById('zoningFilter');
    if (zoningFilter) {
        zoningFilter.addEventListener('change', () => {
            updateTopK();
        });
    }

    const closePanel = document.getElementById('closePanel');
    if (closePanel) {
        closePanel.addEventListener('click', () => {
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel) infoPanel.classList.add('hidden');
        });
    }

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadData();
            loadModelCard();
        });
    }

    // Compare button
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            const panel = document.getElementById('infoPanel');
            const title = document.getElementById('panelTitle');
            if (panel && title && !panel.classList.contains('hidden')) {
                // Get current neighbourhood props from predictionsIndex
                const name = title.textContent;
                if (currentYear && predictionsIndex[currentYear] && predictionsIndex[currentYear][name]) {
                    addToCompare(predictionsIndex[currentYear][name].properties);
                }
            }
        });
    }

    // Comparison panel close
    const closeComparison = document.getElementById('closeComparison');
    if (closeComparison) {
        closeComparison.addEventListener('click', () => {
            const panel = document.getElementById('comparisonPanel');
            if (panel) panel.classList.add('hidden');
        });
    }

    // Model Card details modal
    const viewTechnicalDetails = document.getElementById('viewTechnicalDetails');
    const modelCardModal = document.getElementById('modelCardModal');
    const closeModal = document.getElementById('closeModal');
    
    if (viewTechnicalDetails && modelCardModal) {
        viewTechnicalDetails.addEventListener('click', () => {
            showModelCardDetails();
            modelCardModal.classList.remove('hidden');
        });
    }
    
    if (closeModal && modelCardModal) {
        closeModal.addEventListener('click', () => {
            modelCardModal.classList.add('hidden');
        });
    }
    
    // Close modal on outside click
    if (modelCardModal) {
        modelCardModal.addEventListener('click', (e) => {
            if (e.target === modelCardModal) {
                modelCardModal.classList.add('hidden');
            }
        });
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from siblings
            btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content based on tab
            if (btn.parentElement.classList.contains('top-k-tabs')) {
                updateTopK();
            } else if (btn.parentElement.classList.contains('eval-tabs')) {
                updateEvaluation(btn.dataset.tab);
            }
        });
    });

    // Scenario mode
    const scenarioMode = document.getElementById('scenarioMode');
    if (scenarioMode) {
        scenarioMode.addEventListener('change', (e) => {
            const sliders = document.getElementById('scenarioSliders');
            if (sliders) {
                if (e.target.checked) {
                    sliders.classList.remove('hidden');
                } else {
                    sliders.classList.add('hidden');
                    scenarioAdjustments = { permits: 0, construction: 0, zoning: 0 };
                    updateMap();
                }
            }
        });
    }

    const permitsSlider = document.getElementById('permitsSlider');
    if (permitsSlider) {
        permitsSlider.addEventListener('input', (e) => {
            scenarioAdjustments.permits = safeNumber(e.target.value, 0);
            const adjEl = document.getElementById('permitsAdj');
            if (adjEl) adjEl.textContent = formatNumber(scenarioAdjustments.permits, 0) + '%';
            updateMap();
        });
    }

    const constructionSlider = document.getElementById('constructionSlider');
    if (constructionSlider) {
        constructionSlider.addEventListener('input', (e) => {
            scenarioAdjustments.construction = safeNumber(e.target.value, 0);
            const adjEl = document.getElementById('constructionAdj');
            if (adjEl) adjEl.textContent = formatNumber(scenarioAdjustments.construction, 0) + '%';
            updateMap();
        });
    }

    const zoningSlider = document.getElementById('zoningSlider');
    if (zoningSlider) {
        zoningSlider.addEventListener('input', (e) => {
            scenarioAdjustments.zoning = safeNumber(e.target.value, 0);
            const adjEl = document.getElementById('zoningAdj');
            if (adjEl) adjEl.textContent = formatNumber(scenarioAdjustments.zoning, 0) + '%';
            updateMap();
        });
    }

    const resetScenario = document.getElementById('resetScenario');
    if (resetScenario) {
        resetScenario.addEventListener('click', () => {
            scenarioAdjustments = { permits: 0, construction: 0, zoning: 0 };
            const permitsSlider = document.getElementById('permitsSlider');
            const constructionSlider = document.getElementById('constructionSlider');
            const zoningSlider = document.getElementById('zoningSlider');
            const permitsAdj = document.getElementById('permitsAdj');
            const constructionAdj = document.getElementById('constructionAdj');
            const zoningAdj = document.getElementById('zoningAdj');
            if (permitsSlider) permitsSlider.value = 0;
            if (constructionSlider) constructionSlider.value = 0;
            if (zoningSlider) zoningSlider.value = 0;
            if (permitsAdj) permitsAdj.textContent = '0%';
            if (constructionAdj) constructionAdj.textContent = '0%';
            if (zoningAdj) zoningAdj.textContent = '0%';
            updateMap();
        });
    }
}

// Update evaluation section
function updateEvaluation(tab) {
    const container = document.getElementById('evaluationContent');
    if (!container) return;
    
    if (tab === 'validation') {
        const trainYears = modelCard.train_test_split?.train_years || 'N/A';
        const testYears = modelCard.train_test_split?.test_years || 'N/A';
        const trainSamples = modelCard.data_ranges?.train_samples !== undefined ? modelCard.data_ranges.train_samples : 'N/A';
        const testSamples = modelCard.data_ranges?.test_samples !== undefined ? modelCard.data_ranges.test_samples : 'N/A';
        const method = modelCard.train_test_split?.method || 'time_based';
        const mae = modelCard.metrics?.test?.mae !== undefined ? formatNumber(modelCard.metrics.test.mae, 2) : 'N/A';
        const rmse = modelCard.metrics?.test?.rmse !== undefined ? formatNumber(modelCard.metrics.test.rmse, 2) : 'N/A';
        const topK = modelCard.metrics?.test?.top_k_overlap !== undefined ? formatNumber(modelCard.metrics.test.top_k_overlap * 100, 1) + '%' : 'N/A';
        
        container.innerHTML = `
            <div class="eval-section">
                <h4>Time Split Validation</h4>
                <p><strong>Method:</strong> ${method}</p>
                <p><strong>Train Years:</strong> ${trainYears}</p>
                <p><strong>Test Years:</strong> ${testYears}</p>
                <p><strong>Train Samples:</strong> ${trainSamples}</p>
                <p><strong>Test Samples:</strong> ${testSamples}</p>
            </div>
            <div class="eval-section">
                <h4>How to Interpret Metrics</h4>
                <p><strong>MAE (${mae}):</strong> Average absolute forecast error in number of licences issued. Lower is better.</p>
                <p><strong>RMSE (${rmse}):</strong> Penalizes larger forecast misses more heavily. Lower is better.</p>
                <p><strong>Top-20 Accuracy (${topK}):</strong> Ability to identify the highest-growth neighbourhoods. Higher is better.</p>
            </div>
            <div class="eval-section">
                <h4>Geographic Holdout</h4>
                <p>Not implemented in current version</p>
            </div>
        `;
    } else if (tab === 'errors') {
        // Display worst prediction errors from model_card.json
        // Check if modelCard is loaded and has the data
        if (!modelCard || !modelCard.metrics || !modelCard.metrics.test) {
            container.innerHTML = `
                <div class="eval-section">
                    <h4>Error Analysis</h4>
                    <p class="empty-state">Model card data not loaded yet. Please wait...</p>
                    <p class="disclaimer">Note: Explanations indicate correlation, not causation.</p>
                </div>
            `;
            return;
        }
        
        const worstErrors = modelCard.metrics.test.worst_errors || [];
        if (worstErrors.length > 0) {
            container.innerHTML = `
                <div class="eval-section">
                    <h4>Worst Predictions (Top 10 by Error)</h4>
                    <p style="font-size: 0.85em; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.6;">
                        Large errors may reflect unusual permit activity, sparse historical data, or atypical neighbourhood dynamics.
                    </p>
                    <div class="error-list">
                        ${worstErrors.map((err, idx) => {
                            const name = err.name || err.neighbourhood || 'Unknown';
                            const predicted = err.y_pred !== undefined ? err.y_pred : (err.predicted !== undefined ? err.predicted : 0);
                            const actual = err.y_true !== undefined ? err.y_true : (err.actual !== undefined ? err.actual : 0);
                            const error = err.error !== undefined ? err.error : Math.abs(safeNumber(predicted) - safeNumber(actual));
                            const year = err.year !== undefined ? err.year : 'N/A';
                            const isOverPrediction = safeNumber(predicted) > safeNumber(actual);
                            const errorClass = isOverPrediction ? 'error-over' : 'error-under';
                            return `
                                <div class="error-item ${errorClass}">
                                    <div class="error-rank">#${idx + 1}</div>
                                    <div class="error-details">
                                        <strong>${name}</strong>
                                        <div class="error-year">Year: ${year}</div>
                                        <div class="error-metrics">
                                            <span>Predicted: ${formatNumber(predicted, 1)}</span>
                                            <span>Actual: ${formatNumber(actual, 1)}</span>
                                            <span class="error-value">Error: ${formatNumber(error, 1)}</span>
                                            <span style="font-size: 0.8em; color: var(--text-muted);">(${isOverPrediction ? 'over-predicted' : 'under-predicted'})</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <p class="disclaimer">Note: Explanations indicate correlation, not causation.</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="eval-section">
                    <h4>Error Analysis</h4>
                    <p class="empty-state">Error analysis data not available. The model_card.json may not include worst_errors field.</p>
                    <p class="disclaimer">Note: Explanations indicate correlation, not causation.</p>
                </div>
            `;
        }
    }
}

// Show Model Card Details
function showModelCardDetails() {
    const details = document.getElementById('modelCardDetails');
    if (!details) return;
    
    const trainYears = modelCard.train_test_split?.train_years || 'N/A';
    const testYears = modelCard.train_test_split?.test_years || 'N/A';
    const yearMin = modelCard.data_ranges?.year_min || 'N/A';
    const yearMax = modelCard.data_ranges?.year_max || 'N/A';
    const neighborhoods = modelCard.data_ranges?.neighbourhoods || 'N/A';
    const samples = modelCard.data_ranges?.samples || 'N/A';
    const features = modelCard.features?.length || 0;
    const topFeatures = modelCard.top_features || [];
    const dataFreshness = modelCard.data_freshness || 'N/A';
    const lastUpdated = modelCard.last_updated ? new Date(modelCard.last_updated).toLocaleString() : 'N/A';
    
    details.innerHTML = `
        <div class="detail-section">
            <h3>Data Information</h3>
            <p><strong>Data Freshness:</strong> ${dataFreshness}</p>
            <p><strong>Year Range:</strong> ${yearMin} - ${yearMax}</p>
            <p><strong>Neighbourhoods:</strong> ${neighborhoods}</p>
            <p><strong>Total Samples:</strong> ${samples}</p>
        </div>
        <div class="detail-section">
            <h3>Train/Test Split</h3>
            <p><strong>Method:</strong> Time-based split</p>
            <p><strong>Train Years:</strong> ${trainYears}</p>
            <p><strong>Test Years:</strong> ${testYears}</p>
        </div>
        <div class="detail-section">
            <h3>Model Information</h3>
            <p><strong>Algorithm:</strong> Gradient Boosting (LightGBM)</p>
            <p><strong>Feature Count:</strong> ${features}</p>
            <p><strong>Top Features:</strong> ${topFeatures.length > 0 ? topFeatures.join(', ') : 'N/A'}</p>
        </div>
        <div class="detail-section">
            <h3>Target Definition</h3>
            <p>Number of new business licences issued in year (t+1) for each neighbourhood, predicted using features from year t.</p>
        </div>
        <div class="detail-section">
            <h3>Limitations</h3>
            <ul style="margin-left: 20px; color: var(--text-secondary);">
                <li>Forecasts new business licences issued, not revenue or business success</li>
                <li>Uses open-data proxies and historical patterns</li>
                <li>Zoning treated as static (doesn't change over time)</li>
                <li>Scenario mode is approximate</li>
                <li>Intended for exploratory planning and screening, not causal claims</li>
            </ul>
        </div>
        <div class="detail-section">
            <p><strong>Last Updated:</strong> ${lastUpdated}</p>
        </div>
    `;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setupEventListeners();
        initMap();
        loadModelCard();
        loadData();
        // Ensure comparison panel is hidden on load
        const panel = document.getElementById('comparisonPanel');
        if (panel) {
            panel.classList.add('hidden');
        }
        // Initialize empty comparison tray
        updateComparisonTray();
    });
} else {
    // DOM already loaded
    setupEventListeners();
    initMap();
    loadModelCard();
    loadData();
    // Ensure comparison panel is hidden on load
    const panel = document.getElementById('comparisonPanel');
    if (panel) {
        panel.classList.add('hidden');
    }
    // Initialize empty comparison tray
    updateComparisonTray();
}
