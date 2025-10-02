import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calculator } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in Leaflet with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Interface for field book data
interface FieldObservation {
  point: string;
  y: number;
  x: number;
  hrms: number;
  vrms: number;
  sats: number;
  pdop: number;
  fp: string;
  date: string;
  description: string;
}

interface FieldBookData {
  observations: FieldObservation[];
  foundBeacons: FieldObservation[];
  placedBeacons: FieldObservation[];
}

interface CoordinateMapProps {
  fieldBookData: FieldBookData;
  onClose: () => void;
}

export const CoordinateMap: React.FC<CoordinateMapProps> = ({ fieldBookData, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedCorners, setSelectedCorners] = useState<FieldObservation[]>([]);
  const [calculatedArea, setCalculatedArea] = useState<any>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [mapError, setMapError] = useState<string>('');

  useEffect(() => {
    let map: L.Map | null = null;
    
    try {
      if (mapRef.current && !mapRef.current._leaflet_id) {
        // Initialize map
        map = L.map(mapRef.current, {
          center: [0, 0],
          zoom: 2,
          zoomControl: true,
          attributionControl: true
        });

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Process coordinates and add markers
        if (fieldBookData.observations.length > 0) {
          const bounds = L.latLngBounds([]);
          const allMarkers: L.Marker[] = [];
          
          fieldBookData.observations.forEach((obs) => {
            // Zimbabwe EPSG:22291 to WGS84 conversion
            // EPSG:22291: Arc 1950 / UTM zone 35S
            // Central Meridian: 31°E, False Easting: 500000m, False Northing: 10000000m
            
            // Convert from Zimbabwe coordinates to UTM Zone 35S
            // In Zimbabwe system: Y increases westwards, X increases southwards
            // For UTM: Easting increases eastwards, Northing increases northwards
            const utmEasting = obs.y;     // Y coordinate (westwards in Zimbabwe)
            const utmNorthing = 10000000 - obs.x; // X coordinate (southwards in Zimbabwe, convert to northwards)
            
            // Convert UTM to Geographic (WGS84)
            // UTM Zone 35S parameters
            const centralMeridian = 31.0; // 31° East
            const falseEasting = 500000;
            const falseNorthing = 10000000;
            const scaleFactor = 0.9996;
            
            // Convert UTM to Geographic coordinates
            // Remove false easting and northing
            const x = utmEasting - falseEasting;
            const y = utmNorthing - falseNorthing;
            
            // Convert to degrees using proper UTM formulas
            // Approximate conversion for display purposes
            const lat = y / 111320; // Convert northing to latitude (degrees)
            const lng = centralMeridian + (x / (111320 * Math.cos(Math.PI * lat / 180))); // Convert easting to longitude
            
            const latLng = L.latLng(lat, lng);
            bounds.extend(latLng);
            
            const isFound = obs.fp.includes('F');
            const markerColor = isFound ? 'green' : 'blue';
            
            // Create custom icon
            const customIcon = L.divIcon({
              className: 'custom-marker',
              html: `<div style="
                background-color: ${markerColor};
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              "></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            
            // Create marker
            const marker = L.marker(latLng, { icon: customIcon })
              .bindPopup(`
                <div style="font-family: Arial, sans-serif;">
                  <h4 style="margin: 0 0 8px 0; color: #333;">${obs.point}</h4>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>Y:</strong> ${obs.y.toFixed(3)}</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>X:</strong> ${obs.x.toFixed(3)}</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>Lat:</strong> ${lat.toFixed(6)}°</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>Lng:</strong> ${lng.toFixed(6)}°</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>HRMS:</strong> ${obs.hrms}</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>VRMS:</strong> ${obs.vrms}</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>Satellites:</strong> ${obs.sats}</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>PDOP:</strong> ${obs.pdop}</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>Type:</strong> ${isFound ? 'Found Beacon' : 'Placed Beacon'}</p>
                  <p style="margin: 2px 0; font-size: 12px;"><strong>Date:</strong> ${obs.date}</p>
                  ${obs.description ? `<p style="margin: 2px 0; font-size: 12px;"><strong>Description:</strong> ${obs.description}</p>` : ''}
                </div>
              `)
              .addTo(map);
            
            // Add beacon name label
            const label = L.divIcon({
              className: 'beacon-label',
              html: `<div style="
                background: rgba(255, 255, 255, 0.9);
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
                color: #333;
                border: 1px solid #ccc;
                white-space: nowrap;
              ">${obs.point}</div>`,
              iconSize: [0, 0],
              iconAnchor: [-15, -25]
            });
            
            L.marker(latLng, { icon: label }).addTo(map);
            
            allMarkers.push(marker);
            
            // Add click handler for corner selection
            marker.on('click', () => {
              if (isSelecting) {
                handleCornerSelection(obs);
              }
            });
          });
          
          // Fit map to show all points
          if (bounds.isValid()) {
            map.fitBounds(bounds, { 
              padding: [20, 20],
              maxZoom: 16 
            });
          }
        }
        
        setMapError('');
      }
    } catch (error) {
      console.error('Map initialization error:', error);
      setMapError(`Failed to initialize map: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return () => {
      if (mapRef.current && mapRef.current._leaflet_id) {
        mapRef.current._leaflet_id = undefined;
      }
    };
  }, [fieldBookData, isSelecting]);

  const handleCornerSelection = (obs: FieldObservation) => {
    setSelectedCorners(prev => {
      const isAlreadySelected = prev.some(corner => corner.point === obs.point);
      if (isAlreadySelected) {
        return prev.filter(corner => corner.point !== obs.point);
      } else {
        return [...prev, obs];
      }
    });
  };

  const calculateArea = () => {
    if (selectedCorners.length < 3) {
      alert('Please select at least 3 corners to calculate area');
      return;
    }

    // Simple polygon area calculation using shoelace formula
    let area = 0;
    const n = selectedCorners.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += selectedCorners[i].x * selectedCorners[j].y;
      area -= selectedCorners[j].x * selectedCorners[i].y;
    }
    
    area = Math.abs(area) / 2;
    
    setCalculatedArea({
      area: area,
      perimeter: calculatePerimeter(),
      corners: selectedCorners.length
    });
  };

  const calculatePerimeter = () => {
    if (selectedCorners.length < 2) return 0;
    
    let perimeter = 0;
    for (let i = 0; i < selectedCorners.length; i++) {
      const current = selectedCorners[i];
      const next = selectedCorners[(i + 1) % selectedCorners.length];
      const distance = Math.sqrt(
        Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)
      );
      perimeter += distance;
    }
    return perimeter;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Survey Coordinates Map</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsSelecting(!isSelecting)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                isSelecting 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Calculator className="h-4 w-4 inline mr-1" />
              {isSelecting ? 'Stop Selecting' : 'Calculate Area'}
            </button>
            {selectedCorners.length > 0 && (
              <button
                onClick={calculateArea}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Calculate ({selectedCorners.length})
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Map Content */}
        <div className="flex-1 p-4">
          {mapError ? (
            <div className="h-full bg-red-50 rounded-lg flex items-center justify-center border border-red-200">
              <div className="text-center p-6">
                <MapPin className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-900 mb-2">Map Error</h3>
                <p className="text-red-700 text-sm">{mapError}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Reload Page
                </button>
              </div>
            </div>
          ) : (
            <div 
              ref={mapRef} 
              className="h-full w-full rounded-lg border border-gray-300"
              style={{ minHeight: '500px', background: '#f0f0f0' }}
            />
          )}
        </div>
        
        {/* Area Calculation Results */}
        {calculatedArea && (
          <div className="border-t p-4 bg-gray-50">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{calculatedArea.area.toFixed(2)} m²</div>
                <div className="text-sm text-gray-600">Area</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{calculatedArea.perimeter.toFixed(2)} m</div>
                <div className="text-sm text-gray-600">Perimeter</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{calculatedArea.corners}</div>
                <div className="text-sm text-gray-600">Corners</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Legend */}
        <div className="border-t p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              <span>Found Beacons</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              <span>Placed Beacons</span>
            </div>
            {isSelecting && (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                <span>Click markers to select corners</span>
              </div>
            )}
            </div>
            <div className="text-xs text-gray-500">
              <div>Projection: EPSG:22291 (Arc 1950 / UTM Zone 35S)</div>
              <div>Central Meridian: 31°E</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};