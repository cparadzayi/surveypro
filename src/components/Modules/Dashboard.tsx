import React, { useState, useEffect } from 'react';
import { BarChart3, MapPin, Calculator, Database, Plus } from 'lucide-react';
import { surveyingApi, isSupabaseConfigured } from '../../lib/supabase';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    totalBeacons: 0,
    calculationsToday: 0
  });
  const [recentProjects, setRecentProjects] = useState<Array<{ id: string; project_name: string; district: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      if (!isSupabaseConfigured()) {
        console.error('Supabase not configured. Please check your .env file.');
        setStats({
          totalProjects: 0,
          activeProjects: 0,
          totalBeacons: 0,
          calculationsToday: 0
        });
        setRecentProjects([]);
        return;
      }
      
      const projects = await surveyingApi.getProjects();
      
      if (projects) {
        const activeProjects = projects.filter(p => 
          ['field_complete', 'calculations_complete', 'diagram_submitted'].includes(p.status)
        );
        
        setStats({
          totalProjects: projects.length,
          activeProjects: activeProjects.length,
          totalBeacons: 0, // Will be calculated from beacons
          calculationsToday: 0 // Will be calculated from calculations
        });
        
        setRecentProjects(projects.slice(0, 5));
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    color: string;
  }> = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white rounded-xl shadow-md p-6 border-l-4" style={{ borderColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-full" style={{ backgroundColor: `${color}20` }}>
          <Icon className="h-6 w-6" style={{ color }} />
        </div>
      </div>
    </div>
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
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h2>
        <p className="text-gray-600">Overview of your surveying projects and activities</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Projects"
          value={stats.totalProjects}
          icon={Database}
          color="#3b82f6"
        />
        <StatCard
          title="Active Projects"
          value={stats.activeProjects}
          icon={BarChart3}
          color="#10b981"
        />
        <StatCard
          title="Survey Beacons"
          value={stats.totalBeacons}
          icon={MapPin}
          color="#f59e0b"
        />
        <StatCard
          title="Calculations Today"
          value={stats.calculationsToday}
          icon={Calculator}
          color="#8b5cf6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Projects</h3>
          <div className="space-y-3">
            {recentProjects.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">No projects yet. Create your first survey project to get started.</p>
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center mx-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </button>
              </div>
            ) : (
              recentProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{project.project_name}</p>
                    <p className="text-sm text-gray-600">{project.district} District</p>
                  </div>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'New Project', color: 'bg-blue-500', textColor: 'text-white' },
              { label: 'Add Beacons', color: 'bg-green-500', textColor: 'text-white' },
              { label: 'Calculate Area', color: 'bg-yellow-500', textColor: 'text-white' },
              { label: 'Generate Report', color: 'bg-purple-500', textColor: 'text-white' }
            ].map((action, index) => (
              <button
                key={index}
                className={`p-4 rounded-lg ${action.color} ${action.textColor} hover:opacity-90 transition-opacity font-medium`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};