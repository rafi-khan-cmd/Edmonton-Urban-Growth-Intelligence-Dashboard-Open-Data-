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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// Load Model Card
async function loadModelCard() {
    try {
        const response = await fetch('assets/model_card.json');
        modelCard = await response.json();
        
        // Update Model Card UI
        document.getElementById('metricMae').textContent = modelCard.metrics.test.mae.toFixed(2);
        document.getElementById('metricRmse').textContent = modelCard.metrics.test.rmse.toFixed(2);
        document.getElementById('metricTopK').textContent = (modelCard.metrics.test.top_k_overlap * 100).toFixed(1) + '%';
        document.getElementById('trainYears').textContent = modelCard.train_test_split.train_years;
        document.getElementById('testYears').textContent = modelCard.train_test_split.test_years;
        document.getElementById('numNeighbourhoods').textContent = modelCard.data_ranges.neighbourhoods;
        document.getElementById('dataFreshness').textContent = `Built from snapshots dated: ${modelCard.data_freshness}`;
        document.getElementById('lastUpdated').textContent = new Date(modelCard.last_updated).toLocaleString();
    } catch (error) {
        console.error('Error loading model card:', error);
    }
}

// Load data
async function loadData() {
    try {
        // Show loading state
        document.getElementById('topKContent').innerHTML = '<div class="loading">Loading predictions...</div>';
        
        // Load predictions
        const predictionsResponse = await fetch('assets/predictions.geojson');
        const predictions = await predictionsResponse.json();
        
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
        
        // Populate year selector
        const years = Object.keys(predictionsData).sort((a, b) => b - a);
        const yearSelect = document.getElementById('yearSelect');
        yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        
        if (years.length > 0) {
            currentYear = years[0];
            yearSelect.value = currentYear;
            updateMap();
            updateTopK();
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('topKContent').innerHTML = '<div class="empty-state">Error loading data. Make sure assets are generated.</div>';
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
            
            // Color scale: blue (low) to red (high)
            const hue = (1 - normalized) * 240;
            return {
                fillColor: `hsl(${hue}, 70%, 50%)`,
                color: '#333',
                weight: 1,
                fillOpacity: 0.7
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
            value: parseFloat(props[k] || 0)
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 5);
    
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

// Event listeners
document.getElementById('yearSelect').addEventListener('change', (e) => {
    currentYear = e.target.value;
    updateMap();
    updateTopK();
});

document.getElementById('viewMode').addEventListener('change', (e) => {
    currentViewMode = e.target.value;
    updateMap();
});

document.getElementById('growthTarget').addEventListener('change', (e) => {
    currentGrowthTarget = e.target.value;
    // Would need to load different predictions for different targets
    updateMap();
});

document.getElementById('zoningFilter').addEventListener('change', () => {
    updateTopK();
});

document.getElementById('closePanel').addEventListener('click', () => {
    document.getElementById('infoPanel').classList.add('hidden');
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData();
    loadModelCard();
});

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
document.getElementById('scenarioMode').addEventListener('change', (e) => {
    const sliders = document.getElementById('scenarioSliders');
    if (e.target.checked) {
        sliders.classList.remove('hidden');
    } else {
        sliders.classList.add('hidden');
        scenarioAdjustments = { permits: 0, construction: 0, zoning: 0 };
        updateMap();
    }
});

document.getElementById('permitsSlider').addEventListener('input', (e) => {
    scenarioAdjustments.permits = parseFloat(e.target.value);
    document.getElementById('permitsAdj').textContent = e.target.value + '%';
    updateMap();
});

document.getElementById('constructionSlider').addEventListener('input', (e) => {
    scenarioAdjustments.construction = parseFloat(e.target.value);
    document.getElementById('constructionAdj').textContent = e.target.value + '%';
    updateMap();
});

document.getElementById('zoningSlider').addEventListener('input', (e) => {
    scenarioAdjustments.zoning = parseFloat(e.target.value);
    document.getElementById('zoningAdj').textContent = e.target.value + '%';
    updateMap();
});

document.getElementById('resetScenario').addEventListener('click', () => {
    scenarioAdjustments = { permits: 0, construction: 0, zoning: 0 };
    document.getElementById('permitsSlider').value = 0;
    document.getElementById('constructionSlider').value = 0;
    document.getElementById('zoningSlider').value = 0;
    document.getElementById('permitsAdj').textContent = '0%';
    document.getElementById('constructionAdj').textContent = '0%';
    document.getElementById('zoningAdj').textContent = '0%';
    updateMap();
});

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
        // Would need error data from model_card.json
        container.innerHTML = `
            <div class="eval-section">
                <h4>Error Analysis</h4>
                <p>Error analysis data would be displayed here.</p>
                <p class="disclaimer">Note: Explanations indicate correlation, not causation.</p>
            </div>
        `;
    }
}

// Initialize
initMap();
loadModelCard();
loadData();
