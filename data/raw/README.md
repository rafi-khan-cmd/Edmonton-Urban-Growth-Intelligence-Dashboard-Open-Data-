# Data Directory

Place your CSV and GeoJSON files here.

## Required Files

1. `neighbourhoods.geojson` or `neighbourhoods.csv` - Neighbourhood boundaries
2. `business_licences.csv` - Business licence data
3. `Zoning_Bylaw_Geographical_Data_20260301.csv` - Zoning data

## Optional Files

4. `development_permits.csv` - Development permit data
5. `building_permits.csv` - Building permit data  
6. `ped_bike_counts.csv` - Pedestrian/bicycle count data

## Sample Data

For testing, you can create minimal sample files. The pipeline will handle missing optional files gracefully.

### Example: business_licences.csv
```csv
issue_date,latitude,longitude,status
2020-01-15,53.5461,-113.4938,Active
2020-06-20,53.5500,-113.5000,Active
2021-03-10,53.5461,-113.4938,Active
```

### Example: neighbourhoods.geojson
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {"name": "Downtown"},
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-113.5, 53.54], [-113.49, 53.54], [-113.49, 53.55], [-113.5, 53.55], [-113.5, 53.54]]]
      }
    }
  ]
}
```
