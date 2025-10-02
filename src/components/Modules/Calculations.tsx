import React, { useState, useEffect } from 'react';
import { Calculator, RefreshCw, Plus, Trash2, Download } from 'lucide-react';
import { SurveyingCalculations } from '../../utils/surveyingCalculations';
import { surveyingApi } from '../../lib/supabase';
import { SurveyProject } from '../../types/surveying';

interface BeaconData {
  point: string;
  y: number;
  x: number;
  fb: string;
}

interface CoordinateComparison {
  point: string;
  oldY: number;
  oldX: number;
  newY: number;
  newX: number;
  dy: number;
  dx: number;
}

export const Calculations: React.FC = () => {
  const [activeCalculation, setActiveCalculation] = useState<string>('coordinate-list');
  interface CalculationResults {
    bearing?: string;
    bearingDMS?: string;
    distance?: string;
    y?: string;
    x?: string;
    bearingUsed?: string;
    area?: number;
    formattedArea?: { displayText: string };
    rawAreaSquareMeters?: string;
  }
  const [results, setResults] = useState<CalculationResults | null>(null);
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');

  // Coordinate List Data
  const [foundBeacons, setFoundBeacons] = useState<BeaconData[]>([
    { point: 'ST1', y: 25426.062, x: 69672.226, fb: '3' },
    { point: 'ST2', y: 25794.799, x: 69640.102, fb: '3' },
    { point: 'ST3', y: 27323.586, x: 70288.919, fb: '3' }
  ]);

  const [coordinateComparisons, setCoordinateComparisons] = useState<CoordinateComparison[]>([
    { point: 'ST1', oldY: 25426.000, oldX: 69672.000, newY: 25426.062, newX: 69672.226, dy: 0.062, dx: 0.226 }
  ]);

  const [placedBeacons, setPlacedBeacons] = useState<BeaconData[]>([
    { point: '9a', y: 24476.65, x: 66048.782, fb: '4' },
    { point: '4e', y: 24696.577, x: 68288.814, fb: '3' },
    { point: '8e', y: 24817.44, x: 68517.997, fb: '4' }
  ]);

  // Traditional calculation forms
  const [bearingDistanceForm, setBearingDistanceForm] = useState({
    fromY: '',
    fromX: '',
    toY: '',
    toX: ''
  });

  const [coordCalcForm, setCoordCalcForm] = useState({
    fromY: '',
    fromX: '',
    bearingDegrees: '',
    bearingMinutes: '',
    bearingSeconds: '',
    distance: ''
  });

  const [areaPoints, setAreaPoints] = useState<Array<{ y: string; x: string }>>([
    { y: '', x: '' },
    { y: '', x: '' },
    { y: '', x: '' }
  ]);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await surveyingApi.getProjects();
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  // Found Beacons Functions
  const addFoundBeacon = () => {
    setFoundBeacons([...foundBeacons, { point: '', y: 0, x: 0, fb: '3' }]);
  };

  const updateFoundBeacon = (index: number, field: keyof BeaconData, value: string | number) => {
    const updated = [...foundBeacons];
    updated[index] = { ...updated[index], [field]: value };
    setFoundBeacons(updated);
  };

  const removeFoundBeacon = (index: number) => {
    if (foundBeacons.length > 1) {
      setFoundBeacons(foundBeacons.filter((_, i) => i !== index));
    }
  };

  // Coordinate Comparison Functions
  const addCoordinateComparison = () => {
    setCoordinateComparisons([...coordinateComparisons, { 
      point: '', oldY: 0, oldX: 0, newY: 0, newX: 0, dy: 0, dx: 0 
    }]);
  };

  const updateCoordinateComparison = (index: number, field: keyof CoordinateComparison, value: string | number) => {
    const updated = [...coordinateComparisons];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-calculate dy and dx when coordinates change
    if (field === 'oldY' || field === 'oldX' || field === 'newY' || field === 'newX') {
      const comp = updated[index];
      comp.dy = comp.newY - comp.oldY;
      comp.dx = comp.newX - comp.oldX;
    }
    
    setCoordinateComparisons(updated);
  };

  const removeCoordinateComparison = (index: number) => {
    if (coordinateComparisons.length > 1) {
      setCoordinateComparisons(coordinateComparisons.filter((_, i) => i !== index));
    }
  };

  // Placed Beacons Functions
  const addPlacedBeacon = () => {
    setPlacedBeacons([...placedBeacons, { point: '', y: 0, x: 0, fb: '3' }]);
  };

  const updatePlacedBeacon = (index: number, field: keyof BeaconData, value: string | number) => {
    const updated = [...placedBeacons];
    updated[index] = { ...updated[index], [field]: value };
    setPlacedBeacons(updated);
  };

  const removePlacedBeacon = (index: number) => {
    if (placedBeacons.length > 1) {
      setPlacedBeacons(placedBeacons.filter((_, i) => i !== index));
    }
  };

  // Traditional calculation functions
  const calculateBearingDistance = () => {
    const form = bearingDistanceForm;
    if (!form.fromY || !form.fromX || !form.toY || !form.toX) {
      alert('Please fill in all coordinates');
      return;
    }

    try {
      const bearing = SurveyingCalculations.calculateBearing(
        parseFloat(form.fromY),
        parseFloat(form.fromX),
        parseFloat(form.toY),
        parseFloat(form.toX)
      );

      const distance = SurveyingCalculations.calculateDistance(
        parseFloat(form.fromY),
        parseFloat(form.fromX),
        parseFloat(form.toY),
        parseFloat(form.toX)
      );

      const bearingDMS = SurveyingCalculations.decimalToDms(bearing);

      setResults({
        bearing: bearing.toFixed(4),
        bearingDMS: SurveyingCalculations.formatDMS(bearingDMS.degrees, bearingDMS.minutes, bearingDMS.seconds),
        distance: distance.toFixed(3)
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error in calculation');
    }
  };

  const calculateCoordinates = () => {
    const form = coordCalcForm;
    if (!form.fromY || !form.fromX || !form.bearingDegrees || !form.bearingMinutes || !form.bearingSeconds || !form.distance) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const bearingDecimal = SurveyingCalculations.dmsToDecimal(
        parseInt(form.bearingDegrees),
        parseInt(form.bearingMinutes),
        parseFloat(form.bearingSeconds)
      );

      const coords = SurveyingCalculations.calculateCoordinates(
        parseFloat(form.fromY),
        parseFloat(form.fromX),
        bearingDecimal,
        parseFloat(form.distance)
      );

      setResults({
        y: coords.y.toFixed(3),
        x: coords.x.toFixed(3),
        bearingUsed: SurveyingCalculations.formatDMS(
          parseInt(form.bearingDegrees),
          parseInt(form.bearingMinutes),
          parseFloat(form.bearingSeconds)
        )
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error in calculation');
    }
  };

  const calculateArea = () => {
    const validPoints = areaPoints.filter(p => p.y && p.x);
    if (validPoints.length < 3) {
      alert('Please enter at least 3 coordinate pairs');
      return;
    }

    try {
      const coordinates = validPoints.map(p => ({
        y: parseFloat(p.y),
        x: parseFloat(p.x)
      }));

      const area = SurveyingCalculations.calculateArea(coordinates);
      
      if (area === 0) {
        alert('Invalid coordinates: points may be collinear or duplicate');
        return;
      }
      
      const formattedArea = SurveyingCalculations.formatArea(area);

      setResults({
        area: area,
        formattedArea: formattedArea,
        rawAreaSquareMeters: area.toFixed(2)
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error in area calculation');
    }
  };

  const addAreaPoint = () => {
    setAreaPoints([...areaPoints, { y: '', x: '' }]);
  };

  const removeAreaPoint = (index: number) => {
    if (areaPoints.length > 3) {
      const newPoints = areaPoints.filter((_, i) => i !== index);
      setAreaPoints(newPoints);
    }
  };

  const exportCoordinateList = () => {
    const csvContent = [
      // Found Beacons
      'FOUND BEACONS FIXED BY GPS',
      'Point,Y (metres),X (metres),F/B',
      ...foundBeacons.map(b => `${b.point},${b.y},${b.x},${b.fb}`),
      '',
      // Coordinate Comparisons
      'COMPARISON OF COORDINATES',
      'Point,Old Y,Old X,New Y,New X,dy,dx',
      ...coordinateComparisons.map(c => `${c.point},${c.oldY},${c.oldX},${c.newY},${c.newX},${c.dy.toFixed(3)},${c.dx.toFixed(3)}`),
      '',
      // Placed Beacons
      'INTERNAL BEACONS PLACED BY GPS',
      'Point,Y (metres),X (metres),F/B',
      ...placedBeacons.map(b => `${b.point},${b.y},${b.x},${b.fb}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coordinate_list.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const calculationTypes = [
    { id: 'coordinate-list', label: 'Coordinate List' },
    { id: 'bearing-distance', label: 'Bearing & Distance' },
    { id: 'coordinates', label: 'Coordinates from Bearing/Distance' },
    { id: 'area', label: 'Area Calculation' }
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Survey Calculations</h2>
        <p className="text-gray-600">Professional surveying calculations and coordinate management</p>
      </div>

      {/* Project Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Project</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.project_name} - {project.district}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calculation Types */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Calculation Type</h3>
          <div className="space-y-2">
            {calculationTypes.map((calc) => (
              <button
                key={calc.id}
                onClick={() => {
                  setActiveCalculation(calc.id);
                  setResults(null);
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  activeCalculation === calc.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {calc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input Forms */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Calculator className="h-5 w-5 mr-2" />
              {activeCalculation === 'coordinate-list' ? 'Coordinate Management' : 'Input Parameters'}
            </h3>
            {activeCalculation === 'coordinate-list' && (
              <button
                onClick={exportCoordinateList}
                className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center text-sm"
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </button>
            )}
          </div>

          {activeCalculation === 'coordinate-list' && (
            <div className="space-y-8">
              {/* Found Beacons Section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-gray-900">FOUND BEACONS FIXED BY GPS</h4>
                  <button
                    onClick={addFoundBeacon}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors flex items-center"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Point</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Y (metres)</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">X (metres)</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">F/B</th>
                        <th className="border border-gray-300 px-3 py-2 text-center text-sm font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foundBeacons.map((beacon, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="text"
                              value={beacon.point}
                              onChange={(e) => updateFoundBeacon(index, 'point', e.target.value)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={beacon.y}
                              onChange={(e) => updateFoundBeacon(index, 'y', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={beacon.x}
                              onChange={(e) => updateFoundBeacon(index, 'x', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <select
                              value={beacon.fb}
                              onChange={(e) => updateFoundBeacon(index, 'fb', e.target.value)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            >
                              <option value="3">3</option>
                              <option value="4">4</option>
                            </select>
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            <button
                              onClick={() => removeFoundBeacon(index)}
                              className="text-red-600 hover:text-red-800 p-1"
                              disabled={foundBeacons.length <= 1}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Coordinate Comparison Section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-gray-900">COMPARISON OF COORDINATES</h4>
                  <button
                    onClick={addCoordinateComparison}
                    className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors flex items-center"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Point</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Old Y</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Old X</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">New Y</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">New X</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">dy</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">dx</th>
                        <th className="border border-gray-300 px-3 py-2 text-center text-sm font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coordinateComparisons.map((comp, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="text"
                              value={comp.point}
                              onChange={(e) => updateCoordinateComparison(index, 'point', e.target.value)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={comp.oldY}
                              onChange={(e) => updateCoordinateComparison(index, 'oldY', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={comp.oldX}
                              onChange={(e) => updateCoordinateComparison(index, 'oldX', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={comp.newY}
                              onChange={(e) => updateCoordinateComparison(index, 'newY', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={comp.newX}
                              onChange={(e) => updateCoordinateComparison(index, 'newX', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1 bg-blue-50">
                            <span className="text-sm font-mono">{comp.dy.toFixed(3)}</span>
                          </td>
                          <td className="border border-gray-300 px-2 py-1 bg-blue-50">
                            <span className="text-sm font-mono">{comp.dx.toFixed(3)}</span>
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            <button
                              onClick={() => removeCoordinateComparison(index)}
                              className="text-red-600 hover:text-red-800 p-1"
                              disabled={coordinateComparisons.length <= 1}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Placed Beacons Section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-gray-900">INTERNAL BEACONS PLACED BY GPS</h4>
                  <button
                    onClick={addPlacedBeacon}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors flex items-center"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Point</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Y (metres)</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">X (metres)</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">F/B</th>
                        <th className="border border-gray-300 px-3 py-2 text-center text-sm font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placedBeacons.map((beacon, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="text"
                              value={beacon.point}
                              onChange={(e) => updatePlacedBeacon(index, 'point', e.target.value)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={beacon.y}
                              onChange={(e) => updatePlacedBeacon(index, 'y', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={beacon.x}
                              onChange={(e) => updatePlacedBeacon(index, 'x', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <select
                              value={beacon.fb}
                              onChange={(e) => updatePlacedBeacon(index, 'fb', e.target.value)}
                              className="w-full px-2 py-1 border-0 focus:ring-1 focus:ring-blue-500 text-sm"
                            >
                              <option value="3">3</option>
                              <option value="4">4</option>
                            </select>
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            <button
                              onClick={() => removePlacedBeacon(index)}
                              className="text-red-600 hover:text-red-800 p-1"
                              disabled={placedBeacons.length <= 1}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeCalculation === 'bearing-distance' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-blue-800 font-medium">Zimbabwe Convention:</p>
                <p className="text-xs text-blue-700">Y increases westwards, X increases southwards</p>
                <p className="text-xs text-blue-700">Bearings: 0° = South, 90° = West, 180° = North, 270° = East</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Y (westwards)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={bearingDistanceForm.fromY}
                    onChange={(e) => setBearingDistanceForm({...bearingDistanceForm, fromY: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From X (southwards)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={bearingDistanceForm.fromX}
                    onChange={(e) => setBearingDistanceForm({...bearingDistanceForm, fromX: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Y (westwards)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={bearingDistanceForm.toY}
                    onChange={(e) => setBearingDistanceForm({...bearingDistanceForm, toY: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To X (southwards)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={bearingDistanceForm.toX}
                    onChange={(e) => setBearingDistanceForm({...bearingDistanceForm, toX: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.000"
                  />
                </div>
              </div>
              <button
                onClick={calculateBearingDistance}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Calculate
              </button>
            </div>
          )}

          {activeCalculation === 'coordinates' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-blue-800 font-medium">Zimbabwe Convention:</p>
                <p className="text-xs text-blue-700">Bearing from South: 0° = South, 90° = West</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Y (westwards)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={coordCalcForm.fromY}
                    onChange={(e) => setCoordCalcForm({...coordCalcForm, fromY: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From X (southwards)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={coordCalcForm.fromX}
                    onChange={(e) => setCoordCalcForm({...coordCalcForm, fromX: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bearing from South (DMS)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="359"
                        value={coordCalcForm.bearingDegrees}
                        onChange={(e) => setCoordCalcForm({...coordCalcForm, bearingDegrees: e.target.value})}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        placeholder="000"
                      />
                      <label className="block text-xs text-gray-500 text-center mt-1">Deg</label>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={coordCalcForm.bearingMinutes}
                        onChange={(e) => setCoordCalcForm({...coordCalcForm, bearingMinutes: e.target.value})}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        placeholder="00"
                      />
                      <label className="block text-xs text-gray-500 text-center mt-1">Min</label>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="59.999"
                        step="0.001"
                        value={coordCalcForm.bearingSeconds}
                        onChange={(e) => setCoordCalcForm({...coordCalcForm, bearingSeconds: e.target.value})}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        placeholder="00.000"
                      />
                      <label className="block text-xs text-gray-500 text-center mt-1">Sec</label>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Distance (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={coordCalcForm.distance}
                    onChange={(e) => setCoordCalcForm({...coordCalcForm, distance: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={calculateCoordinates}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Calculate
              </button>
            </div>
          )}

          {activeCalculation === 'area' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-blue-800 font-medium">Enter beacon coordinates:</p>
                <p className="text-xs text-blue-700">Format: P(Y,X) where Y=westwards, X=southwards</p>
              </div>
              <div className="space-y-3">
                {areaPoints.map((point, index) => (
                  <div key={index} className="grid grid-cols-5 gap-2 items-end">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Beacon {index + 1} Y
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={point.y}
                        onChange={(e) => {
                          const newPoints = [...areaPoints];
                          newPoints[index].y = e.target.value;
                          setAreaPoints(newPoints);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        X
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={point.x}
                        onChange={(e) => {
                          const newPoints = [...areaPoints];
                          newPoints[index].x = e.target.value;
                          setAreaPoints(newPoints);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      {areaPoints.length > 3 && (
                        <button
                          onClick={() => removeAreaPoint(index)}
                          className="w-full bg-red-500 text-white py-2 px-2 rounded-lg hover:bg-red-600 transition-colors text-sm"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={addAreaPoint}
                  className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Add Beacon
                </button>
                <button
                  onClick={calculateArea}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Calculate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Results</h3>
          
          {results ? (
            <div className="space-y-3">
              {activeCalculation === 'bearing-distance' && (
                <>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Bearing from South (Decimal)</p>
                    <p className="text-lg font-bold text-blue-600">{results.bearing}°</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Bearing from South (DMS)</p>
                    <p className="text-lg font-bold text-blue-600">{results.bearingDMS}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">Distance</p>
                    <p className="text-lg font-bold text-green-600">{results.distance} m</p>
                  </div>
                </>
              )}
              
              {activeCalculation === 'coordinates' && (
                <>
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm text-gray-600">Bearing Used</p>
                    <p className="text-lg font-bold text-purple-600">{results.bearingUsed}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Y-coordinate (westwards)</p>
                    <p className="text-lg font-bold text-blue-600">{results.y}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">X-coordinate (southwards)</p>
                    <p className="text-lg font-bold text-green-600">{results.x}</p>
                  </div>
                </>
              )}
              
              {activeCalculation === 'area' && (
                <>
                  <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                    <p className="text-sm text-gray-600 mb-1">Official Area (Zimbabwe Convention)</p>
                    <p className="text-xl font-bold text-blue-700">{results.formattedArea?.displayText}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Raw Calculation</p>
                    <p className="text-sm font-mono text-gray-700">{results.rawAreaSquareMeters} m² (before rounding)</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">Rounding Convention Applied</p>
                    <p className="text-xs text-green-700">
                      {(results.area ?? 0) < 10000
                        ? "Area < 1 ha: Rounded to nearest m² using banker's rounding"
                        : "Area ≥ 1 ha: Displayed in hectares to 4 decimal places"
                      }
                    </p>
                  </div>
                </>
              )}

              {activeCalculation === 'coordinate-list' && (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Found Beacons</p>
                    <p className="text-lg font-bold text-blue-600">{foundBeacons.length}</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-gray-600">Coordinate Comparisons</p>
                    <p className="text-lg font-bold text-yellow-600">{coordinateComparisons.length}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">Placed Beacons</p>
                    <p className="text-lg font-bold text-green-600">{placedBeacons.length}</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total Points</p>
                    <p className="text-lg font-bold text-purple-600">{foundBeacons.length + placedBeacons.length}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {activeCalculation === 'coordinate-list' 
                  ? 'Manage your coordinate data above'
                  : 'Run a calculation to see results'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};