import React, { useState } from 'react';
import { AuthProvider, useAuth } from './components/Auth/AuthProvider';
import { LoginForm } from './components/Auth/LoginForm';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { Dashboard } from './components/Modules/Dashboard';
import { Projects } from './components/Modules/Projects';
import { Beacons } from './components/Modules/Beacons';
import { Calculations } from './components/Modules/Calculations';
import { Help } from './components/Modules/Help';
import { Settings } from './components/Modules/Settings';
import { DigitalLodgment } from './components/Modules/DigitalLodgment';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const handleModuleChange = (module: string) => {
    setActiveModule(module);
    setSidebarOpen(false);
  };

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard />;
      case 'projects':
        return <Projects />;
      case 'calculations':
        return <Calculations />;
      case 'beacons':
        return <Beacons />;
      case 'digital-lodgment':
        return <DigitalLodgment />;
      case 'cadastral':
        return <div className="p-6"><h2 className="text-2xl font-bold">Cadastral Module - Coming Soon</h2></div>;
      case 'engineering':
        return <div className="p-6"><h2 className="text-2xl font-bold">Engineering Module - Coming Soon</h2></div>;
      case 'mining':
        return <div className="p-6"><h2 className="text-2xl font-bold">Mining Module - Coming Soon</h2></div>;
      case 'traverse':
        return <div className="p-6"><h2 className="text-2xl font-bold">Traverse Module - Coming Soon</h2></div>;
      case 'reports':
        return <div className="p-6"><h2 className="text-2xl font-bold">Reports - Coming Soon</h2></div>;
      case 'help':
        return <Help />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex">
        <Sidebar 
          isOpen={sidebarOpen}
          activeModule={activeModule}
          onModuleChange={handleModuleChange}
        />
        
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        <main className="flex-1 lg:ml-0">
          {renderActiveModule()}
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;