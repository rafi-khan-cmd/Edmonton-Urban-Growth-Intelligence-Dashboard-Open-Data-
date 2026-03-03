// Global state
let map;
let predictionsLayer;
let predictionsData = {};
let timeseriesData = {};
let modelCard = {};
let currentYear = null;
let currentViewMode = 'score';
let currentGrowthTarget = 'commercial';
let chart = null;
let scenarioAdjustments = { permits: 0, construction: 0, zoning: 0 };

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
        const response = await fetch('assets/model_card.json?v=' + Date.now());
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
            maeEl.textContent = modelCard.metrics.test.mae.toFixed(2);
        }
        
        if (rmseEl && modelCard.metrics && modelCard.metrics.test && modelCard.metrics.test.rmse !== undefined) {
            rmseEl.textContent = modelCard.metrics.test.rmse.toFixed(2);
        }
        
        if (topKEl && modelCard.metrics && modelCard.metrics.test && modelCard.metrics.test.top_k_overlap !== undefined) {
            topKEl.textContent = (modelCard.metrics.test.top_k_overlap * 100).toFixed(1) + '%';
        }
        
        if (trainYearsEl && modelCard.train_test_split && modelCard.train_test_split.train_years) {
            trainYearsEl.textContent = modelCard.train_test_split.train_years;
        }
        
        if (testYearsEl && modelCard.train_test_split && modelCard.train_test_split.test_years) {
            testYearsEl.textContent = modelCard.train_test_split.test_years;
        }
        
        if (numNeighEl && modelCard.data_ranges && modelCard.data_ranges.neighbourhoods !== undefined) {
            numNeighEl.textContent = modelCard.data_ranges.neighbourhoods;
        }
        
        if (freshnessEl) {
            freshnessEl.textContent = modelCard.data_freshness ? 
                `Built from snapshots dated: ${modelCard.data_freshness}` : 
                'City of Edmonton Open Data';
        }
        
        if (updatedEl && modelCard.last_updated) {
            updatedEl.textContent = new Date(modelCard.last_updated).toLocaleString();
        }
    } catch (error) {
        console.error('Error loading model card:', error);
    }
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
        const predictionsResponse = await fetch('assets/predictions.geojson?v=' + Date.now());
        if (!predictionsResponse.ok) {
            throw new Error('Failed to load predictions.geojson');
        }
        const predictions = await predictionsResponse.json();
        
        // Organize by year
        if (predictions.features) {
            predictions.features.forEach(feature => {
                const year = feature.properties.year;
                if (!predictionsData[year]) {
                    predictionsData[year] = [];
                }
                predictionsData[year].push(feature);
            });
        }
        
        // Load timeseries
        const timeseriesResponse = await fetch('assets/timeseries.csv?v=' + Date.now());
        if (!timeseriesResponse.ok) {
            console.warn('Timeseries not found, continuing without it');
            timeseriesData = {};
        } else {
            const timeseriesText = await timeseriesResponse.text();
            const lines = timeseriesText.split('\n');
            const headers = lines[0].split(',');
            
            timeseriesData = {};
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const values = lines[i].split(',');
                const name = values[0];
                const year = parseInt(values[1]);
                
                if (!timeseriesData[name]) {
                    timeseriesData[name] = [];
                }
                
                const record = {};
                headers.forEach((h, idx) => {
                    record[h] = values[idx];
                });
                timeseriesData[name].push(record);
            }
        }
        
        // Populate year selector
        const years = Object.keys(predictionsData).sort((a, b) => b - a);
        const yearSelect = document.getElementById('yearSelect');
        if (yearSelect && years.length > 0) {
            yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
            currentYear = years[0];
            yearSelect.value = currentYear;
            updateMap();
            updateTopK();
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        const topKContent = document.getElementById('topKContent');
        if (topKContent) {
            topKContent.innerHTML = '<div class="empty-state">Error loading data. Make sure assets are generated.</div>';
        }
    }
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
    
    // Get value based on view mode
    const getValue = (feature) => {
        switch(currentViewMode) {
            case 'score':
                return feature.properties.growth_score;
            case 'predicted':
                return feature.properties.y_pred;
            case 'actual':
                return feature.properties.y_true || 0;
            default:
                return feature.properties.growth_score;
        }
    };
    
    const values = features.map(f => getValue(f));
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    
    predictionsLayer = L.geoJSON(features, {
        style: function(feature) {
            const value = getValue(feature);
            const normalized = (value - minValue) / (maxValue - minValue || 1);
            
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
            
            layer.bindTooltip(`
                <strong>${props.name}</strong><br>
                ${label}: ${value.toFixed(1)}
            `);
            
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
            const currentZoning = parseFloat(props.feat_zoning_future_dev_pct);
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
        
        // Recalculate prediction (simplified - would need model in JS for real recalculation)
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
        props.y_pred = Math.max(0, props.y_pred * (1 + adjustment));
        props.growth_score = Math.max(0, Math.min(100, props.growth_score * (1 + adjustment)));
        
        return newFeature;
    });
}

// Update legend
function updateLegend(minValue, maxValue) {
    const legend = document.getElementById('legend');
    const label = currentViewMode === 'score' ? 'Growth Score (0-100)' :
                 currentViewMode === 'predicted' ? 'Predicted New Licences (count)' :
                 'Actual New Licences (count)';
    
    legend.querySelector('h4').textContent = label;
    legend.querySelector('.legend-labels span:first-child').textContent = minValue.toFixed(1);
    legend.querySelector('.legend-labels span:last-child').textContent = maxValue.toFixed(1);
}

// Update Top-K lists
function updateTopK() {
    if (!currentYear || !predictionsData[currentYear]) return;
    
    const features = predictionsData[currentYear];
    const zoningFilter = parseFloat(document.getElementById('zoningFilter').value) || 0;
    
    // Filter by zoning if needed
    let filtered = features;
    if (zoningFilter > 0) {
        filtered = features.filter(f => {
            const futureDev = f.properties.feat_zoning_future_dev_pct || 0;
            return futureDev >= zoningFilter;
        });
    }
    
    // Sort by different criteria
    const sortedByScore = [...filtered].sort((a, b) => 
        b.properties.growth_score - a.properties.growth_score
    );
    
    const sortedByPredicted = [...filtered].sort((a, b) => 
        b.properties.y_pred - a.properties.y_pred
    );
    
    // Calculate "Emerging" - should use growth rate or emergence score, not just growth_score
    // Use emergence_score if available, otherwise use business_growth_rate, fallback to growth_score
    const sortedEmerging = [...filtered].map(f => {
        const emergenceScore = parseFloat(f.properties.emergence_score);
        const growthRate = parseFloat(f.properties.feat_business_growth_rate);
        const growthScore = f.properties.growth_score || 0;
        
        // Prefer emergence_score if it exists (even if 0 or negative), then growth_rate, then growth_score
        // Check for existence using !== undefined, not !== 0 (0 is a valid value)
        let emerging_score;
        if (f.properties.emergence_score !== undefined && !isNaN(emergenceScore)) {
            // Emergence score can be negative (declining), but we want positive (emerging)
            emerging_score = Math.max(0, emergenceScore) * 100; // Scale up and ensure non-negative
        } else if (f.properties.feat_business_growth_rate !== undefined && !isNaN(growthRate)) {
            // Growth rate is percentage change, scale appropriately
            emerging_score = Math.max(0, growthRate) * 100; // Ensure non-negative for "emerging"
        } else {
            // Fallback to growth_score
            emerging_score = growthScore;
        }
        
        return { ...f, emerging_score: emerging_score };
    }).sort((a, b) => b.emerging_score - a.emerging_score);
    
    // Calculate under-served (low business density but high predicted growth)
    // Under-served = high predicted growth BUT low current business density
    // Score should penalize neighborhoods with high active businesses
    const sortedUnderserved = [...filtered].map(f => {
        const activeBusinesses = parseFloat(f.properties.feat_active_businesses || 0);
        const predicted = f.properties.y_pred;
        
        // Normalize active businesses to 0-1 scale (inverse: low density = high score)
        const maxActive = Math.max(...filtered.map(f => parseFloat(f.properties.feat_active_businesses || 0)));
        const normalizedDensity = maxActive > 0 ? 1 - (activeBusinesses / maxActive) : 1;
        
        // Under-served score = predicted growth × (1 - normalized density)
        // This favors: high predicted growth AND low current density
        const underserved_score = predicted * normalizedDensity;
        
        return { ...f, underserved_score: underserved_score };
    }).sort((a, b) => b.underserved_score - a.underserved_score);
    
    // Get active tab
    const activeTab = document.querySelector('.top-k-tabs .tab-btn.active')?.dataset.tab || 'emerging';
    
    let sorted;
    let title;
    switch(activeTab) {
        case 'emerging':
            sorted = sortedEmerging;
            title = 'Top 10 Emerging Neighbourhoods (High Growth Rate/Emergence)';
            break;
        case 'absolute':
            sorted = sortedByPredicted;
            title = 'Top 10 High Absolute Growth (Count)';
            break;
        case 'underserved':
            sorted = sortedUnderserved;
            title = 'Top 10 Under-served (Low Density, High Predicted Growth)';
            break;
        default:
            sorted = sortedByScore;
            title = 'Top 10 Neighbourhoods';
    }
    
    const container = document.getElementById('topKContent');
    container.innerHTML = `
        <h3 style="font-size: 0.9em; margin-bottom: 10px; color: #667eea;">${title}</h3>
        ${sorted.slice(0, 10).map((f, idx) => {
            const props = f.properties;
            const rank = idx + 1;
            return `
                <div class="neighbourhood-item" data-props='${JSON.stringify(props)}'>
                    <div class="name">
                        <span class="rank">#${rank}</span> ${props.name}
                    </div>
                    <div class="metrics">
                        <span>Score: ${props.growth_score.toFixed(1)}</span>
                        <span>Predicted: ${props.y_pred.toFixed(1)}</span>
                    </div>
                </div>
            `;
        }).join('')}
    `;
    
    // Add click handlers
    container.querySelectorAll('.neighbourhood-item').forEach(item => {
        item.addEventListener('click', () => {
            const props = JSON.parse(item.getAttribute('data-props'));
            showInfoPanel(props);
        });
    });
}

// Show info panel with explanations
function showInfoPanel(props) {
    const panel = document.getElementById('infoPanel');
    const title = document.getElementById('panelTitle');
    const content = document.getElementById('panelContent');
    
    title.textContent = props.name;
    
    // Get top drivers - use feature importance from model if available, otherwise use feature values
    // First try to use top_features from model (global importance)
    let drivers = [];
    if (modelCard && modelCard.top_features && Array.isArray(modelCard.top_features)) {
        // Use model's top features and show their values for this neighbourhood
        drivers = modelCard.top_features.slice(0, 5).map(featureName => {
            const featKey = `feat_${featureName}`;
            const value = parseFloat(props[featKey] || 0);
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
                value: parseFloat(props[k] || 0),
                importance: false
            }))
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 5);
    }
    
    let html = `
        <div class="info-row">
            <span class="info-label">Year:</span>
            <span class="info-value">${props.year}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Predicted New Businesses:</span>
            <span class="info-value">${props.y_pred.toFixed(1)}</span>
        </div>
    `;
    
    if (props.y_true !== null && props.y_true !== undefined) {
        html += `
            <div class="info-row">
                <span class="info-label">Actual New Businesses:</span>
                <span class="info-value">${props.y_true}</span>
            </div>
        `;
    }
    
    html += `
        <div class="info-row">
            <span class="info-label">Growth Score:</span>
            <span class="info-value">${props.growth_score.toFixed(1)}</span>
        </div>
    `;
    
    if (drivers.length > 0) {
        html += `
            <div class="features-list">
                <strong>Top Drivers:</strong>
                <ul>
                    ${drivers.map(d => `<li>${d.name}: ${d.value.toFixed(2)}</li>`).join('')}
                </ul>
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
    
    content.innerHTML = html;
    
    // Show chart
    if (timeseriesData[props.name]) {
        showChart(props.name);
    }
    
    panel.classList.remove('hidden');
}

// Show chart
function showChart(neighbourhoodName) {
    const data = timeseriesData[neighbourhoodName];
    if (!data || data.length === 0) return;
    
    const canvas = document.getElementById('chartCanvas');
    const ctx = canvas.getContext('2d');
    
    if (chart) {
        chart.destroy();
    }
    
    const years = data.map(d => parseInt(d.year)).sort();
    const predicted = years.map(y => {
        const record = data.find(d => parseInt(d.year) === y);
        return parseFloat(record.y_pred || 0);
    });
    const actual = years.map(y => {
        const record = data.find(d => parseInt(d.year) === y);
        return parseFloat(record.new_businesses || 0);
    });
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Predicted',
                data: predicted,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }, {
                label: 'Actual',
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

    const growthTarget = document.getElementById('growthTarget');
    if (growthTarget) {
        growthTarget.addEventListener('change', (e) => {
            currentGrowthTarget = e.target.value;
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
            scenarioAdjustments.permits = parseFloat(e.target.value);
            const adjEl = document.getElementById('permitsAdj');
            if (adjEl) adjEl.textContent = e.target.value + '%';
            updateMap();
        });
    }

    const constructionSlider = document.getElementById('constructionSlider');
    if (constructionSlider) {
        constructionSlider.addEventListener('input', (e) => {
            scenarioAdjustments.construction = parseFloat(e.target.value);
            const adjEl = document.getElementById('constructionAdj');
            if (adjEl) adjEl.textContent = e.target.value + '%';
            updateMap();
        });
    }

    const zoningSlider = document.getElementById('zoningSlider');
    if (zoningSlider) {
        zoningSlider.addEventListener('input', (e) => {
            scenarioAdjustments.zoning = parseFloat(e.target.value);
            const adjEl = document.getElementById('zoningAdj');
            if (adjEl) adjEl.textContent = e.target.value + '%';
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
    
    if (tab === 'validation') {
        container.innerHTML = `
            <div class="eval-section">
                <h4>Time Split Validation</h4>
                <p><strong>Train:</strong> ${modelCard.train_test_split.train_years}</p>
                <p><strong>Test:</strong> ${modelCard.train_test_split.test_years}</p>
                <p><strong>Train Samples:</strong> ${modelCard.data_ranges.train_samples}</p>
                <p><strong>Test Samples:</strong> ${modelCard.data_ranges.test_samples}</p>
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
                    <div class="error-list">
                        ${worstErrors.map((err, idx) => {
                            const name = err.name || err.neighbourhood || 'Unknown';
                            const predicted = err.y_pred !== undefined ? err.y_pred : (err.predicted !== undefined ? err.predicted : 0);
                            const actual = err.y_true !== undefined ? err.y_true : (err.actual !== undefined ? err.actual : 0);
                            const error = err.error !== undefined ? err.error : Math.abs(predicted - actual);
                            return `
                                <div class="error-item">
                                    <div class="error-rank">#${idx + 1}</div>
                                    <div class="error-details">
                                        <strong>${name}</strong>
                                        ${err.year ? `<div class="error-year">Year: ${err.year}</div>` : ''}
                                        <div class="error-metrics">
                                            <span>Predicted: ${typeof predicted === 'number' ? predicted.toFixed(1) : predicted}</span>
                                            <span>Actual: ${actual}</span>
                                            <span class="error-value">Error: ${typeof error === 'number' ? error.toFixed(1) : error}</span>
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setupEventListeners();
        initMap();
        loadModelCard();
        loadData();
    });
} else {
    // DOM already loaded
    setupEventListeners();
    initMap();
    loadModelCard();
    loadData();
}
