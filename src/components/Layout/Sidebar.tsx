import React from 'react';
import { Calculator, Map, Database, FileText, BarChart3, Settings, Compass, Triangle, Mountain, Target, HelpCircle } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  activeModule: string;
  onModuleChange: (module: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'projects', label: 'Projects', icon: Database },
  { id: 'calculations', label: 'Calculations', icon: Calculator },
  { id: 'beacons', label: 'Beacons', icon: Target },
  { id: 'digital-lodgment', label: 'Digital Lodgment', icon: FileText },
  { id: 'cadastral', label: 'Cadastral', icon: Map },
  { id: 'engineering', label: 'Engineering', icon: Compass },
  { id: 'mining', label: 'Mining', icon: Mountain },
  { id: 'traverse', label: 'Traverse', icon: Triangle },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'help', label: 'Help', icon: HelpCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, activeModule, onModuleChange }) => {
  return (
    <aside className={`
      fixed lg:static inset-y-0 left-0 z-50
      w-64 bg-slate-800 text-white transform transition-transform duration-200 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      <nav className="mt-8 px-4">
        <div className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onModuleChange(item.id)}
                className={`
                  w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors
                  ${activeModule === item.id 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }
                `}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};