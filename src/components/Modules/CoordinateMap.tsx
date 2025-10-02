import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calculator, RotateCcw, ChevronLeft, ChevronRight, FileText, FileSpreadsheet } from 'lucide-react';
import { SurveyingCalculations } from '../../utils/surveyingCalculations';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Leaflet imports with ES modules
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in Leaflet with Vite
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

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
  const mapInstanceRef = useRef<any>(null);
  const [selectedCorners, setSelectedCorners] = useState<FieldObservation[]>([]);
  const [calculatedArea, setCalculatedArea] = useState<any>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [mapError, setMapError] = useState<string>('');
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [polygonLayer, setPolygonLayer] = useState<any>(null);
  const [cornerMarkers, setCornerMarkers] = useState<any[]>([]);

  // Convert Zimbabwe Cape Datum coordinates to WGS84 lat/lng
  const convertToLatLng = (y: number, x: number) => {
    try {
      // Cape Datum with Modified Clarke 1880 ellipsoid
      // Central Meridian: 31°E, Transverse Mercator projection
      // Y increases westwards from central meridian (31°E)
      // X increases southwards from equator
      
      const centralMeridian = 31.0; // 31° East
      
      // Convert X (southwards) to latitude
      // X is in meters south of equator, convert to degrees
      const lat = -x / 111320; // Convert to degrees south of equator
      
      // Convert Y (westwards) to longitude offset from 31°E
      // At Zimbabwe's latitude (~19°S), adjust for convergence
      const metersPerDegreeAtZimbabwe = 111320 * Math.cos(Math.PI * lat / 180);
      const longitudeOffset = -y / metersPerDegreeAtZimbabwe; // Negative because Y increases westwards
      const lng = centralMeridian + longitudeOffset;
      
      return { lat, lng };
    } catch (error) {
      console.error('Coordinate conversion error:', error);
      return { lat: -19, lng: 31 }; // Default to center of Zimbabwe
    }
  };

  useEffect(() => {
    if (!L || !mapRef.current) return;

    try {
      // Clean up existing map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Initialize map
      const map = L.map(mapRef.current, {
        center: [-19, 31], // Center of Zimbabwe
        zoom: 10,
        zoomControl: true,
        attributionControl: true
      });

      mapInstanceRef.current = map;

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // Process coordinates and add markers
      if (fieldBookData.observations.length > 0) {
        const bounds = L.latLngBounds([]);
        
        fieldBookData.observations.forEach((obs) => {
          const { lat, lng } = convertToLatLng(obs.y, obs.x);
          const latLng = L.latLng(lat, lng);
          bounds.extend(latLng);
          
          const isFound = obs.fp.includes('F');
          const markerColor = isFound ? '#10b981' : '#3b82f6'; // green for found, blue for placed
          
          // Create custom icon
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
              background-color: ${markerColor};
              width: 16px;
              height: 16px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });
          
          // Create marker
          const marker = L.marker(latLng, { icon: customIcon })
            .bindPopup(`
              <div style="font-family: Arial, sans-serif; min-width: 200px;">
                <h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">${obs.point}</h4>
                <div style="font-size: 11px; line-height: 1.4;">
                  <p style="margin: 2px 0;"><strong>Zimbabwe Coordinates:</strong></p>
                  <p style="margin: 2px 0; margin-left: 10px;">Y: ${obs.y.toFixed(3)} (westwards)</p>
                  <p style="margin: 2px 0; margin-left: 10px;">X: ${obs.x.toFixed(3)} (southwards)</p>
                  <p style="margin: 4px 0 2px 0;"><strong>Geographic:</strong></p>
                  <p style="margin: 2px 0; margin-left: 10px;">Lat: ${lat.toFixed(6)}°</p>
                  <p style="margin: 2px 0; margin-left: 10px;">Lng: ${lng.toFixed(6)}°</p>
                  <p style="margin: 4px 0 2px 0;"><strong>GPS Quality:</strong></p>
                  <p style="margin: 2px 0; margin-left: 10px;">HRMS: ${obs.hrms.toFixed(3)}m</p>
                  <p style="margin: 2px 0; margin-left: 10px;">VRMS: ${obs.vrms.toFixed(3)}m</p>
                  <p style="margin: 2px 0; margin-left: 10px;">Satellites: ${obs.sats}</p>
                  <p style="margin: 2px 0; margin-left: 10px;">PDOP: ${obs.pdop.toFixed(1)}</p>
                  <p style="margin: 4px 0 2px 0;"><strong>Type:</strong> ${isFound ? 'Found Beacon' : 'Placed Beacon'}</p>
                  <p style="margin: 2px 0;"><strong>Date:</strong> ${obs.date}</p>
                  ${obs.description ? `<p style="margin: 2px 0;"><strong>Description:</strong> ${obs.description}</p>` : ''}
                </div>
              </div>
            `)
            .addTo(map);
          
          // Add beacon name label
          const labelIcon = L.divIcon({
            className: 'beacon-label',
            html: `<div style="
              background: ${isFound ? 'rgba(16, 185, 129, 0.9)' : 'rgba(59, 130, 246, 0.9)'};
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: bold;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">${obs.point}</div>`,
            iconSize: [0, 0],
            iconAnchor: [-15, -25]
          });
          
          L.marker(latLng, { icon: labelIcon }).addTo(map);
          
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
    } catch (error) {
      console.error('Map initialization error:', error);
      setMapError(`Failed to initialize map: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [fieldBookData, isSelecting]);

  const handleCornerSelection = (obs: FieldObservation) => {
    setSelectedCorners(prev => {
      const isAlreadySelected = prev.some(corner => corner.point === obs.point);
      if (isAlreadySelected) {
        const newCorners = prev.filter(corner => corner.point !== obs.point);
        updatePolygonDisplay(newCorners);
        return newCorners;
      } else {
        const newCorners = [...prev, obs];
        updatePolygonDisplay(newCorners);
        return newCorners;
      }
    });
  };

  const updatePolygonDisplay = (corners: FieldObservation[]) => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Remove existing polygon and corner markers
    if (polygonLayer) {
      map.removeLayer(polygonLayer);
      setPolygonLayer(null);
    }
    cornerMarkers.forEach(marker => map.removeLayer(marker));
    setCornerMarkers([]);

    if (corners.length >= 3) {
      // Convert coordinates to lat/lng for polygon display
      const latLngs = corners.map(corner => {
        const { lat, lng } = convertToLatLng(corner.y, corner.x);
        return L.latLng(lat, lng);
      });

      // Create polygon
      const polygon = L.polygon(latLngs, {
        color: '#ef4444',
        weight: 3,
        opacity: 0.8,
        fillColor: '#ef4444',
        fillOpacity: 0.2
      }).addTo(map);
      
      setPolygonLayer(polygon);

      // Add numbered corner markers
      const newCornerMarkers: any[] = [];
      corners.forEach((corner, index) => {
        const { lat, lng } = convertToLatLng(corner.y, corner.x);
        
        const cornerIcon = L.divIcon({
          className: 'corner-marker',
          html: `<div style="
            background-color: #ef4444;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
          ">${index + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        const marker = L.marker(L.latLng(lat, lng), { icon: cornerIcon }).addTo(map);
        newCornerMarkers.push(marker);
      });
      
      setCornerMarkers(newCornerMarkers);
    }
  };

  const calculateArea = () => {
    if (selectedCorners.length < 3) {
      alert('Please select at least 3 corners to calculate area');
      return;
    }

    // Use Zimbabwe coordinates for accurate area calculation
    const coordinates = selectedCorners.map(corner => ({
      y: corner.y,
      x: corner.x
    }));

    const area = SurveyingCalculations.calculateArea(coordinates);
    const formattedArea = SurveyingCalculations.formatArea(area);
    const perimeter = calculatePerimeter();
    
    // Calculate bearings and distances between consecutive corners
    const bearingsDistances = [];
    for (let i = 0; i < selectedCorners.length; i++) {
      const current = selectedCorners[i];
      const next = selectedCorners[(i + 1) % selectedCorners.length];
      
      const bearing = SurveyingCalculations.calculateBearing(current.y, current.x, next.y, next.x);
      const distance = SurveyingCalculations.calculateDistance(current.y, current.x, next.y, next.x);
      const bearingDMS = SurveyingCalculations.decimalToDms(bearing);
      
      bearingsDistances.push({
        from: current.point,
        to: next.point,
        bearing,
        distance,
        bearingDMS: SurveyingCalculations.formatDMS(bearingDMS.degrees, bearingDMS.minutes, bearingDMS.seconds)
      });
    }
    
    setCalculatedArea({
      area,
      formattedArea,
      perimeter,
      corners: selectedCorners,
      bearingsDistances
    });
    
    setShowSidePanel(true);
  };

  const calculatePerimeter = () => {
    if (selectedCorners.length < 2) return 0;
    
    let perimeter = 0;
    for (let i = 0; i < selectedCorners.length; i++) {
      const current = selectedCorners[i];
      const next = selectedCorners[(i + 1) % selectedCorners.length];
      const distance = SurveyingCalculations.calculateDistance(current.y, current.x, next.y, next.x);
      perimeter += distance;
    }
    return perimeter;
  };

  const resetSelection = () => {
    setSelectedCorners([]);
    setCalculatedArea(null);
    setShowSidePanel(false);
    updatePolygonDisplay([]);
  };

  const exportToPDF = () => {
    if (!calculatedArea) return;

    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    let yPosition = 20;

    // Title
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LAND PARCEL AREA CALCULATION', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Date and time
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, yPosition);
    yPosition += 15;

    // Area summary
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AREA SUMMARY', 20, yPosition);
    yPosition += 10;

    pdf.setFont('helvetica', 'normal');
    pdf.text(`Total Area: ${calculatedArea.formattedArea.displayText}`, 25, yPosition);
    yPosition += 6;
    pdf.text(`Perimeter: ${calculatedArea.perimeter.toFixed(3)} m`, 25, yPosition);
    yPosition += 6;
    pdf.text(`Number of Corners: ${calculatedArea.corners.length}`, 25, yPosition);
    yPosition += 15;

    // Corner coordinates table
    pdf.setFont('helvetica', 'bold');
    pdf.text('CORNER COORDINATES', 20, yPosition);
    yPosition += 10;

    const cornerData = [
      ['Corner', 'Point Name', 'Y (metres)', 'X (metres)', 'Description'],
      ...calculatedArea.corners.map((corner: FieldObservation, index: number) => [
        (index + 1).toString(),
        corner.point,
        corner.y.toFixed(3),
        corner.x.toFixed(3),
        corner.description || 'Survey point'
      ])
    ];

    autoTable(pdf, {
      startY: yPosition,
      head: [cornerData[0]],
      body: cornerData.slice(1),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    yPosition = (pdf as any).lastAutoTable.finalY + 15;

    // Bearings and distances table
    pdf.setFont('helvetica', 'bold');
    pdf.text('BEARINGS AND DISTANCES', 20, yPosition);
    yPosition += 10;

    const bearingData = [
      ['From', 'To', 'Bearing (DMS)', 'Distance (m)'],
      ...calculatedArea.bearingsDistances.map((bd: any) => [
        bd.from,
        bd.to,
        bd.bearingDMS,
        bd.distance.toFixed(3)
      ])
    ];

    autoTable(pdf, {
      startY: yPosition,
      head: [bearingData[0]],
      body: bearingData.slice(1),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    // Footer
    const footerY = pdf.internal.pageSize.getHeight() - 20;
    pdf.setFontSize(8);
    pdf.text('Generated by SurveyPro - Zimbabwe Cadastral Survey Management', pageWidth / 2, footerY, { align: 'center' });

    pdf.save(`Land_Parcel_Area_Calculation_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = () => {
    if (!calculatedArea) return;

    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Land Parcel Area Calculation'],
      ['Generated:', new Date().toLocaleString()],
      [''],
      ['AREA SUMMARY'],
      ['Total Area:', calculatedArea.formattedArea.displayText],
      ['Perimeter:', `${calculatedArea.perimeter.toFixed(3)} m`],
      ['Number of Corners:', calculatedArea.corners.length],
      [''],
      ['CORNER COORDINATES'],
      ['Corner', 'Point Name', 'Y (metres)', 'X (metres)', 'HRMS', 'VRMS', 'Satellites', 'PDOP', 'Description'],
      ...calculatedArea.corners.map((corner: FieldObservation, index: number) => [
        index + 1,
        corner.point,
        corner.y,
        corner.x,
        corner.hrms,
        corner.vrms,
        corner.sats,
        corner.pdop,
        corner.description || 'Survey point'
      ])
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Area Calculation');

    // Bearings and distances sheet
    const bearingData = [
      ['BEARINGS AND DISTANCES'],
      ['From', 'To', 'Bearing (Decimal)', 'Bearing (DMS)', 'Distance (m)'],
      ...calculatedArea.bearingsDistances.map((bd: any) => [
        bd.from,
        bd.to,
        bd.bearing.toFixed(4),
        bd.bearingDMS,
        bd.distance
      ])
    ];

    const bearingSheet = XLSX.utils.aoa_to_sheet(bearingData);
    XLSX.utils.book_append_sheet(workbook, bearingSheet, 'Bearings & Distances');

    XLSX.writeFile(workbook, `Land_Parcel_Area_Calculation_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl h-5/6 flex">
        {/* Main Map Area */}
        <div className={`flex flex-col transition-all duration-300 ${showSidePanel ? 'w-2/3' : 'w-full'}`}>
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
                {isSelecting ? 'Stop Selecting' : 'Select Corner Points'}
              </button>
              {selectedCorners.length > 0 && (
                <>
                  <button
                    onClick={calculateArea}
                    disabled={selectedCorners.length < 3}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400"
                  >
                    Calculate Area ({selectedCorners.length})
                  </button>
                  <button
                    onClick={resetSelection}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4 inline mr-1" />
                    Reset
                  </button>
                </>
              )}
              {calculatedArea && (
                <button
                  onClick={() => setShowSidePanel(!showSidePanel)}
                  className="px-3 py-1 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 transition-colors"
                >
                  {showSidePanel ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  {showSidePanel ? 'Hide' : 'Show'} Results
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
                {selectedCorners.length > 0 && (
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                    <span>Selected Corners ({selectedCorners.length})</span>
                  </div>
                )}
                {isSelecting && (
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                    <span>Click markers to select corners</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500">
                <div>Projection: Cape Datum (Modified Clarke 1880)</div>
                <div>Central Meridian: 31°E</div>
                <div>Zimbabwe Survey Coordinates</div>
              </div>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        {showSidePanel && calculatedArea && (
          <div className="w-1/3 border-l bg-gray-50 flex flex-col">
            {/* Side Panel Header */}
            <div className="p-4 border-b bg-white">
              <div className="flex justify-between items-center">
                <h4 className="text-lg font-semibold text-gray-900">Area Calculation Results</h4>
                <button
                  onClick={() => setShowSidePanel(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Results Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Area Summary */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h5 className="font-semibold text-gray-900 mb-3">Area Summary</h5>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                    <span className="text-sm font-medium text-blue-900">Total Area</span>
                    <span className="text-lg font-bold text-blue-600">{calculatedArea.formattedArea.displayText}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                    <span className="text-sm font-medium text-green-900">Perimeter</span>
                    <span className="text-lg font-bold text-green-600">{calculatedArea.perimeter.toFixed(3)} m</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                    <span className="text-sm font-medium text-purple-900">Corners</span>
                    <span className="text-lg font-bold text-purple-600">{calculatedArea.corners.length}</span>
                  </div>
                </div>
              </div>

              {/* Corner Coordinates */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h5 className="font-semibold text-gray-900 mb-3">Corner Coordinates</h5>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {calculatedArea.corners.map((corner: FieldObservation, index: number) => (
                    <div key={corner.point} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">
                          {index + 1}
                        </div>
                        <span className="font-medium">{corner.point}</span>
                      </div>
                      <div className="text-right">
                        <div>Y: {corner.y.toFixed(3)}</div>
                        <div>X: {corner.x.toFixed(3)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bearings and Distances */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h5 className="font-semibold text-gray-900 mb-3">Bearings & Distances</h5>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {calculatedArea.bearingsDistances.map((bd: any, index: number) => (
                    <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium">{bd.from} → {bd.to}</span>
                        <span className="text-blue-600 font-mono">{bd.distance.toFixed(3)} m</span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Bearing: {bd.bearingDMS}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Information */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h5 className="font-semibold text-gray-900 mb-3">Survey Quality</h5>
                <div className="space-y-2 text-sm">
                  {(() => {
                    const avgHRMS = calculatedArea.corners.reduce((sum: number, corner: FieldObservation) => sum + corner.hrms, 0) / calculatedArea.corners.length;
                    const avgVRMS = calculatedArea.corners.reduce((sum: number, corner: FieldObservation) => sum + corner.vrms, 0) / calculatedArea.corners.length;
                    const avgSats = calculatedArea.corners.reduce((sum: number, corner: FieldObservation) => sum + corner.sats, 0) / calculatedArea.corners.length;
                    
                    return (
                      <>
                        <div className="flex justify-between">
                          <span>Average HRMS:</span>
                          <span className="font-mono">{avgHRMS.toFixed(3)} m</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Average VRMS:</span>
                          <span className="font-mono">{avgVRMS.toFixed(3)} m</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Average Satellites:</span>
                          <span className="font-mono">{avgSats.toFixed(0)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="p-4 border-t bg-white space-y-2">
              <button
                onClick={exportToPDF}
                className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
              >
                <FileText className="h-4 w-4 mr-2" />
                Export to PDF
              </button>
              <button
                onClick={exportToExcel}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export to Excel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};