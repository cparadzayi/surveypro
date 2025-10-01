import React from 'react';
import { X } from 'lucide-react';

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
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Survey Coordinates Map</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {/* Map Content */}
        <div className="flex-1 p-4">
          <div className="h-full bg-gray-100 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-600 mb-4">
                <div className="text-lg font-medium">Interactive Map View</div>
                <div className="text-sm">EPSG:22291 Coordinate System</div>
              </div>
              
              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-3 rounded-lg shadow">
                  <div className="text-2xl font-bold text-blue-600">{fieldBookData.observations.length}</div>
                  <div className="text-sm text-gray-600">Total Points</div>
                </div>
                <div className="bg-white p-3 rounded-lg shadow">
                  <div className="text-2xl font-bold text-green-600">{fieldBookData.foundBeacons.length}</div>
                  <div className="text-sm text-gray-600">Found Beacons</div>
                </div>
                <div className="bg-white p-3 rounded-lg shadow">
                  <div className="text-2xl font-bold text-purple-600">{fieldBookData.placedBeacons.length}</div>
                  <div className="text-sm text-gray-600">Placed Beacons</div>
                </div>
              </div>
              
              {/* Coordinate Range */}
              {fieldBookData.observations.length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow text-left">
                  <h4 className="font-medium text-gray-900 mb-2">Coordinate Bounds (EPSG:22291)</h4>
                  {(() => {
                    const yCoords = fieldBookData.observations.map(obs => obs.y);
                    const xCoords = fieldBookData.observations.map(obs => obs.x);
                    const minY = Math.min(...yCoords);
                    const maxY = Math.max(...yCoords);
                    const minX = Math.min(...xCoords);
                    const maxX = Math.max(...xCoords);
                    
                    return (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p><strong>Y Range:</strong> {minY.toFixed(3)} to {maxY.toFixed(3)}</p>
                          <p><strong>Y Extent:</strong> {(maxY - minY).toFixed(3)}m</p>
                        </div>
                        <div>
                          <p><strong>X Range:</strong> {minX.toFixed(3)} to {maxX.toFixed(3)}</p>
                          <p><strong>X Extent:</strong> {(maxX - minX).toFixed(3)}m</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
              
              <div className="mt-4 text-sm text-gray-500">
                Interactive Leaflet map with coordinate projection will be displayed here
              </div>
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="border-t p-4">
          <div className="flex items-center justify-center space-x-6 text-sm">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              <span>Found Beacons</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              <span>Placed Beacons</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-1 bg-red-500 mr-2"></div>
              <span>Survey Path</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};