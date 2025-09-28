import React, { useState } from 'react';
import { Calculator, RefreshCw } from 'lucide-react';
import { SurveyingCalculations } from '../../utils/surveyingCalculations';

export const Calculations: React.FC = () => {
  const [activeCalculation, setActiveCalculation] = useState<string>('bearing-distance');
  const [results, setResults] = useState<any>(null);

  // Bearing and Distance Calculator
  const [bearingDistanceForm, setBearingDistanceForm] = useState({
    fromY: '',
    fromX: '',
    toY: '',
    toX: ''
  });

  // Coordinate from Bearing and Distance
  const [coordCalcForm, setCoordCalcForm] = useState({
    fromY: '',
    fromX: '',
    bearingDegrees: '',
    bearingMinutes: '',
    bearingSeconds: '',
    distance: ''
  });

  // Area Calculation
  const [areaPoints, setAreaPoints] = useState<Array<{ y: string; x: string }>>([
    { y: '', x: '' },
    { y: '', x: '' },
    { y: '', x: '' }
  ]);

  const calculateBearingDistance = () => {
    const form = bearingDistanceForm;
    if (!form.fromY || !form.fromX || !form.toY || !form.toX) {
      alert('Please fill in all coordinates');
      return;
    }

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
  };

  const calculateCoordinates = () => {
    const form = coordCalcForm;
    if (!form.fromY || !form.fromX || !form.bearingDegrees || !form.bearingMinutes || !form.bearingSeconds || !form.distance) {
      alert('Please fill in all fields');
      return;
    }

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
  };

  const calculateArea = () => {
    const validPoints = areaPoints.filter(p => p.y && p.x);
    if (validPoints.length < 3) {
      alert('Please enter at least 3 coordinate pairs');
      return;
    }

    const coordinates = validPoints.map(p => ({
      y: parseFloat(p.y),
      x: parseFloat(p.x)
    }));

    const area = SurveyingCalculations.calculateArea(coordinates);
    const formattedArea = SurveyingCalculations.formatArea(area);

    setResults({
      area: area,
      formattedArea: formattedArea,
      rawAreaSquareMeters: area.toFixed(2)
    });
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

  const calculationTypes = [
    { id: 'bearing-distance', label: 'Bearing & Distance' },
    { id: 'coordinates', label: 'Coordinates from Bearing/Distance' },
    { id: 'area', label: 'Area Calculation' },
    { id: 'traverse', label: 'Traverse Adjustment' }
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Survey Calculations</h2>
        <p className="text-gray-600">Zimbabwe cadastral surveying calculations (South-oriented bearings)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Input Parameters
          </h3>

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
                    <p className="text-xl font-bold text-blue-700">{results.formattedArea.displayText}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Raw Calculation</p>
                    <p className="text-sm font-mono text-gray-700">{results.rawAreaSquareMeters} m² (before rounding)</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">Rounding Convention Applied</p>
                    <p className="text-xs text-green-700">
                      {results.area < 10000 
                        ? "Area < 1 ha: Rounded to nearest m² using banker's rounding"
                        : "Area ≥ 1 ha: Displayed in hectares to 4 decimal places"
                      }
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Run a calculation to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};