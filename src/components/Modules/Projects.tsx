import React, { useState, useEffect } from 'react';
import { Plus, Search, MapPin, Calendar, User, FileText, CreditCard as Edit, Trash2, Eye } from 'lucide-react';
import { surveyingApi } from '../../lib/supabase';
import { SurveyProject } from '../../types/surveying';

export const Projects: React.FC = () => {
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedProject, setSelectedProject] = useState<SurveyProject | null>(null);
  const [coordinateSystems, setCoordinateSystems] = useState<any[]>([]);

  // Form state for creating/editing projects
  const [formData, setFormData] = useState({
    project_name: '',
    project_type: 'cadastral' as const,
    district: '',
    coordinate_system_id: '',
    surveyor_name: '',
    surveyor_registration: '',
    field_work_start_date: '',
    field_work_end_date: '',
    survey_purpose: '',
    parent_diagram_number: '',
    parent_deed_type: '',
    parent_deed_number: '',
    original_title_deed_type: '',
    original_title_deed_number: '',
    original_diagram_number: '',
    is_based_on_trigonometrical: false,
    notes: ''
  });

  useEffect(() => {
    loadProjects();
    loadCoordinateSystems();
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

  const loadCoordinateSystems = async () => {
    try {
      const data = await surveyingApi.getCoordinateSystems();
      setCoordinateSystems(data || []);
    } catch (error) {
      console.error('Error loading coordinate systems:', error);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const projectData = {
        ...formData,
        field_work_start_date: formData.field_work_start_date,
        field_work_end_date: formData.field_work_end_date || undefined,
      };
      
      await surveyingApi.createProject(projectData);
      setShowCreateForm(false);
      resetForm();
      loadProjects();
      alert('Project created successfully!');
    } catch (error) {
      console.error('Error creating project:', error);
      alert(`Error creating project: ${error instanceof Error ? error.message : 'Please try again.'}`);
    }
  };

  const resetForm = () => {
    setFormData({
      project_name: '',
      project_type: 'cadastral',
      district: '',
      coordinate_system_id: '',
      surveyor_name: '',
      surveyor_registration: '',
      field_work_start_date: '',
      field_work_end_date: '',
      survey_purpose: '',
      parent_diagram_number: '',
      parent_deed_type: '',
      parent_deed_number: '',
      original_title_deed_type: '',
      original_title_deed_number: '',
      original_diagram_number: '',
      is_based_on_trigonometrical: false,
      notes: ''
    });
  };

  const filteredProjects = projects.filter(project =>
    project.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.district.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.surveyor_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      field_complete: 'bg-blue-100 text-blue-800',
      calculations_complete: 'bg-yellow-100 text-yellow-800',
      diagram_submitted: 'bg-purple-100 text-purple-800',
      approved: 'bg-green-100 text-green-800',
      registered: 'bg-emerald-100 text-emerald-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-ZW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
            <h2 className="text-3xl font-bold text-gray-900">Survey Projects</h2>
            <p className="text-gray-600">Manage your cadastral survey projects</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>New Project</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search projects by name, district, or surveyor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((project) => (
          <div key={project.id} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{project.project_name}</h3>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => setSelectedProject(project)}
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
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>{project.district} District</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <User className="h-4 w-4 mr-2" />
                  <span>{project.surveyor_name}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="h-4 w-4 mr-2" />
                  <span>Started: {formatDate(project.field_work_start_date)}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="capitalize">{project.project_type} Survey</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 line-clamp-2">{project.survey_purpose}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm ? 'Try adjusting your search terms' : 'Get started by creating your first survey project'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Project
            </button>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Create New Survey Project</h3>
              <p className="text-gray-600 mt-1">Enter the project details according to Zimbabwe survey regulations</p>
            </div>

            <form onSubmit={handleCreateProject} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Basic Information</h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.project_name}
                      onChange={(e) => setFormData({...formData, project_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Residential Subdivision - Block A"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Project Type *</label>
                    <select
                      required
                      value={formData.project_type}
                      onChange={(e) => setFormData({...formData, project_type: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="cadastral">Cadastral</option>
                      <option value="engineering">Engineering</option>
                      <option value="mining">Mining</option>
                      <option value="township">Township</option>
                      <option value="subdivision">Subdivision</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">District *</label>
                    <input
                      type="text"
                      required
                      value={formData.district}
                      onChange={(e) => setFormData({...formData, district: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Harare"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Coordinate System</label>
                    <select
                      value={formData.coordinate_system_id}
                      onChange={(e) => setFormData({...formData, coordinate_system_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select coordinate system</option>
                      {coordinateSystems.map((cs) => (
                        <option key={cs.id} value={cs.id}>
                          {cs.name} ({cs.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Surveyor Information */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Surveyor Information</h4>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Surveyor Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.surveyor_name}
                      onChange={(e) => setFormData({...formData, surveyor_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Full name of registered surveyor"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number *</label>
                    <input
                      type="text"
                      required
                      value={formData.surveyor_registration}
                      onChange={(e) => setFormData({...formData, surveyor_registration: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Professional registration number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Field Work Start Date *</label>
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().split('T')[0]}
                      value={formData.field_work_start_date}
                      onChange={(e) => setFormData({...formData, field_work_start_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Field Work End Date</label>
                    <input
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      min={formData.field_work_start_date}
                      value={formData.field_work_end_date}
                      onChange={(e) => setFormData({...formData, field_work_end_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Survey Purpose */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Survey Purpose *</label>
                <textarea
                  required
                  value={formData.survey_purpose}
                  onChange={(e) => setFormData({...formData, survey_purpose: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe the purpose and scope of this survey..."
                />
              </div>

              {/* Parent Property Information */}
              <div>
                <h4 className="font-medium text-gray-900 mb-4">Parent Property Information (Section 53)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent Diagram Number</label>
                    <input
                      type="text"
                      value={formData.parent_diagram_number}
                      onChange={(e) => setFormData({...formData, parent_diagram_number: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent Deed Type</label>
                    <input
                      type="text"
                      value={formData.parent_deed_type}
                      onChange={(e) => setFormData({...formData, parent_deed_type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent Deed Number</label>
                    <input
                      type="text"
                      value={formData.parent_deed_number}
                      onChange={(e) => setFormData({...formData, parent_deed_number: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Options */}
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="trigonometrical"
                    checked={formData.is_based_on_trigonometrical}
                    onChange={(e) => setFormData({...formData, is_based_on_trigonometrical: e.target.checked})}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="trigonometrical" className="ml-2 text-sm text-gray-700">
                    Based on trigonometrical system (Section 11)
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Additional notes or special circumstances..."
                  />
                </div>
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
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Details Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{selectedProject.project_name}</h3>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-2 ${getStatusColor(selectedProject.status)}`}>
                    {selectedProject.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedProject(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Project Information</h4>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Type:</span> {selectedProject.project_type}</div>
                    <div><span className="font-medium">District:</span> {selectedProject.district}</div>
                    <div><span className="font-medium">Purpose:</span> {selectedProject.survey_purpose}</div>
                    <div><span className="font-medium">Created:</span> {formatDate(selectedProject.created_at)}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Surveyor Information</h4>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Name:</span> {selectedProject.surveyor_name}</div>
                    <div><span className="font-medium">Registration:</span> {selectedProject.surveyor_registration}</div>
                    <div><span className="font-medium">Field Work Start:</span> {formatDate(selectedProject.field_work_start_date)}</div>
                    {selectedProject.field_work_end_date && (
                      <div><span className="font-medium">Field Work End:</span> {formatDate(selectedProject.field_work_end_date)}</div>
                    )}
                  </div>
                </div>
              </div>

              {selectedProject.notes && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Notes</h4>
                  <p className="text-sm text-gray-600">{selectedProject.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};