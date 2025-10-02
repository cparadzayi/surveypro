import React, { useState } from 'react';
import { Settings as SettingsIcon, Database, Trash2, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '../Auth/AuthProvider';
import { databaseUtils } from '../../lib/supabase';

export const Settings: React.FC = () => {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ projects: 0, beacons: 0, calculations: 0, diagrams: 0 });
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadStats = async () => {
    try {
      setLoading(true);
      const dbStats = await databaseUtils.getDatabaseStats();
      setStats(dbStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    try {
      setLoading(true);
      await databaseUtils.clearUserData();
      setMessage({ type: 'success', text: 'All user data cleared successfully!' });
      setShowConfirmClear(false);
      await loadStats(); // Refresh stats
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessage({ type: 'error', text: `Error clearing data: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  React.useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Settings</h2>
        <p className="text-gray-600">Manage your account and application settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Information */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <SettingsIcon className="h-5 w-5 mr-2" />
            Account Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-600">
                {user?.email}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-600 font-mono text-xs">
                {user?.id}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Created</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-600">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Database Management */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Database className="h-5 w-5 mr-2" />
            Database Management
          </h3>

          {/* Database Statistics */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-gray-900">Your Data</h4>
              <button
                onClick={loadStats}
                disabled={loading}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.projects}</div>
                <div className="text-sm text-blue-800">Projects</div>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.beacons}</div>
                <div className="text-sm text-green-800">Beacons</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{stats.calculations}</div>
                <div className="text-sm text-yellow-800">Calculations</div>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.diagrams}</div>
                <div className="text-sm text-purple-800">Diagrams</div>
              </div>
            </div>
          </div>

          {/* Clear Data Section */}
          <div className="border-t border-gray-200 pt-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3" />
                <div>
                  <h4 className="font-medium text-red-900">Danger Zone</h4>
                  <p className="text-sm text-red-700 mt-1">
                    This will permanently delete all your survey data including projects, beacons, calculations, and diagrams.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowConfirmClear(true)}
              disabled={loading}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center disabled:bg-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </button>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {message && (
        <div className={`mt-6 p-4 rounded-lg flex items-center ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5 mr-3" />
          ) : (
            <AlertTriangle className="h-5 w-5 mr-3" />
          )}
          {message.text}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">Confirm Data Deletion</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you absolutely sure you want to delete all your survey data? This action cannot be undone.
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800 font-medium">This will delete:</p>
              <ul className="text-sm text-red-700 mt-1 list-disc list-inside">
                <li>{stats.projects} survey projects</li>
                <li>{stats.beacons} survey beacons</li>
                <li>{stats.calculations} calculations</li>
                <li>{stats.diagrams} diagrams</li>
                <li>All related records and documents</li>
              </ul>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-400 flex items-center justify-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  'Delete All Data'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};