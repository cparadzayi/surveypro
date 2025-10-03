import React, { useState, useEffect } from 'react';
import { Calculator, Download, Plus, Trash2, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { surveyingApi } from '../../lib/supabase';
import { SurveyProject } from '../../types/surveying';
import { SurveyingCalculations } from '../../utils/surveyingCalculations';
import jsPDF from 'jspdf';

interface BeaconPoint {
  name: string;
  y: number;
  x: number;
}

interface ComputedJoin {
  fromName: string;
  toName: string;
  fromY: number;
  fromX: number;
  toY: number;
  toX: number;
  direction: string;
  distance: number;
  dy: number;
  dx: number;
}

interface StandCalculation {
  standNumber: string;
  beacons: BeaconPoint[];
  joins: ComputedJoin[];
  area: number;
  areaHectares: number;
  closureError: { dy: number; dx: number; distance: number };
  isClosed: boolean;
}

export const AreaCalculations: React.FC = () => {
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [stands, setStands] = useState<StandCalculation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddStand, setShowAddStand] = useState(false);
  const [editingStand, setEditingStand] = useState<{ standNumber: string; beacons: BeaconPoint[] } | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await surveyingApi.getProjects();
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const computeJoinsAndArea = (beacons: BeaconPoint[]): Omit<StandCalculation, 'standNumber' | 'beacons'> => {
    if (beacons.length < 3) {
      return {
        joins: [],
        area: 0,
        areaHectares: 0,
        closureError: { dy: 0, dx: 0, distance: 0 },
        isClosed: false
      };
    }

    const joins: ComputedJoin[] = [];
    let totalDY = 0;
    let totalDX = 0;

    for (let i = 0; i < beacons.length; i++) {
      const current = beacons[i];
      const next = beacons[(i + 1) % beacons.length];

      const bearing = SurveyingCalculations.calculateBearing(current.y, current.x, next.y, next.x);
      const distance = SurveyingCalculations.calculateDistance(current.y, current.x, next.y, next.x);

      const bearingDMS = SurveyingCalculations.decimalToDms(bearing);
      const directionStr = `${bearingDMS.degrees}:${bearingDMS.minutes.toString().padStart(2, '0')}:${bearingDMS.seconds.toFixed(0).padStart(2, '0')}`;

      const dy = next.y - current.y;
      const dx = next.x - current.x;

      const computed = SurveyingCalculations.calculateCoordinates(current.y, current.x, bearing, distance);

      const consistencyDY = next.y - computed.y;
      const consistencyDX = next.x - computed.x;

      totalDY += dy;
      totalDX += dx;

      joins.push({
        fromName: current.name,
        toName: next.name,
        fromY: current.y,
        fromX: current.x,
        toY: next.y,
        toX: next.x,
        direction: directionStr,
        distance,
        dy: consistencyDY,
        dx: consistencyDX
      });
    }

    const coordinates = beacons.map(b => ({ y: b.y, x: b.x }));
    const area = SurveyingCalculations.calculateArea(coordinates);
    const areaHectares = area / 10000;

    const closureDistance = Math.sqrt(totalDY * totalDY + totalDX * totalDX);
    const isClosed = closureDistance < 0.001;

    return {
      joins,
      area,
      areaHectares,
      closureError: { dy: totalDY, dx: totalDX, distance: closureDistance },
      isClosed
    };
  };

  const addStand = () => {
    setEditingStand({
      standNumber: `LOT${stands.length + 1}`,
      beacons: [
        { name: '', y: 0, x: 0 },
        { name: '', y: 0, x: 0 },
        { name: '', y: 0, x: 0 }
      ]
    });
    setShowAddStand(true);
  };

  const saveStand = () => {
    if (editingStand && editingStand.beacons.length >= 3) {
      const computed = computeJoinsAndArea(editingStand.beacons);

      const newStand: StandCalculation = {
        standNumber: editingStand.standNumber,
        beacons: editingStand.beacons,
        ...computed
      };

      const existingIndex = stands.findIndex(s => s.standNumber === editingStand.standNumber);
      if (existingIndex >= 0) {
        const updated = [...stands];
        updated[existingIndex] = newStand;
        setStands(updated);
      } else {
        setStands([...stands, newStand]);
      }

      setShowAddStand(false);
      setEditingStand(null);
    }
  };

  const deleteStand = (standNumber: string) => {
    if (confirm(`Delete stand ${standNumber}?`)) {
      setStands(stands.filter(s => s.standNumber !== standNumber));
    }
  };

  const addBeacon = () => {
    if (editingStand) {
      setEditingStand({
        ...editingStand,
        beacons: [...editingStand.beacons, { name: '', y: 0, x: 0 }]
      });
    }
  };

  const updateBeacon = (index: number, field: keyof BeaconPoint, value: string | number) => {
    if (editingStand) {
      const updated = [...editingStand.beacons];
      updated[index] = { ...updated[index], [field]: value };
      setEditingStand({ ...editingStand, beacons: updated });
    }
  };

  const removeBeacon = (index: number) => {
    if (editingStand && editingStand.beacons.length > 3) {
      const updated = editingStand.beacons.filter((_, i) => i !== index);
      setEditingStand({ ...editingStand, beacons: updated });
    }
  };

  const exportToPDF = () => {
    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 20;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Areas from Co-ordinates (With Co-ordinate Checking)', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 5;

    pdf.setLineWidth(0.3);
    pdf.line(20, yPosition, pageWidth - 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(8);
    const headers = ['Direction', 'Distance', 'Name', 'Y', 'X', 'DY', 'DX'];
    let xPos = 20;
    const colWidths = [24, 20, 18, 26, 26, 16, 16];

    headers.forEach((header, i) => {
      pdf.text(header, xPos, yPosition);
      xPos += colWidths[i];
    });
    yPosition += 2;
    pdf.line(20, yPosition, pageWidth - 20, yPosition);
    yPosition += 5;

    stands.forEach((stand) => {
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = 20;

        pdf.setFontSize(8);
        xPos = 20;
        headers.forEach((header, i) => {
          pdf.text(header, xPos, yPosition);
          xPos += colWidths[i];
        });
        yPosition += 2;
        pdf.line(20, yPosition, pageWidth - 20, yPosition);
        yPosition += 5;
      }

      pdf.setFontSize(9);
      pdf.text(`Stand/Erf Number = ${stand.standNumber}`, 20, yPosition);
      yPosition += 2;
      pdf.line(20, yPosition, pageWidth - 20, yPosition);
      yPosition += 5;

      if (stand.beacons.length > 0) {
        pdf.setFontSize(8);
        const firstBeacon = stand.beacons[0];
        xPos = 20;
        xPos += colWidths[0];
        xPos += colWidths[1];
        pdf.text(firstBeacon.name, xPos, yPosition);
        xPos += colWidths[2];
        pdf.text(firstBeacon.y.toFixed(2), xPos, yPosition);
        xPos += colWidths[3];
        pdf.text(firstBeacon.x.toFixed(2), xPos, yPosition);
        yPosition += 4;
      }

      stand.joins.forEach((join) => {
        if (yPosition > 280) {
          pdf.addPage();
          yPosition = 20;
        }

        xPos = 20;
        pdf.setFontSize(8);

        pdf.text(join.direction, xPos, yPosition);
        xPos += colWidths[0];

        pdf.text(join.distance.toFixed(2), xPos, yPosition, { align: 'right' });
        xPos += colWidths[1];

        pdf.text(join.toName, xPos, yPosition);
        xPos += colWidths[2];

        pdf.text(join.toY.toFixed(2), xPos, yPosition);
        xPos += colWidths[3];

        pdf.text(join.toX.toFixed(2), xPos, yPosition);
        xPos += colWidths[4];

        const dyStr = join.dy >= 0 ? join.dy.toFixed(3) : join.dy.toFixed(3);
        pdf.text(dyStr, xPos, yPosition, { align: 'right' });
        xPos += colWidths[5];

        const dxStr = join.dx >= 0 ? join.dx.toFixed(3) : join.dx.toFixed(3);
        pdf.text(dxStr, xPos, yPosition, { align: 'right' });

        yPosition += 4;
      });

      yPosition += 2;
      pdf.setFontSize(9);
      pdf.text(`Area (Ha.) = ${stand.areaHectares.toFixed(4)}`, 60, yPosition);
      yPosition += 2;
      pdf.line(60, yPosition, 110, yPosition);
      yPosition += 8;
    });

    const projectName = projects.find(p => p.id === selectedProject)?.project_name || 'Area Calculations';
    pdf.save(`${projectName} - Areas and Consistencies.pdf`);
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Areas from Co-ordinates (With Co-ordinate Checking)</h2>
        <p className="text-gray-600">Compute areas and check coordinate consistency for survey stands</p>
      </div>

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

      <div className="flex space-x-4 mb-6">
        <button
          onClick={addStand}
          disabled={!selectedProject}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:bg-gray-400"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Stand
        </button>
        <button
          onClick={exportToPDF}
          disabled={stands.length === 0}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center disabled:bg-gray-400"
        >
          <Download className="h-5 w-5 mr-2" />
          Export PDF
        </button>
      </div>

      <div className="space-y-4">
        {stands.map((stand) => (
          <div key={stand.standNumber} className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{stand.standNumber}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Area: {stand.areaHectares.toFixed(4)} ha ({stand.area.toFixed(2)} m²)
                </p>
                <p className="text-sm text-gray-600">
                  {stand.beacons.length} corner beacons, {stand.joins.length} joins
                </p>
                <div className="flex items-center mt-2">
                  {stand.isClosed ? (
                    <div className="flex items-center text-green-600 text-sm">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Loop closed (error: {stand.closureError.distance.toFixed(3)}m)
                    </div>
                  ) : (
                    <div className="flex items-center text-amber-600 text-sm">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Closure error: {stand.closureError.distance.toFixed(3)}m (DY: {stand.closureError.dy.toFixed(3)}m, DX: {stand.closureError.dx.toFixed(3)}m)
                    </div>
                  )}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setEditingStand({ standNumber: stand.standNumber, beacons: stand.beacons });
                    setShowAddStand(true);
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <FileText className="h-5 w-5" />
                </button>
                <button
                  onClick={() => deleteStand(stand.standNumber)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Direction</th>
                    <th className="px-3 py-2 text-right">Distance</th>
                    <th className="px-3 py-2 text-left">From</th>
                    <th className="px-3 py-2 text-left">To</th>
                    <th className="px-3 py-2 text-right">Y</th>
                    <th className="px-3 py-2 text-right">X</th>
                    <th className="px-3 py-2 text-right">DY</th>
                    <th className="px-3 py-2 text-right">DX</th>
                  </tr>
                </thead>
                <tbody>
                  {stand.joins.slice(0, 5).map((join, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="px-3 py-2 font-mono text-xs">{join.direction}</td>
                      <td className="px-3 py-2 text-right">{join.distance.toFixed(2)}</td>
                      <td className="px-3 py-2">{join.fromName}</td>
                      <td className="px-3 py-2">{join.toName}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{join.toY.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{join.toX.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${Math.abs(join.dy) > 0.01 ? 'text-red-600 font-bold' : 'text-gray-900'}`}>
                        {join.dy.toFixed(3)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${Math.abs(join.dx) > 0.01 ? 'text-red-600 font-bold' : 'text-gray-900'}`}>
                        {join.dx.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                  {stand.joins.length > 5 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-2 text-center text-gray-500 text-xs">
                        ... and {stand.joins.length - 5} more joins
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {stands.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl shadow-md">
            <Calculator className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Area Calculations</h3>
            <p className="text-gray-600 mb-4">Add corner beacons and automatically compute joins, areas, and consistency checks</p>
            <button
              onClick={addStand}
              disabled={!selectedProject}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              Add First Stand
            </button>
          </div>
        )}
      </div>

      {showAddStand && editingStand && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                {stands.find(s => s.standNumber === editingStand.standNumber) ? 'Edit' : 'Add'} Stand
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Enter corner beacon coordinates. Bearings, distances, and areas will be computed automatically.
              </p>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Stand/Erf Number</label>
                <input
                  type="text"
                  value={editingStand.standNumber}
                  onChange={(e) => setEditingStand({ ...editingStand, standNumber: e.target.value })}
                  className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., LOT1, LOT2, OUTSIDE FIGURE"
                />
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-gray-900">Corner Beacons (in sequence)</h4>
                  <button
                    onClick={addBeacon}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors flex items-center"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Beacon
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>Important:</strong> Enter beacons in order around the boundary. The system will automatically:
                  </p>
                  <ul className="text-sm text-blue-800 mt-2 ml-4 list-disc">
                    <li>Compute bearings and distances between successive beacons</li>
                    <li>Calculate coordinate consistency checks (DY, DX)</li>
                    <li>Compute the enclosed area using the coordinate method</li>
                    <li>Check loop closure (first and last beacon should match)</li>
                  </ul>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm">#</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm">Beacon Name</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm">Y Coordinate (metres)</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-sm">X Coordinate (metres)</th>
                        <th className="border border-gray-300 px-3 py-2 text-center text-sm">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingStand.beacons.map((beacon, index) => (
                        <tr key={index}>
                          <td className="border border-gray-300 px-3 py-2 text-center">
                            {index + 1}
                          </td>
                          <td className="border border-gray-300 px-2 py-2">
                            <input
                              type="text"
                              value={beacon.name}
                              onChange={(e) => updateBeacon(index, 'name', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                              placeholder="e.g., 1a, 2a, 3b"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={beacon.y}
                              onChange={(e) => updateBeacon(index, 'y', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                              placeholder="Y (westwards)"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={beacon.x}
                              onChange={(e) => updateBeacon(index, 'x', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                              placeholder="X (southwards)"
                            />
                          </td>
                          <td className="border border-gray-300 px-2 py-2 text-center">
                            <button
                              onClick={() => removeBeacon(index)}
                              className="text-red-600 hover:text-red-800 p-1"
                              disabled={editingStand.beacons.length <= 3}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddStand(false);
                    setEditingStand(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveStand}
                  disabled={editingStand.beacons.length < 3}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  Compute & Save Stand
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
