import React, { useState } from 'react';
import { HelpCircle, Book, Search, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

export const Help: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>(['getting-started']);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const helpSections = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: '🚀',
      content: [
        {
          title: 'Creating Your Account',
          steps: [
            'Click "Don\'t have an account? Sign up"',
            'Enter your professional email address',
            'Create a secure password (minimum 6 characters)',
            'Click "Sign Up" and then sign in with your credentials'
          ]
        },
        {
          title: 'First Project Setup',
          steps: [
            'Navigate to Projects → New Project',
            'Fill in project name and select type (Cadastral, Engineering, etc.)',
            'Enter surveyor information and registration number',
            'Set field work dates and survey purpose',
            'Save your project to begin adding beacons'
          ]
        }
      ]
    },
    {
      id: 'projects',
      title: 'Project Management',
      icon: '📁',
      content: [
        {
          title: 'Creating Survey Projects',
          steps: [
            'Go to Dashboard → Projects → New Project',
            'Enter project details: name, type, district',
            'Add surveyor information and registration',
            'Include parent property information (Section 53)',
            'Set survey purpose and any special notes'
          ]
        },
        {
          title: 'Project Status Workflow',
          steps: [
            'Draft → Initial project creation',
            'Field Complete → Field work finished',
            'Calculations Complete → All calculations done',
            'Diagram Submitted → Submitted to Surveyor General',
            'Approved → Officially approved',
            'Registered → Final registration complete'
          ]
        }
      ]
    },
    {
      id: 'beacons',
      title: 'Survey Beacons',
      icon: '🎯',
      content: [
        {
          title: 'Adding Beacons (Zimbabwe Convention)',
          steps: [
            'Select your project from the dropdown',
            'Click "Add Beacon" button',
            'Enter beacon name (P, Q, R, etc.)',
            'Input coordinates: Y (westwards), X (southwards)',
            'Select beacon type: Corner, Indicatory, Reference Mark, Witness',
            'Choose physical specification (iron rail, concrete block, etc.)',
            'Add features: cairn, mound, trenches as needed'
          ]
        },
        {
          title: 'Zimbabwe Coordinate System',
          steps: [
            'Y-coordinate increases westwards (←)',
            'X-coordinate increases southwards (↓)',
            'Format: 1234567.890 (use decimal notation)',
            'Example: P(1234567.890,2345678.123)'
          ]
        }
      ]
    },
    {
      id: 'calculations',
      title: 'Survey Calculations',
      icon: '🧮',
      content: [
        {
          title: 'Bearing & Distance',
          steps: [
            'Enter "From" coordinates (Y, X)',
            'Enter "To" coordinates (Y, X)',
            'Click Calculate',
            'Results show bearing from South (Zimbabwe convention)',
            'Distance displayed in meters'
          ]
        },
        {
          title: 'Coordinates from Bearing/Distance',
          steps: [
            'Enter starting point coordinates',
            'Input bearing in degrees, minutes, seconds',
            'Enter distance in meters',
            'Calculate to get new coordinates',
            'Remember: 0° = South, 90° = West'
          ]
        },
        {
          title: 'Area Calculation',
          steps: [
            'Enter at least 3 beacon coordinates',
            'Use Add Beacon button for more points',
            'Click Calculate Area',
            'Results follow Zimbabwe conventions:',
            '  - < 1 ha: shown in m² (rounded)',
            '  - ≥ 1 ha: shown in hectares to 4 decimal places'
          ]
        }
      ]
    },
    {
      id: 'compliance',
      title: 'Zimbabwe Survey Compliance',
      icon: '⚖️',
      content: [
        {
          title: 'Legal Requirements (SI 727 of 1979)',
          steps: [
            'All surveys must follow Zimbabwe coordinate system',
            'Beacons must meet Section 22 specifications',
            'Survey records must include all required documents',
            'Area calculations must use official rounding conventions',
            'Surveyor registration must be current and valid'
          ]
        },
        {
          title: 'Required Survey Documents',
          steps: [
            'Field Notes - Raw measurements and observations',
            'Coordinate List and Calculations - Survey computations',
            'General Plans - Survey diagrams and plans',
            'Working Plan - Detailed working drawings',
            'Report on Survey - Technical survey report',
            'Dispensation Certificate - Special permissions',
            'Examination Fees - Payment for official examination'
          ]
        }
      ]
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      icon: '🔧',
      content: [
        {
          title: 'Login Issues',
          steps: [
            'Ensure you\'ve created an account first (Sign Up)',
            'Check email and password spelling carefully',
            'Try signing up with a new email if problems persist',
            'Clear browser cache and try again'
          ]
        },
        {
          title: 'Calculation Problems',
          steps: [
            'Verify coordinates are in Zimbabwe format (Y westwards, X southwards)',
            'Check bearing convention (0° = South, clockwise positive)',
            'Ensure all required fields are filled in',
            'Use decimal format for coordinates (e.g., 1234567.890)'
          ]
        },
        {
          title: 'Data Not Saving',
          steps: [
            'Check your internet connection',
            'Ensure you\'re logged in to your account',
            'Try refreshing the page and logging in again',
            'Fill in all required fields marked with *'
          ]
        }
      ]
    }
  ];

  const filteredSections = helpSections.filter(section =>
    section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.content.some(item => 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.steps.some(step => step.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Help & Documentation</h2>
        <p className="text-gray-600">Complete guide to using SurveyPro for Zimbabwe cadastral surveying</p>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search help topics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <a
          href="/USER_MANUAL.md"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors flex items-center"
        >
          <Book className="h-6 w-6 text-blue-600 mr-3" />
          <div>
            <h3 className="font-medium text-blue-900">Complete User Manual</h3>
            <p className="text-sm text-blue-700">Detailed documentation (PDF)</p>
          </div>
          <ExternalLink className="h-4 w-4 text-blue-600 ml-auto" />
        </a>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <HelpCircle className="h-6 w-6 text-green-600 mb-2" />
          <h3 className="font-medium text-green-900">Zimbabwe Compliance</h3>
          <p className="text-sm text-green-700">SI 727 of 1979 compliant</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-2xl mb-2">🎯</div>
          <h3 className="font-medium text-purple-900">Professional Features</h3>
          <p className="text-sm text-purple-700">Full surveying toolkit</p>
        </div>
      </div>

      {/* Help Sections */}
      <div className="space-y-4">
        {filteredSections.map((section) => (
          <div key={section.id} className="bg-white rounded-xl shadow-md border border-gray-200">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center">
                <span className="text-2xl mr-3">{section.icon}</span>
                <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
              </div>
              {expandedSections.includes(section.id) ? (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-400" />
              )}
            </button>

            {expandedSections.includes(section.id) && (
              <div className="px-6 pb-6">
                <div className="space-y-6">
                  {section.content.map((item, index) => (
                    <div key={index}>
                      <h4 className="font-medium text-gray-900 mb-3">{item.title}</h4>
                      <div className="space-y-2">
                        {item.steps.map((step, stepIndex) => (
                          <div key={stepIndex} className="flex items-start">
                            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium mr-3 mt-0.5">
                              {stepIndex + 1}
                            </div>
                            <p className="text-gray-700 text-sm leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredSections.length === 0 && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600">Try adjusting your search terms</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="font-medium text-blue-900 mb-2">Need More Help?</h3>
          <p className="text-blue-800 text-sm mb-4">
            This application follows Zimbabwe Land Survey (General) Regulations, 1979 (SI 727 of 1979).
            For specific regulatory questions, consult the official regulations document.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
              📋 Regulation Compliant
            </span>
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
              🎯 Professional Grade
            </span>
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
              🇿🇼 Zimbabwe Standards
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};