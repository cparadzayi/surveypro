import React, { useState, useEffect } from 'react';
import { Calculator, Download, Upload, Plus, Trash2, FileText } from 'lucide-react';
import { surveyingApi } from '../../lib/supabase';
import { SurveyProject, StandAreaCalculation, AreaCalculationEntry } from '../../types/surveying';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const AreaCalculations: React.FC = () => {
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [stands, setStands] = useState<StandAreaCalculation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddStand, setShowAddStand] = useState(false);
  const [editingStand, setEditingStand] = useState<StandAreaCalculation | null>(null);

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

  const addStand = () => {
    const newStand: StandAreaCalculation = {
      standNumber: `LOT${stands.length + 1}`,
      entries: [
        {
          direction: '',
          distance: 0,
          name: '',
          y: 0,
          x: 0,
          dy: 0,
          dx: 0
        }
      ],
      area: 0,
      areaHectares: 0
    };
    setEditingStand(newStand);
    setShowAddStand(true);
  };

  const saveStand = () => {
    if (editingStand) {
      const existingIndex = stands.findIndex(s => s.standNumber === editingStand.standNumber);
      if (existingIndex >= 0) {
        const updated = [...stands];
        updated[existingIndex] = editingStand;
        setStands(updated);
      } else {
        setStands([...stands, editingStand]);
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

  const addEntry = () => {
    if (editingStand) {
      setEditingStand({
        ...editingStand,
        entries: [
          ...editingStand.entries,
          {
            direction: '',
            distance: 0,
            name: '',
            y: 0,
            x: 0,
            dy: 0,
            dx: 0
          }
        ]
      });
    }
  };

  const updateEntry = (index: number, field: keyof AreaCalculationEntry, value: string | number) => {
    if (editingStand) {
      const updated = [...editingStand.entries];
      updated[index] = { ...updated[index], [field]: value };
      setEditingStand({ ...editingStand, entries: updated });
    }
  };

  const removeEntry = (index: number) => {
    if (editingStand && editingStand.entries.length > 1) {
      const updated = editingStand.entries.filter((_, i) => i !== index);
      setEditingStand({ ...editingStand, entries: updated });
    }
  };

  const exportToPDF = () => {
    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    let yPosition = 20;

    // Title
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    const title = 'Areas from Co-ordinates (With Co-ordinate Checking)';
    const titleLines = pdf.splitTextToSize(title, pageWidth - 40);
    titleLines.forEach((line: string) => {
      pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 6;
    });

    // Underline
    pdf.setLineWidth(0.5);
    pdf.line(20, yPosition, pageWidth - 20, yPosition);
    yPosition += 10;

    // Process each stand
    stands.forEach((stand, standIndex) => {
      // Check if we need a new page
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = 20;
      }

      // Stand header
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Stand/Erf Number = ${stand.standNumber}`, 20, yPosition);
      yPosition += 5;
      pdf.line(20, yPosition, pageWidth - 20, yPosition);
      yPosition += 8;

      // Column headers
      const headers = ['Direction', 'Distance', 'Name', 'Y', 'X', 'DY', 'DX'];
      const colWidths = [25, 20, 20, 25, 25, 18, 18];
      let xPos = 20;

      pdf.setFontSize(8);
      headers.forEach((header, i) => {
        pdf.text(header, xPos, yPosition);
        xPos += colWidths[i];
      });
      yPosition += 5;
      pdf.line(20, yPosition, pageWidth - 20, yPosition);
      yPosition += 5;

      // Entries
      stand.entries.forEach((entry) => {
        if (yPosition > 270) {
          pdf.addPage();
          yPosition = 20;
        }

        xPos = 20;
        pdf.text(entry.direction || '', xPos, yPosition);
        xPos += colWidths[0];
        pdf.text(entry.distance.toFixed(2), xPos, yPosition);
        xPos += colWidths[1];
        pdf.text(entry.name, xPos, yPosition);
        xPos += colWidths[2];
        pdf.text(entry.y.toFixed(2), xPos, yPosition);
        xPos += colWidths[3];
        pdf.text(entry.x.toFixed(2), xPos, yPosition);
        xPos += colWidths[4];
        pdf.text(entry.dy.toFixed(3), xPos, yPosition);
        xPos += colWidths[5];
        pdf.text(entry.dx.toFixed(3), xPos, yPosition);
        yPosition += 5;
      });

      // Area
      yPosition += 3;
      pdf.text(`Area (Ha.) = ${stand.areaHectares.toFixed(4)}`, 60, yPosition);
      yPosition += 5;
      pdf.line(60, yPosition, 110, yPosition);
      yPosition += 10;
    });

    const projectName = projects.find(p => p.id === selectedProject)?.project_name || 'Area Calculations';
    pdf.save(`${projectName} - Areas and Consistencies.pdf`);
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Area Calculations with Coordinate Checking</h2>
        <p className="text-gray-600">Generate professional area calculation reports with coordinate consistency checks</p>
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

      {/* Action Buttons */}
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

      {/* Stands List */}
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
                  {stand.entries.length} boundary points
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setEditingStand(stand);
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

            {/* Preview table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Direction</th>
                    <th className="px-3 py-2 text-right">Distance</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-right">Y</th>
                    <th className="px-3 py-2 text-right">X</th>
                    <th className="px-3 py-2 text-right">DY</th>
                    <th className="px-3 py-2 text-right">DX</th>
                  </tr>
                </thead>
                <tbody>
                  {stand.entries.slice(0, 3).map((entry, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="px-3 py-2 font-mono text-xs">{entry.direction}</td>
                      <td className="px-3 py-2 text-right">{entry.distance.toFixed(2)}</td>
                      <td className="px-3 py-2">{entry.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{entry.y.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{entry.x.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{entry.dy.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{entry.dx.toFixed(3)}</td>
                    </tr>
                  ))}
                  {stand.entries.length > 3 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-2 text-center text-gray-500 text-xs">
                        ... and {stand.entries.length - 3} more entries
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
            <p className="text-gray-600 mb-4">Add your first stand to begin creating area calculation reports</p>
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

      {/* Add/Edit Stand Modal */}
      {showAddStand && editingStand && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                {stands.find(s => s.standNumber === editingStand.standNumber) ? 'Edit' : 'Add'} Stand
              </h3>
            </div>

            <div className="p-6">
              {/* Stand Number */}
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

              {/* Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Area (m²)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingStand.area}
                    onChange={(e) => {
                      const area = parseFloat(e.target.value) || 0;
                      setEditingStand({ ...editingStand, area, areaHectares: area / 10000 });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Area (Hectares)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editingStand.areaHectares}
                    onChange={(e) => {
                      const hectares = parseFloat(e.target.value) || 0;
                      setEditingStand({ ...editingStand, areaHectares: hectares, area: hectares * 10000 });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Entries */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-gray-900">Boundary Points</h4>
                  <button
                    onClick={addEntry}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors flex items-center"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Point
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border border-gray-300 px-2 py-2 text-left text-xs">Direction (DMS)</th>
                        <th className="border border-gray-300 px-2 py-2 text-left text-xs">Distance (m)</th>
                        <th className="border border-gray-300 px-2 py-2 text-left text-xs">Name</th>
                        <th className="border border-gray-300 px-2 py-2 text-left text-xs">Y</th>
                        <th className="border border-gray-300 px-2 py-2 text-left text-xs">X</th>
                        <th className="border border-gray-300 px-2 py-2 text-left text-xs">DY</th>
                        <th className="border border-gray-300 px-2 py-2 text-left text-xs">DX</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingStand.entries.map((entry, index) => (
                        <tr key={index}>
                          <td className="border border-gray-300 px-1 py-1">
                            <input
                              type="text"
                              value={entry.direction}
                              onChange={(e) => updateEntry(index, 'direction', e.target.value)}
                              className="w-full px-1 py-1 text-xs border-0 focus:ring-1 focus:ring-blue-500"
                              placeholder="321:42:00"
                            />
                          </td>
                          <td className="border border-gray-300 px-1 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={entry.distance}
                              onChange={(e) => updateEntry(index, 'distance', parseFloat(e.target.value) || 0)}
                              className="w-full px-1 py-1 text-xs border-0 focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="border border-gray-300 px-1 py-1">
                            <input
                              type="text"
                              value={entry.name}
                              onChange={(e) => updateEntry(index, 'name', e.target.value)}
                              className="w-full px-1 py-1 text-xs border-0 focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="border border-gray-300 px-1 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={entry.y}
                              onChange={(e) => updateEntry(index, 'y', parseFloat(e.target.value) || 0)}
                              className="w-full px-1 py-1 text-xs border-0 focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="border border-gray-300 px-1 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={entry.x}
                              onChange={(e) => updateEntry(index, 'x', parseFloat(e.target.value) || 0)}
                              className="w-full px-1 py-1 text-xs border-0 focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="border border-gray-300 px-1 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={entry.dy}
                              onChange={(e) => updateEntry(index, 'dy', parseFloat(e.target.value) || 0)}
                              className="w-full px-1 py-1 text-xs border-0 focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="border border-gray-300 px-1 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={entry.dx}
                              onChange={(e) => updateEntry(index, 'dx', parseFloat(e.target.value) || 0)}
                              className="w-full px-1 py-1 text-xs border-0 focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="border border-gray-300 px-1 py-1 text-center">
                            <button
                              onClick={() => removeEntry(index)}
                              className="text-red-600 hover:text-red-800 p-1"
                              disabled={editingStand.entries.length <= 1}
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

              {/* Form Actions */}
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Stand
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
