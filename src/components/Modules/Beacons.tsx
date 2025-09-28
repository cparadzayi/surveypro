import React, { useState, useEffect } from 'react';
import { Plus, Search, MapPin, CreditCard as Edit, Trash2, Eye, Target } from 'lucide-react';
import { surveyingApi } from '../../lib/supabase';
import { SurveyBeacon, SurveyProject } from '../../types/surveying';

export const Beacons: React.FC = () => {
  const [beacons, setBeacons] = useState<SurveyBeacon[]>([]);
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedBeacon, setSelectedBeacon] = useState<SurveyBeacon | null>(null);

  // Form state for creating/editing beacons
  const [formData, setFormData] = useState({
    project_id: '',
    beacon_name: '',
    beacon_type: 'corner' as const,
    y_coordinate: '',
    x_coordinate: '',
    elevation: '',
    beacon_specification: '',
    centre_mark_type: '',
    centre_mark_diameter: '',
    centre_mark_depth: '',
    has_cairn: false,
    has_mound: false,
    has_trenches: false,
    beacon_status: 'placed' as const,
    condition_when_found: '',
    is_established_beacon: false,
    accuracy_class: '' as any,
    survey_method: '',
    surveyed_date: '',
    surveyed_by: ''
  });

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadBeacons(selectedProject);
    } else {
      setBeacons([]);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await surveyingApi.getProjects();
      setProjects(data || []);
      if (data && data.length > 0) {
        setSelectedProject(data[0].id);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBeacons = async (projectId: string) => {
    try {
      setLoading(true);
      const data = await surveyingApi.getBeacons(projectId);
      setBeacons(data || []);
    } catch (error) {
      console.error('Error loading beacons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBeacon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const beaconData = {
        ...formData,
        project_id: selectedProject,
        y_coordinate: parseFloat(formData.y_coordinate),
        x_coordinate: parseFloat(formData.x_coordinate),
        elevation: formData.elevation ? parseFloat(formData.elevation) : undefined,
        centre_mark_diameter: formData.centre_mark_diameter ? parseFloat(formData.centre_mark_diameter) : undefined,
        centre_mark_depth: formData.centre_mark_depth ? parseFloat(formData.centre_mark_depth) : undefined,
      };

      await surveyingApi.addBeacon(beaconData);
      setShowCreateForm(false);
      resetForm();
      loadBeacons(selectedProject);
    } catch (error) {
      console.error('Error creating beacon:', error);
      alert('Error creating beacon. Please check your input and try again.');
    }
  };

  const resetForm = () => {
    setFormData({
      project_id: '',
      beacon_name: '',
      beacon_type: 'corner',
      y_coordinate: '',
      x_coordinate: '',
      elevation: '',
      beacon_specification: '',
      centre_mark_type: '',
      centre_mark_diameter: '',
      centre_mark_depth: '',
      has_cairn: false,
      has_mound: false,
      has_trenches: false,
      beacon_status: 'placed',
      condition_when_found: '',
      is_established_beacon: false,
      accuracy_class: '',
      survey_method: '',
      surveyed_date: '',
      surveyed_by: ''
    });
  };

  const filteredBeacons = beacons.filter(beacon =>
    beacon.beacon_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    beacon.beacon_full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    beacon.beacon_specification.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getBeaconTypeColor = (type: string) => {
    const colors = {
      corner: 'bg-blue-100 text-blue-800',
      indicatory: 'bg-green-100 text-green-800',
      reference_mark: 'bg-purple-100 text-purple-800',
      witness: 'bg-yellow-100 text-yellow-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors = {
      found: 'bg-green-100 text-green-800',
      placed: 'bg-blue-100 text-blue-800',
      replaced: 'bg-yellow-100 text-yellow-800',
      missing: 'bg-red-100 text-red-800',
      damaged: 'bg-orange-100 text-orange-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Survey Beacons</h2>
            <p className="text-gray-600">Manage survey beacons per Zimbabwe regulations (Sections 22-27)</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={!selectedProject}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400"
          >
            <Plus className="h-5 w-5" />
            <span>Add Beacon</span>
          </button>
        </div>

        {/* Project Selection */}
        <div className="mb-4">
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

        {/* Search Bar */}
        {selectedProject && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search beacons by name, coordinates, or specification..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {selectedProject ? (
        <>
          {/* Beacons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBeacons.map((beacon) => (
              <div key={beacon.id} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-200">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {beacon.beacon_full_name || `${beacon.beacon_name}(${beacon.y_coordinate},${beacon.x_coordinate})`}
                      </h3>
                      <div className="flex space-x-2">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getBeaconTypeColor(beacon.beacon_type)}`}>
                          {beacon.beacon_type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(beacon.beacon_status)}`}>
                          {beacon.beacon_status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => setSelectedBeacon(beacon)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-sm font-medium text-blue-900 mb-1">Zimbabwe Coordinates</div>
                      <div className="text-sm text-blue-800">
                        Y: {beacon.y_coordinate.toFixed(3)} (westwards)<br />
                        X: {beacon.x_coordinate.toFixed(3)} (southwards)
                      </div>
                      {beacon.elevation && (
                        <div className="text-sm text-blue-800">
                          Elevation: {beacon.elevation.toFixed(3)}m
                        </div>
                      )}
                    </div>

                    <div className="flex items-center text-sm text-gray-600">
                      <Target className="h-4 w-4 mr-2" />
                      <span>{beacon.beacon_specification}</span>
                    </div>

                    {beacon.accuracy_class && (
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span>Class {beacon.accuracy_class} accuracy</span>
                      </div>
                    )}

                    <div className="flex space-x-2 text-xs">
                      {beacon.has_cairn && <span className="bg-gray-100 px-2 py-1 rounded">Cairn</span>}
                      {beacon.has_mound && <span className="bg-gray-100 px-2 py-1 rounded">Mound</span>}
                      {beacon.has_trenches && <span className="bg-gray-100 px-2 py-1 rounded">Trenches</span>}
                      {beacon.is_established_beacon && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">Established</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredBeacons.length === 0 && (
            <div className="text-center py-12">
              <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No beacons found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm ? 'Try adjusting your search terms' : 'Start by adding survey beacons to this project'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add First Beacon
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Project</h3>
          <p className="text-gray-600">Choose a survey project to view and manage its beacons</p>
        </div>
      )}

      {/* Create Beacon Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Add Survey Beacon</h3>
              <p className="text-gray-600 mt-1">Enter beacon details according to Zimbabwe survey regulations</p>
            </div>

            <form onSubmit={handleCreateBeacon} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Basic Information</h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Beacon Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.beacon_name}
                      onChange={(e) => setFormData({...formData, beacon_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., P, Q, R, A1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Beacon Type *</label>
                    <select
                      required
                      value={formData.beacon_type}
                      onChange={(e) => setFormData({...formData, beacon_type: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="corner">Corner</option>
                      <option value="indicatory">Indicatory</option>
                      <option value="reference_mark">Reference Mark</option>
                      <option value="witness">Witness</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Beacon Status *</label>
                    <select
                      required
                      value={formData.beacon_status}
                      onChange={(e) => setFormData({...formData, beacon_status: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="placed">Placed</option>
                      <option value="found">Found</option>
                      <option value="replaced">Replaced</option>
                      <option value="missing">Missing</option>
                      <option value="damaged">Damaged</option>
                    </select>
                  </div>
                </div>

                {/* Coordinates */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Zimbabwe Coordinates</h4>
                  <div className="bg-blue-50 p-3 rounded-lg mb-4">
                    <p className="text-sm text-blue-800 font-medium">Zimbabwe Convention:</p>
                    <p className="text-xs text-blue-700">Y increases westwards, X increases southwards</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Y Coordinate (westwards) *</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={formData.y_coordinate}
                      onChange={(e) => setFormData({...formData, y_coordinate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">X Coordinate (southwards) *</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={formData.x_coordinate}
                      onChange={(e) => setFormData({...formData, x_coordinate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Elevation (m)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={formData.elevation}
                      onChange={(e) => setFormData({...formData, elevation: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.000"
                    />
                  </div>
                </div>
              </div>

              {/* Physical Specifications */}
              <div>
                <h4 className="font-medium text-gray-900 mb-4">Physical Specifications (Section 22)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Beacon Specification *</label>
                    <select
                      required
                      value={formData.beacon_specification}
                      onChange={(e) => setFormData({...formData, beacon_specification: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select specification...</option>
                      <option value="iron_rail_2m">Iron rail 2m (soft/sandy ground)</option>
                      <option value="iron_rail_1m_cairn">Iron rail 1m with cairn</option>
                      <option value="iron_rail_1m_mound">Iron rail 1m with mound and trenches</option>
                      <option value="rail_section_1m">Rail section 1m</option>
                      <option value="concrete_block">Concrete block 1m</option>
                      <option value="centre_mark_cairn">Centre mark with cairn</option>
                      <option value="centre_mark_concrete">Centre mark in concrete</option>
                      <option value="iron_pipe_concrete">Iron pipe in concrete cairn</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Centre Mark Type</label>
                    <select
                      value={formData.centre_mark_type}
                      onChange={(e) => setFormData({...formData, centre_mark_type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select type...</option>
                      <option value="iron_peg">Iron peg</option>
                      <option value="iron_pipe">Iron pipe</option>
                      <option value="drilled_hole">Drilled hole</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Centre Mark Diameter (mm)</label>
                    <input
                      type="number"
                      value={formData.centre_mark_diameter}
                      onChange={(e) => setFormData({...formData, centre_mark_diameter: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="12"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Centre Mark Depth (mm)</label>
                    <input
                      type="number"
                      value={formData.centre_mark_depth}
                      onChange={(e) => setFormData({...formData, centre_mark_depth: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="450"
                    />
                  </div>
                </div>

                {/* Physical Features */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="has_cairn"
                      checked={formData.has_cairn}
                      onChange={(e) => setFormData({...formData, has_cairn: e.target.checked})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="has_cairn" className="ml-2 text-sm text-gray-700">
                      Has cairn (750mm diameter, 750mm height)
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="has_mound"
                      checked={formData.has_mound}
                      onChange={(e) => setFormData({...formData, has_mound: e.target.checked})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="has_mound" className="ml-2 text-sm text-gray-700">
                      Has mound (750mm diameter, 750mm height)
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="has_trenches"
                      checked={formData.has_trenches}
                      onChange={(e) => setFormData({...formData, has_trenches: e.target.checked})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="has_trenches" className="ml-2 text-sm text-gray-700">
                      Has trenches (2m length, 300mm depth, 300mm width)
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_established_beacon"
                      checked={formData.is_established_beacon}
                      onChange={(e) => setFormData({...formData, is_established_beacon: e.target.checked})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_established_beacon" className="ml-2 text-sm text-gray-700">
                      Established beacon (legally recognized)
                    </label>
                  </div>
                </div>
              </div>

              {/* Survey Metadata */}
              <div>
                <h4 className="font-medium text-gray-900 mb-4">Survey Metadata</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Accuracy Class</label>
                    <select
                      value={formData.accuracy_class}
                      onChange={(e) => setFormData({...formData, accuracy_class: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select class...</option>
                      <option value="A">Class A</option>
                      <option value="B">Class B</option>
                      <option value="C">Class C</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Survey Method</label>
                    <input
                      type="text"
                      value={formData.survey_method}
                      onChange={(e) => setFormData({...formData, survey_method: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., triangulation, traverse"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Surveyed Date</label>
                    <input
                      type="date"
                      value={formData.surveyed_date}
                      onChange={(e) => setFormData({...formData, surveyed_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Surveyed By</label>
                  <input
                    type="text"
                    value={formData.surveyed_by}
                    onChange={(e) => setFormData({...formData, surveyed_by: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Name of surveyor or assistant"
                  />
                </div>

                {formData.beacon_status === 'found' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Condition When Found</label>
                    <textarea
                      value={formData.condition_when_found}
                      onChange={(e) => setFormData({...formData, condition_when_found: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Describe the condition of the beacon when found..."
                    />
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Beacon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Beacon Details Modal */}
      {selectedBeacon && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedBeacon.beacon_full_name || `${selectedBeacon.beacon_name}(${selectedBeacon.y_coordinate},${selectedBeacon.x_coordinate})`}
                  </h3>
                  <div className="flex space-x-2 mt-2">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getBeaconTypeColor(selectedBeacon.beacon_type)}`}>
                      {selectedBeacon.beacon_type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedBeacon.beacon_status)}`}>
                      {selectedBeacon.beacon_status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedBeacon(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Coordinates</h4>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-sm font-medium text-blue-900 mb-2">Zimbabwe Coordinates</div>
                    <div className="space-y-1 text-sm text-blue-800">
                      <div>Y: {selectedBeacon.y_coordinate.toFixed(3)} (westwards)</div>
                      <div>X: {selectedBeacon.x_coordinate.toFixed(3)} (southwards)</div>
                      {selectedBeacon.elevation && (
                        <div>Elevation: {selectedBeacon.elevation.toFixed(3)}m</div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Physical Specifications</h4>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Specification:</span> {selectedBeacon.beacon_specification}</div>
                    {selectedBeacon.centre_mark_type && (
                      <div><span className="font-medium">Centre Mark:</span> {selectedBeacon.centre_mark_type}</div>
                    )}
                    {selectedBeacon.centre_mark_diameter && (
                      <div><span className="font-medium">Diameter:</span> {selectedBeacon.centre_mark_diameter}mm</div>
                    )}
                    {selectedBeacon.centre_mark_depth && (
                      <div><span className="font-medium">Depth:</span> {selectedBeacon.centre_mark_depth}mm</div>
                    )}
                  </div>
                </div>
              </div>

              {(selectedBeacon.has_cairn || selectedBeacon.has_mound || selectedBeacon.has_trenches || selectedBeacon.is_established_beacon) && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Features</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedBeacon.has_cairn && <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">Cairn</span>}
                    {selectedBeacon.has_mound && <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">Mound</span>}
                    {selectedBeacon.has_trenches && <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">Trenches</span>}
                    {selectedBeacon.is_established_beacon && <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">Established</span>}
                  </div>
                </div>
              )}

              {(selectedBeacon.accuracy_class || selectedBeacon.survey_method || selectedBeacon.surveyed_by) && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Survey Information</h4>
                  <div className="space-y-2 text-sm">
                    {selectedBeacon.accuracy_class && (
                      <div><span className="font-medium">Accuracy Class:</span> {selectedBeacon.accuracy_class}</div>
                    )}
                    {selectedBeacon.survey_method && (
                      <div><span className="font-medium">Survey Method:</span> {selectedBeacon.survey_method}</div>
                    )}
                    {selectedBeacon.surveyed_by && (
                      <div><span className="font-medium">Surveyed By:</span> {selectedBeacon.surveyed_by}</div>
                    )}
                    {selectedBeacon.surveyed_date && (
                      <div><span className="font-medium">Surveyed Date:</span> {new Date(selectedBeacon.surveyed_date).toLocaleDateString()}</div>
                    )}
                  </div>
                </div>
              )}

              {selectedBeacon.condition_when_found && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Condition When Found</h4>
                  <p className="text-sm text-gray-600">{selectedBeacon.condition_when_found}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};