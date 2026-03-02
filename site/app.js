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
    try {
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Map element not found!');
            return;
        }
        map = L.map('map').setView([53.5461, -113.4938], 11);
        // Use dark theme map tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);
        console.log('Map initialized');
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Load Model Card
async function loadModelCard() {
    try {
        console.log('Loading model card...');
        const response = await fetch('assets/model_card.json');
        if (!response.ok) {
            console.warn('Model card not found:', response.status);
            return;
        }
        modelCard = await response.json();
        console.log('Model card loaded:', modelCard);
        
        // Update Model Card UI - check elements exist first
        if (modelCard.metrics && modelCard.metrics.test) {
            const maeEl = document.getElementById('metricMae');
            const rmseEl = document.getElementById('metricRmse');
            const topKEl = document.getElementById('metricTopK');
            if (maeEl) {
                maeEl.textContent = (modelCard.metrics.test.mae || 0).toFixed(2);
                console.log('Updated MAE:', maeEl.textContent);
            }
            if (rmseEl) {
                rmseEl.textContent = (modelCard.metrics.test.rmse || 0).toFixed(2);
                console.log('Updated RMSE:', rmseEl.textContent);
            }
            if (topKEl) {
                topKEl.textContent = ((modelCard.metrics.test.top_k_overlap || 0) * 100).toFixed(1);
                console.log('Updated TopK:', topKEl.textContent);
            }
        }
        if (modelCard.train_test_split) {
            const trainEl = document.getElementById('trainYears');
            const testEl = document.getElementById('testYears');
            if (trainEl) {
                trainEl.textContent = modelCard.train_test_split.train_years || '-';
                console.log('Updated train years:', trainEl.textContent);
            }
            if (testEl) {
                testEl.textContent = modelCard.train_test_split.test_years || '-';
                console.log('Updated test years:', testEl.textContent);
            }
        }
        if (modelCard.data_ranges) {
            const neighEl = document.getElementById('numNeighbourhoods');
            if (neighEl) {
                neighEl.textContent = modelCard.data_ranges.neighbourhoods || '-';
                console.log('Updated neighbourhoods:', neighEl.textContent);
            }
        }
        const freshEl = document.getElementById('dataFreshness');
        if (freshEl) {
            freshEl.textContent = modelCard.data_freshness ? 
                `City of Edmonton Open Data (${modelCard.data_freshness})` : 'City of Edmonton Open Data';
        }
        const updatedEl = document.getElementById('lastUpdated');
        if (updatedEl) {
            updatedEl.textContent = modelCard.last_updated ? 
                new Date(modelCard.last_updated).toLocaleString() : '-';
        }
        console.log('Model card UI updated');
    } catch (error) {
        console.error('Error loading model card:', error);
    }
}

// Load data
async function loadData() {
    try {
        console.log('Loading data...');
        // Show loading state
        const topKContent = document.getElementById('topKContent');
        if (topKContent) topKContent.innerHTML = '<div class="loading">Loading predictions...</div>';
        
        // Load predictions
        console.log('Fetching predictions.geojson...');
        const predictionsResponse = await fetch('assets/predictions.geojson');
        if (!predictionsResponse.ok) {
            throw new Error(`Failed to load predictions.geojson: ${predictionsResponse.status}`);
        }
        const predictions = await predictionsResponse.json();
        console.log('Predictions loaded:', predictions.features ? predictions.features.length : 0, 'features');
        
        // Organize by year
        predictions.features.forEach(feature => {
            const year = feature.properties.year;
            if (!predictionsData[year]) {
                predictionsData[year] = [];
            }
            predictionsData[year].push(feature);
        });
        
        // Load timeseries
        const timeseriesResponse = await fetch('assets/timeseries.csv');
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
        yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        
        if (years.length > 0) {
            currentYear = years[0];
            yearSelect.value = currentYear;
            updateMap();
            updateTopK();
            
            // Populate search after data loads
            allNeighborhoods = predictionsData[currentYear].map(f => f.properties.name).sort();
            initializeSearch();
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
            
            // Color scale: blue (low) to red (high) - no green
            // Blue: hsl(240, 70%, 50%) to Red: hsl(0, 70%, 50%)
            const hue = 240 - (normalized * 240); // 240 (blue) to 0 (red)
            return {
                fillColor: `hsl(${hue}, 70%, 50%)`,
                color: 'rgba(0, 0, 0, 0.2)',
                weight: 1.5,
                fillOpacity: 0.75
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
        
        // Adjust future dev zoning
        if (props.feat_zoning_future_dev_pct) {
            props.feat_zoning_future_dev_pct = Math.max(0, Math.min(100, 
                props.feat_zoning_future_dev_pct + scenarioAdjustments.zoning));
        }
        
        // Recalculate prediction (simplified - would need model in JS for real recalculation)
        // For now, just adjust growth_score proportionally
        const adjustment = (scenarioAdjustments.permits + scenarioAdjustments.construction) / 200;
        props.growth_score = Math.max(0, Math.min(100, props.growth_score * (1 + adjustment)));
        
        return newFeature;
    });
}

// Update legend
function updateLegend(minValue, maxValue) {
    const legend = document.getElementById('legend');
    let label = '';
    if (currentViewMode === 'score') {
        label = 'Growth Score (0-100)';
    } else if (currentViewMode === 'predicted') {
        label = 'Predicted New Licences';
    } else {
        label = 'Actual New Licences';
    }
    
    if (legend) {
        legend.querySelector('h4').textContent = label;
        const labels = legend.querySelectorAll('.legend-labels span');
        if (labels.length >= 2) {
            labels[0].textContent = minValue.toFixed(1);
            labels[1].textContent = maxValue.toFixed(1);
        }
    }
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
    
    // Calculate under-served (low business density but high predicted growth)
    const sortedUnderserved = [...filtered].map(f => {
        const activeBusinesses = parseFloat(f.properties.feat_active_businesses || 0);
        const predicted = f.properties.y_pred;
        const density = activeBusinesses > 0 ? predicted / activeBusinesses : predicted;
        return { ...f, underserved_score: density };
    }).sort((a, b) => b.underserved_score - a.underserved_score);
    
    // Get active tab
    const activeTab = document.querySelector('.top-k-tabs .tab-btn.active')?.dataset.tab || 'emerging';
    
    let sorted;
    let title;
    switch(activeTab) {
        case 'emerging':
            sorted = sortedByScore;
            title = 'Top 10 Emerging Neighbourhoods (High Growth Rate)';
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
    
    // Get top drivers (features with highest values)
    const featurePrefix = 'feat_';
    const drivers = Object.keys(props)
        .filter(k => k.startsWith(featurePrefix))
        .map(k => ({
            name: k.replace(featurePrefix, '').replace(/_/g, ' '),
            value: parseFloat(props[k] || 0),
            key: k
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 5);
    
    // Format feature names nicely
    const formatFeatureName = (name) => {
        return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };
    
    let html = `
        <div class="info-section">
            <h3>Overview</h3>
            <div class="info-row">
                <span class="info-label">Year:</span>
                <span class="info-value">${props.year}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Growth Score:</span>
                <span class="info-value">${props.growth_score.toFixed(1)} / 100</span>
                <span class="info-help" title="Normalized score (0-100) representing predicted commercial growth potential">ℹ️</span>
            </div>
            <div class="info-row">
                <span class="info-label">Predicted New Businesses:</span>
                <span class="info-value">${props.y_pred.toFixed(1)}</span>
            </div>
    `;
    
    if (props.y_true !== null && props.y_true !== undefined) {
        const error = Math.abs(props.y_pred - props.y_true);
        html += `
            <div class="info-row">
                <span class="info-label">Actual New Businesses:</span>
                <span class="info-value">${props.y_true}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Prediction Error:</span>
                <span class="info-value">${error.toFixed(1)}</span>
            </div>
        `;
    }
    
    html += `</div>`;
    
    // Add detailed feature values
    if (drivers.length > 0) {
        html += `
            <div class="info-section">
                <h3>Key Indicators</h3>
                <div class="features-grid">
                    ${drivers.map(d => {
                        let displayValue = d.value.toFixed(2);
                        let unit = '';
                        if (d.key.includes('pct')) {
                            displayValue = d.value.toFixed(1);
                            unit = '%';
                        } else if (d.key.includes('value') || d.key.includes('construction')) {
                            displayValue = (d.value / 1000000).toFixed(2);
                            unit = 'M';
                        } else if (d.key.includes('count') || d.key.includes('businesses') || d.key.includes('permits')) {
                            displayValue = Math.round(d.value);
                            unit = '';
                        }
                        return `
                            <div class="feature-item">
                                <div class="feature-name">${formatFeatureName(d.name)}</div>
                                <div class="feature-value">${displayValue}${unit}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    if (props.top_features && Array.isArray(props.top_features)) {
        html += `
            <div class="info-section">
                <h3>Model Features</h3>
                <div class="features-list">
                    <p class="info-note">These features are most important for predictions across all neighborhoods:</p>
                    <ul>
                        ${props.top_features.map(f => `<li>${formatFeatureName(f)}</li>`).join('')}
                    </ul>
                </div>
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
            // Would need to load different predictions for different targets
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

// Search functionality
let allNeighborhoods = [];
let searchTimeout = null;

function initializeSearch() {
    const searchInput = document.getElementById('neighborhoodSearch');
    const suggestionsDiv = document.getElementById('searchSuggestions');
    
    if (!searchInput || !suggestionsDiv) {
        console.warn('Search elements not found, skipping search initialization');
        return;
    }
    
    // Remove existing listeners if any
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);
    
    newInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            suggestionsDiv.classList.add('hidden');
            return;
        }
        
        searchTimeout = setTimeout(() => {
            const matches = allNeighborhoods.filter(n => 
                n.toLowerCase().includes(query)
            ).slice(0, 10);
            
            if (matches.length > 0) {
                suggestionsDiv.innerHTML = matches.map(name => `
                    <div class="suggestion-item" data-name="${name}">${name}</div>
                `).join('');
                suggestionsDiv.classList.remove('hidden');
                
                // Add click handlers
                suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const name = item.getAttribute('data-name');
                        newInput.value = name;
                        suggestionsDiv.classList.add('hidden');
                        findAndShowNeighborhood(name);
                    });
                });
            } else {
                suggestionsDiv.classList.add('hidden');
            }
        }, 150);
    });
    
    // Handle Enter key
    newInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                findAndShowNeighborhood(query);
                suggestionsDiv.classList.add('hidden');
            }
        }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!newInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.classList.add('hidden');
        }
    });
}

function findAndShowNeighborhood(name) {
    if (!currentYear || !predictionsData[currentYear]) return;
    
    const feature = predictionsData[currentYear].find(f => 
        f.properties.name.toLowerCase() === name.toLowerCase()
    );
    
    if (feature) {
        showInfoPanel(feature.properties);
        // Zoom to neighborhood
        const bounds = L.geoJSON(feature).getBounds();
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else {
        alert(`Neighborhood "${name}" not found in ${currentYear} data.`);
    }
}

// Update evaluation section
function updateEvaluation(tab) {
    const container = document.getElementById('evaluationContent');
    
    if (tab === 'validation') {
        container.innerHTML = `
            <div class="eval-section">
                <h4>Time Split Validation</h4>
                <p><strong>Train Period:</strong> ${modelCard.train_test_split?.train_years || '-'}</p>
                <p><strong>Test Period:</strong> ${modelCard.train_test_split?.test_years || '-'}</p>
                <p><strong>Train Samples:</strong> ${modelCard.data_ranges?.train_samples || '-'}</p>
                <p><strong>Test Samples:</strong> ${modelCard.data_ranges?.test_samples || '-'}</p>
                <p class="disclaimer" style="margin-top: 12px;">
                    Model trained on historical data, tested on most recent years to simulate real-world forecasting.
                </p>
            </div>
            <div class="eval-section">
                <h4>Geographic Holdout</h4>
                <p>Geographic cross-validation not implemented in current version. All neighborhoods used in both train and test sets.</p>
            </div>
        `;
    } else if (tab === 'errors') {
        const worstErrors = modelCard.metrics?.test?.worst_errors || [];
        if (worstErrors.length > 0) {
            container.innerHTML = `
                <div class="eval-section">
                    <h4>Worst Predictions (Top 10 by Error)</h4>
                    <div class="error-list">
                        ${worstErrors.map((err, idx) => `
                            <div class="error-item">
                                <div class="error-rank">#${idx + 1}</div>
                                <div class="error-details">
                                    <div class="error-name">${err.name || 'Unknown'}</div>
                                    <div class="error-metrics">
                                        <span>Predicted: ${(err.y_pred || 0).toFixed(1)}</span>
                                        <span>Actual: ${err.y_true || 0}</span>
                                        <span class="error-value">Error: ${(err.error || 0).toFixed(1)}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <p class="disclaimer" style="margin-top: 12px;">
                        <strong>Common Patterns:</strong> High errors often occur in neighborhoods with unusual 
                        development patterns, data quality issues, or rapid changes not captured by historical trends.
                    </p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="eval-section">
                    <h4>Error Analysis</h4>
                    <p class="empty-state">Error analysis data not available. Check model_card.json for worst_errors field.</p>
                </div>
            `;
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, initializing...');
        try {
            setupEventListeners();
            initMap();
            loadModelCard();
            loadData();
        } catch (error) {
            console.error('Initialization error:', error);
        }
    });
} else {
    // DOM already loaded
    console.log('DOM already loaded, initializing...');
    try {
        setupEventListeners();
        initMap();
        loadModelCard();
        loadData();
    } catch (error) {
        console.error('Initialization error:', error);
    }
}
