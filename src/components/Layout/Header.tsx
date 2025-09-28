import React from 'react';
import { MapPin, Menu, LogOut } from 'lucide-react';
import { useAuth } from '../Auth/AuthProvider';

interface HeaderProps {
  onMenuToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { signOut, user } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="bg-slate-900 text-white shadow-lg">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onMenuToggle}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-2">
              <MapPin className="h-8 w-8 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold">SurveyPro</h1>
                <p className="text-xs text-slate-300">Professional Land Surveying</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <span className="text-sm text-slate-300">{user?.email}</span>
              <button 
                onClick={handleSignOut}
                className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};