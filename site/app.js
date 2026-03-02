let map;
let predictionsLayer;
let predictionsData = {};
let timeseriesData = {};
let currentYear = null;
let chart = null;

// Initialize map
function initMap() {
    map = L.map('map').setView([53.5461, -113.4938], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// Load data
async function loadData() {
    try {
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
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Error loading data. Make sure assets are generated.');
    }
}

// Update map with selected year
function updateMap() {
    if (!currentYear || !predictionsData[currentYear]) return;
    
    // Remove existing layer
    if (predictionsLayer) {
        map.removeLayer(predictionsLayer);
    }
    
    // Create new layer
    const features = predictionsData[currentYear];
    const maxScore = Math.max(...features.map(f => f.properties.growth_score));
    const minScore = Math.min(...features.map(f => f.properties.growth_score));
    
    predictionsLayer = L.geoJSON(features, {
        style: function(feature) {
            const score = feature.properties.growth_score;
            const normalized = (score - minScore) / (maxScore - minScore || 1);
            
            // Color scale: blue (low) to red (high)
            const hue = (1 - normalized) * 240; // 240 = blue, 0 = red
            return {
                fillColor: `hsl(${hue}, 70%, 50%)`,
                color: '#333',
                weight: 1,
                fillOpacity: 0.7
            };
        },
        onEachFeature: function(feature, layer) {
            layer.on({
                click: function() {
                    showInfoPanel(feature.properties);
                }
            });
        }
    }).addTo(map);
    
    // Update top neighbourhoods
    updateTopNeighbourhoods(features);
}

// Update top neighbourhoods list
function updateTopNeighbourhoods(features) {
    const sorted = [...features].sort((a, b) => 
        b.properties.growth_score - a.properties.growth_score
    ).slice(0, 10);
    
    const container = document.getElementById('topNeighbourhoods');
    container.innerHTML = sorted.map((f, idx) => {
        const props = f.properties;
        const propsJson = JSON.stringify(props).replace(/"/g, '&quot;');
        return `
            <div class="neighbourhood-item" data-props='${JSON.stringify(props)}'>
                <div class="name">${idx + 1}. ${props.name}</div>
                <div class="score">Score: ${props.growth_score.toFixed(1)}</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('.neighbourhood-item').forEach(item => {
        item.addEventListener('click', () => {
            const props = JSON.parse(item.getAttribute('data-props'));
            showInfoPanel(props);
        });
    });
}

// Show info panel
function showInfoPanel(props) {
    const panel = document.getElementById('infoPanel');
    const title = document.getElementById('panelTitle');
    const content = document.getElementById('panelContent');
    
    title.textContent = props.name;
    
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
    
    if (props.top_features && Array.isArray(props.top_features)) {
        html += `
            <div class="features-list">
                <strong>Top Features:</strong>
                <ul>
                    ${props.top_features.map(f => `<li>${f}</li>`).join('')}
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
    const values = years.map(y => {
        const record = data.find(d => parseInt(d.year) === y);
        return parseFloat(record.y_pred || record.new_businesses || 0);
    });
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'New Businesses (Predicted)',
                data: values,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
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
});

document.getElementById('closePanel').addEventListener('click', () => {
    document.getElementById('infoPanel').classList.add('hidden');
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData();
});

// Initialize
initMap();
loadData();
