import React, { useState, useEffect } from 'react';
import { FileText, Download, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { surveyingApi } from '../../lib/supabase';
import { SurveyProject } from '../../types/surveying';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Interface for field book data
interface FieldObservation {
  point: string;
  y: number;
  x: number;
  hrms: number;
  vrms: number;
  sats: number;
  pdop: number;
  fp: string;
  date: string;
  description: string;
}

interface FieldBookData {
  observations: FieldObservation[];
  foundBeacons: FieldObservation[];
  placedBeacons: FieldObservation[];
}

export const DigitalLodgment: React.FC = () => {
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [fieldBookData, setFieldBookData] = useState<FieldBookData | null>(null);
  const [parseError, setParseError] = useState<string>('');

  // Field Book Configuration
  const [fieldBookConfig, setFieldBookConfig] = useState({
    title: '',
    surveyor: '',
    dateRange: '',
    instrument: '',
    weather: '',
    project: ''
  });

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      const project = projects.find(p => p.id === selectedProject);
      if (project) {
        setFieldBookConfig(prev => ({
          ...prev,
          title: `Electronic Field Book - ${project.project_name}`,
          project: `${project.project_name} - ${project.district}`
        }));
      }
    }
  }, [selectedProject, projects]);

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      parseCSVFile(file);
    } else {
      setParseError('Please select a valid CSV file');
    }
  };

  const parseCSVFile = async (file: File) => {
    try {
      setParseError('');
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      const observations: FieldObservation[] = [];
      
      for (let i = 1; i < lines.length; i++) { // Skip header row
        const line = lines[i];
        if (!line) continue;
        
        // Try both tab and comma separation
        let columns = line.split('\t').map(col => col.trim());
        if (columns.length < 10) {
          columns = line.split(',').map(col => col.trim());
        }
        // Also try multiple spaces as separator
        if (columns.length < 10) {
          columns = line.split(/\s+/).filter(col => col.length > 0);
        }
        
        if (columns.length >= 10) {
          const [point, yStr, xStr, hrmsStr, vrmsStr, satsStr, pdopStr, fp, date, ...descriptionParts] = columns;
          const description = descriptionParts.join(' ');
          
          if (point && yStr && xStr && !isNaN(parseFloat(yStr)) && !isNaN(parseFloat(xStr))) {
            observations.push({
              point,
              y: parseFloat(yStr),
              x: parseFloat(xStr),
              hrms: parseFloat(hrmsStr) || 0,
              vrms: parseFloat(vrmsStr) || 0,
              sats: parseInt(satsStr) || 0,
              pdop: parseFloat(pdopStr) || 0,
              fp: fp || '',
              date: date || '',
              description: description || ''
            });
          }
        } else {
          console.log(`Skipping line ${i}: insufficient columns (${columns.length})`, columns);
        }
      }
      
      console.log(`Parsed ${observations.length} observations from ${lines.length - 1} data lines`);
      
      // Separate found and placed beacons
      const foundBeacons = observations.filter(obs => obs.fp.includes('F'));
      const placedBeacons = observations.filter(obs => obs.fp.includes('P'));
      
      setFieldBookData({
        observations,
        foundBeacons,
        placedBeacons
      });
      
    } catch (error) {
      setParseError(`Error parsing CSV file: ${error instanceof Error ? error.message : 'Please check the format.'}`);
      console.error('CSV parsing error:', error);
    }
  };

  const generateFieldBookPDF = async () => {
    if (!fieldBookData || !fieldBookConfig.title) {
      alert('Please upload a CSV file and configure the field book details');
      return;
    }

    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 20;

    // Helper function to add new page if needed
    const checkPageBreak = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - 20) {
        pdf.addPage();
        yPosition = 20;
      }
    };

    // Title Page with Surveyor Details
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ELECTRONIC FIELD BOOK', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Project: ${fieldBookConfig.project}`, 20, yPosition);
    yPosition += 8;
    
    // Surveyor Details Section
    pdf.setFont('helvetica', 'bold');
    pdf.text('SURVEYOR DETAILS:', 20, yPosition);
    yPosition += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Name: ${fieldBookConfig.surveyor}`, 25, yPosition);
    yPosition += 8;
    pdf.text(`Registration: [Registration Number]`, 25, yPosition);
    yPosition += 8;
    pdf.text(`Signature: ________________________`, 25, yPosition);
    yPosition += 8;
    
    // Survey Details Section
    pdf.setFont('helvetica', 'bold');
    pdf.text('SURVEY DETAILS:', 20, yPosition);
    yPosition += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date Range: ${fieldBookConfig.dateRange}`, 25, yPosition);
    yPosition += 8;
    pdf.text(`Instrument: ${fieldBookConfig.instrument}`, 25, yPosition);
    yPosition += 8;
    pdf.text(`Weather: ${fieldBookConfig.weather}`, 25, yPosition);
    yPosition += 20;

    // Methodology Section
    pdf.setFont('helvetica', 'bold');
    pdf.text('METHODOLOGY:', 20, yPosition);
    yPosition += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.text('GPS observations recorded during field survey operations.', 25, yPosition);
    yPosition += 6;
    pdf.text('All observations taken with dual-frequency GPS receiver.', 25, yPosition);
    yPosition += 6;
    pdf.text('Static observations with minimum 15-minute occupation time.', 25, yPosition);
    yPosition += 20;

    // Field Notes Pages (E1, E2, E3...) with 20 entries each
    if (fieldBookData.observations.length > 0) {
      const entriesPerPage = 20;
      const totalPages = Math.ceil(fieldBookData.observations.length / entriesPerPage);
      
      for (let pageNum = 0; pageNum < totalPages; pageNum++) {
        // Start new page for field notes
        pdf.addPage();
        yPosition = 20;
        
        // Page header
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`FIELD NOTES - Page E${pageNum + 1}`, 20, yPosition);
        yPosition += 15;
        
        // Get observations for this page
        const startIndex = pageNum * entriesPerPage;
        const endIndex = Math.min(startIndex + entriesPerPage, fieldBookData.observations.length);
        const pageObservations = fieldBookData.observations.slice(startIndex, endIndex);
        
        // Create table data for this page
        const observationData = [
          ['Point', 'Y (metres)', 'X (metres)', 'HRMS', 'VRMS', 'Sats#', 'PDOP', 'F/P', 'Date', 'Description'],
          ...pageObservations.map(obs => [
            obs.point,
            obs.y.toFixed(3),
            obs.x.toFixed(3),
            obs.hrms.toFixed(3),
            obs.vrms.toFixed(3),
            obs.sats.toString(),
            obs.pdop.toFixed(1),
            obs.fp,
            obs.date,
            obs.description
          ])
        ];

        autoTable(pdf, {
          startY: yPosition,
          head: [observationData[0]],
          body: observationData.slice(1),
          theme: 'grid',
          styles: { 
            fontSize: 7, 
            cellPadding: { top: 4, right: 2, bottom: 4, left: 2 },
            valign: 'middle',
            halign: 'center',
            lineWidth: 0.1,
            lineColor: [0, 0, 0]
          },
          headStyles: { 
            fillColor: [240, 240, 240], 
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            valign: 'middle',
            halign: 'center',
            minCellHeight: 8
          },
          bodyStyles: {
            valign: 'middle',
            halign: 'center',
            minCellHeight: 6
          },
          columnStyles: {
            0: { cellWidth: 15, halign: 'center' }, // Point
            1: { cellWidth: 20, halign: 'center' }, // Y
            2: { cellWidth: 20, halign: 'center' }, // X
            3: { cellWidth: 12, halign: 'center' }, // HRMS
            4: { cellWidth: 12, halign: 'center' }, // VRMS
            5: { cellWidth: 10, halign: 'center' }, // Sats
            6: { cellWidth: 10, halign: 'center' }, // PDOP
            7: { cellWidth: 8, halign: 'center' },  // F/P
            8: { cellWidth: 18, halign: 'center' }, // Date
            9: { cellWidth: 60, halign: 'left' }    // Description
          }
        });
        
        // Add page footer with entry count
        const footerY = pageHeight - 15;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Entries ${startIndex + 1} to ${endIndex} of ${fieldBookData.observations.length}`, 20, footerY);
        pdf.text(`Page E${pageNum + 1} of E${totalPages}`, pageWidth - 40, footerY);
      }
    }

    // Quality Control Summary on separate page
    if (fieldBookData.observations.length > 0) {
      pdf.addPage();
      yPosition = 20;
      
      const avgHRMS = fieldBookData.observations.reduce((sum, obs) => sum + obs.hrms, 0) / fieldBookData.observations.length;
      const avgVRMS = fieldBookData.observations.reduce((sum, obs) => sum + obs.vrms, 0) / fieldBookData.observations.length;
      const avgSats = fieldBookData.observations.reduce((sum, obs) => sum + obs.sats, 0) / fieldBookData.observations.length;
      const avgPDOP = fieldBookData.observations.reduce((sum, obs) => sum + obs.pdop, 0) / fieldBookData.observations.length;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('QUALITY CONTROL SUMMARY', 20, yPosition);
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Average HRMS: ${avgHRMS.toFixed(3)}m`, 20, yPosition);
      yPosition += 6;
      pdf.text(`Average VRMS: ${avgVRMS.toFixed(3)}m`, 20, yPosition);
      yPosition += 6;
      pdf.text(`Average Satellites: ${avgSats.toFixed(0)}`, 20, yPosition);
      yPosition += 6;
      pdf.text(`Average PDOP: ${avgPDOP.toFixed(1)}`, 20, yPosition);
      yPosition += 6;
      pdf.text(`Total Observations: ${fieldBookData.observations.length}`, 20, yPosition);
      yPosition += 6;
      pdf.text(`Total Field Notes Pages: E1 to E${Math.ceil(fieldBookData.observations.length / 20)}`, 20, yPosition);
    }

    // Save Field Book PDF
    const selectedProjectName = projects.find(p => p.id === selectedProject)?.project_name || 'Electronic Field Book';
    const sanitizedName = selectedProjectName.replace(/[^a-zA-Z0-9\s-]/g, '');
    pdf.save(`${sanitizedName} - Field Book.pdf`);
  };

  const generateComputationsPDF = async () => {
    if (!fieldBookData || !fieldBookConfig.title) {
      alert('Please upload a CSV file and configure the field book details');
      return;
    }

    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 20;

    // Helper function to add new page if needed
    const checkPageBreak = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - 20) {
        pdf.addPage();
        yPosition = 20;
      }
    };

    // Helper function to get field book page reference for a beacon
    const getFieldBookReference = (beaconPoint: string): string => {
      const beaconIndex = fieldBookData.observations.findIndex(obs => obs.point === beaconPoint);
      if (beaconIndex === -1) return 'E1'; // Default if not found
      
      const entriesPerPage = 20;
      const pageNumber = Math.floor(beaconIndex / entriesPerPage) + 1;
      return `E${pageNumber}`;
    };
    // Title Page
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SURVEY COMPUTATIONS', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Project: ${fieldBookConfig.project}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Surveyor: ${fieldBookConfig.surveyor}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Date Range: ${fieldBookConfig.dateRange}`, 20, yPosition);
    yPosition += 25;


    // Found Beacons
    if (fieldBookData.foundBeacons.length > 0) {
      checkPageBreak(60);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('FOUND BEACONS FIXED BY GPS', 20, yPosition);
      yPosition += 10;

      const foundBeaconsData = [
        ['Point', 'Y (metres)', 'X (metres)', 'F/B'],
        ...fieldBookData.foundBeacons.map((beacon, index) => [
          beacon.point,
          beacon.y.toFixed(3),
          beacon.x.toFixed(3),
          getFieldBookReference(beacon.point)
        ])
      ];

      autoTable(pdf, {
        startY: yPosition,
        head: [foundBeaconsData[0]],
        body: foundBeaconsData.slice(1),
        theme: 'grid',
        styles: { 
          fontSize: 9, 
          cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
          valign: 'middle',
          halign: 'center',
          lineWidth: 0.1,
          lineColor: [0, 0, 0]
        },
        headStyles: { 
          fillColor: [240, 240, 240], 
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          valign: 'middle',
          halign: 'center',
          minCellHeight: 8
        },
        bodyStyles: {
          valign: 'middle',
          halign: 'center',
          minCellHeight: 6
        },
        columnStyles: {
          0: { cellWidth: 30, halign: 'center' },
          1: { cellWidth: 40, halign: 'center' },
          2: { cellWidth: 40, halign: 'center' },
          3: { cellWidth: 25, halign: 'center' }
        }
      });

      yPosition = (pdf as any).lastAutoTable ? (pdf as any).lastAutoTable.finalY + 15 : yPosition + 50;
    }

    // Placed Beacons
    if (fieldBookData.placedBeacons.length > 0) {
      checkPageBreak(50);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INTERNAL BEACONS PLACED BY GPS', 20, yPosition);
      yPosition += 10;

      const placedBeaconsData = [
        ['Point', 'Y (metres)', 'X (metres)', 'F/B'],
        ...fieldBookData.placedBeacons.map((beacon, index) => [
          beacon.point,
          beacon.y.toFixed(3),
          beacon.x.toFixed(3),
          getFieldBookReference(beacon.point)
        ])
      ];

      autoTable(pdf, {
        startY: yPosition,
        head: [placedBeaconsData[0]],
        body: placedBeaconsData.slice(1),
        theme: 'grid',
        styles: { 
          fontSize: 9, 
          cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
          valign: 'middle',
          halign: 'center',
          lineWidth: 0.1,
          lineColor: [0, 0, 0]
        },
        headStyles: { 
          fillColor: [240, 240, 240], 
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          valign: 'middle',
          halign: 'center',
          minCellHeight: 8
        },
        bodyStyles: {
          valign: 'middle',
          halign: 'center',
          minCellHeight: 6
        },
        columnStyles: {
          0: { cellWidth: 30, halign: 'center' },
          1: { cellWidth: 40, halign: 'center' },
          2: { cellWidth: 40, halign: 'center' },
          3: { cellWidth: 25, halign: 'center' }
        }
      });

      yPosition = (pdf as any).lastAutoTable ? (pdf as any).lastAutoTable.finalY + 15 : yPosition + 50;
    }


    // Save PDF
    const selectedProjectName = projects.find(p => p.id === selectedProject)?.project_name || 'Electronic Field Book';
    const sanitizedName = selectedProjectName.replace(/[^a-zA-Z0-9\s-]/g, '');
    pdf.save(`${sanitizedName} - Computations.pdf`);
  };

  const generateCoordinateListPDF = async () => {
    if (!fieldBookData || !fieldBookConfig.title) {
      alert('Please upload a CSV file and configure the field book details');
      return;
    }

    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let currentPage = 100; // Start page numbering at 100
    let yPosition = 20;

    // Helper function to get field book page reference for a beacon
    const getFieldBookReference = (beaconPoint: string): string => {
      const beaconIndex = fieldBookData.observations.findIndex(obs => obs.point === beaconPoint);
      if (beaconIndex === -1) return 'E1';
      
      const entriesPerPage = 20;
      const pageNumber = Math.floor(beaconIndex / entriesPerPage) + 1;
      return `E${pageNumber}`;
    };

    // Helper function to add page header and footer
    const addPageHeaderFooter = (pageNum: number) => {
      // Page footer with page number
      const footerY = pageHeight - 10;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Page ${pageNum}`, pageWidth / 2, footerY, { align: 'center' });
    };

    // Helper function to start new page with header
    const startNewPage = () => {
      pdf.addPage();
      currentPage++;
      yPosition = 20;
      
      // Add page header
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text('S.R. No.', 20, yPosition);
      yPosition += 8;
      
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('LIST OF CO-ORDINATES', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 12;

      // Survey title
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`SURVEY OF: ${fieldBookConfig.project.toUpperCase()}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;
      
      addPageHeaderFooter(currentPage);
    };
    // Helper function to generate beacon description
    const getBeaconDescription = (beacon: FieldObservation): string => {
      if (beacon.description && beacon.description.trim()) {
        return beacon.description;
      }
      // Default description based on beacon type
      if (beacon.fp.includes('F')) {
        return '12mm iron peg and 35mm iron pipe in masonry cairn';
      } else {
        return '12mm iron peg and cairn';
      }
    };

    // First page header
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text('S.R. No.', 20, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('LIST OF CO-ORDINATES', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 12;

    // Survey title
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`SURVEY OF: ${fieldBookConfig.project.toUpperCase()}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Add first page footer
    addPageHeaderFooter(currentPage);

    // Collect all coordinate entries
    const allEntries = [];
    
    // Add trigonometric beacons
    const trigBeacons = [
      { name: '419/S', y: 33332.88, x: 60173.45, desc: 'KAPIRO' },
      { name: '521/V', y: 31440.52, x: 68989.97, desc: 'O.C.P' },
      { name: '525/V', y: 24189.2, x: 67326.6, desc: 'O.C.P' }
    ];

    trigBeacons.forEach(beacon => {
      allEntries.push([
        '', // Calc Pg
        'E1', // F/B
        beacon.name, // Const
        beacon.y.toFixed(2), // Y coordinate
        beacon.x.toFixed(2), // X coordinate
        beacon.desc, // Beacon Description
        '', // F/P
        'E1' // Field Notes Reference
      ]);
    });

    // Add working station
    allEntries.push([
      '', // Calc Pg
      'E1', // F/B
      'T1', // Const
      '26662.1', // Y coordinate
      '65471.85', // X coordinate
      '12mm iron peg', // Beacon Description
      '', // F/P
      'E1' // Field Notes Reference
    ]);

    // Add found beacons
    if (fieldBookData.foundBeacons.length > 0) {
      fieldBookData.foundBeacons.forEach(beacon => {
        allEntries.push([
          '102', // Calc Pg
          getFieldBookReference(beacon.point), // F/B
          beacon.point, // Const
          beacon.y.toFixed(2), // Y coordinate
          beacon.x.toFixed(2), // X coordinate
          getBeaconDescription(beacon), // Beacon Description
          'F', // F/P
          getFieldBookReference(beacon.point) // Field Notes Reference
        ]);
      });
    }

    // Add placed beacons
    if (fieldBookData.placedBeacons.length > 0) {
      fieldBookData.placedBeacons.forEach((beacon, index) => {
        const calcPage = index < 20 ? '104' : '105';
        allEntries.push([
          calcPage, // Calc Pg
          getFieldBookReference(beacon.point), // F/B
          beacon.point, // Const
          beacon.y.toFixed(2), // Y coordinate
          beacon.x.toFixed(2), // X coordinate
          getBeaconDescription(beacon), // Beacon Description
          'P', // F/P
          getFieldBookReference(beacon.point) // Field Notes Reference
        ]);
      });
    }

    // Split entries into pages of 20
    const entriesPerPage = 20;
    const totalPages = Math.ceil(allEntries.length / entriesPerPage);
    
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) {
        startNewPage();
      }
      
      // Get entries for this page
      const startIndex = pageIndex * entriesPerPage;
      const endIndex = Math.min(startIndex + entriesPerPage, allEntries.length);
      const pageEntries = allEntries.slice(startIndex, endIndex);
      
      // Create table data for this page
      const coordinateData = [];
      
      // Main header row
      coordinateData.push([
        { content: 'Calc', styles: { cellWidth: 12, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: 'F/B', styles: { cellWidth: 10, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: 'Lo. 31 COORDINATES', styles: { cellWidth: 62, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], colSpan: 3 } },
        { content: 'Lo. 31 COORDINATES', styles: { cellWidth: 44, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], colSpan: 2 } },
        { content: '', styles: { cellWidth: 0 } },
        { content: 'Beacon Description', styles: { cellWidth: 85, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: 'F/P', styles: { cellWidth: 10, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: 'F/B', styles: { cellWidth: 11, halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } }
      ]);

      // Sub-header row
      coordinateData.push([
        { content: 'Pg.', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: 'Y (metres)', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] } },
        { content: 'X (metres)', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } },
        { content: '', styles: { fillColor: [240, 240, 240] } }
      ]);

      // Constants rows (only on first page)
      if (pageIndex === 0) {
        coordinateData.push([
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: '+/- 0.00', styles: { halign: 'center' } },
          { content: '1800000', styles: { halign: 'center' } },
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: '', styles: {} }
        ]);

        coordinateData.push([
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: '+/- 0.00', styles: { halign: 'center' } },
          { content: '1800000', styles: { halign: 'center' } },
          { content: '', styles: {} },
          { content: '', styles: {} },
          { content: '', styles: {} }
        ]);
      }

      // Add section headers and entries for this page
      let currentSection = '';
      
      pageEntries.forEach((entry, index) => {
        const globalIndex = startIndex + index;
        
        // Determine section based on global index
        let sectionTitle = '';
        if (globalIndex < trigBeacons.length) {
          sectionTitle = 'TRIG BEACONS / T.S.MS';
        } else if (globalIndex < trigBeacons.length + 1) {
          sectionTitle = 'WORKING STATIONS';
        } else if (globalIndex < trigBeacons.length + 1 + (fieldBookData.foundBeacons?.length || 0)) {
          sectionTitle = 'BEACONS FOUND';
        } else {
          sectionTitle = 'BEACONS PLACED';
        }
        
        // Add section header if it's a new section
        if (sectionTitle !== currentSection) {
          currentSection = sectionTitle;
          coordinateData.push([
            { content: '', styles: {} },
            { content: '', styles: {} },
            { content: sectionTitle, styles: { fontStyle: 'bold', colSpan: 6, fillColor: [250, 250, 250] } },
            { content: '', styles: {} },
            { content: '', styles: {} },
            { content: '', styles: {} },
            { content: '', styles: {} },
            { content: '', styles: {} }
          ]);
        }
        
        // Add the entry
        coordinateData.push([
          { content: entry[0], styles: { halign: 'center' } },
          { content: entry[1], styles: { halign: 'center' } },
          { content: entry[2], styles: {} },
          { content: entry[3], styles: { halign: 'center' } },
          { content: entry[4], styles: { halign: 'center' } },
          { content: entry[5], styles: {} },
          { content: entry[6], styles: { halign: 'center' } },
          { content: entry[7], styles: { halign: 'center' } }
        ]);
      });

      // Generate the table for this page
      autoTable(pdf, {
        startY: yPosition,
        body: coordinateData,
        theme: 'grid',
        styles: { 
          fontSize: 7, 
          cellPadding: { top: 1, right: 1, bottom: 1, left: 1 },
          valign: 'middle',
          lineWidth: 0.5,
          lineColor: [0, 0, 0]
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' }, // Calc Pg
          1: { cellWidth: 10, halign: 'center' }, // F/B
          2: { cellWidth: 18, halign: 'left' },   // Const/Beacon name
          3: { cellWidth: 22, halign: 'center' }, // Y coordinate
          4: { cellWidth: 22, halign: 'center' }, // X coordinate
          5: { cellWidth: 85, halign: 'left' },   // Beacon Description
          6: { cellWidth: 10, halign: 'center' }, // F/P
          7: { cellWidth: 11, halign: 'center' }  // F/B
        },
        margin: { left: 10, right: 10 },
        tableWidth: 'auto',
        didParseCell: function(data) {
          // Make section headers bold
          if (data.cell.text && typeof data.cell.text[0] === 'string') {
            const text = data.cell.text[0];
            if (text.includes('TRIG BEACONS') || text.includes('WORKING STATIONS') || 
                text.includes('BEACONS FOUND') || text.includes('BEACONS PLACED')) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [250, 250, 250];
            }
          }
        }
      });
    }

    // Save the PDF
    const selectedProjectName = projects.find(p => p.id === selectedProject)?.project_name || 'Coordinate List';
    const sanitizedName = selectedProjectName.replace(/[^a-zA-Z0-9\s-]/g, '');
    pdf.save(`${sanitizedName} - Coordinate List.pdf`);
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
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Digital Lodgment</h2>
        <p className="text-gray-600">Upload GPS field observations and generate professional electronic field books</p>
      </div>

      {/* Project Selection */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Selection</h3>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.project_name} - {project.district}
            </option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <>
          {/* Field Book Configuration */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Field Book Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Surveyor</label>
                <input
                  type="text"
                  value={fieldBookConfig.surveyor}
                  onChange={(e) => setFieldBookConfig({...fieldBookConfig, surveyor: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Surveyor Name (Registration)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                <input
                  type="text"
                  value={fieldBookConfig.dateRange}
                  onChange={(e) => setFieldBookConfig({...fieldBookConfig, dateRange: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="2024-01-01 to 2024-01-31"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GPS Instrument</label>
                <input
                  type="text"
                  value={fieldBookConfig.instrument}
                  onChange={(e) => setFieldBookConfig({...fieldBookConfig, instrument: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="GPS Receiver Model"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weather Conditions</label>
                <input
                  type="text"
                  value={fieldBookConfig.weather}
                  onChange={(e) => setFieldBookConfig({...fieldBookConfig, weather: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Clear, light breeze"
                />
              </div>
            </div>
          </div>

          {/* CSV File Upload */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload GPS Field Observations</h3>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <div className="text-center">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="mb-4">
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    <span className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors inline-block">
                      Choose CSV File
                    </span>
                    <input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-sm text-gray-600">
                  Upload CSV file with GPS observations in the format:<br />
                  POINT, Y, X, HRMS, VRMS, Sats#, PDOP, F/P, Date, DESCRIPTION
                </p>
                {csvFile && (
                  <p className="text-sm text-green-600 mt-2">
                    <CheckCircle className="h-4 w-4 inline mr-1" />
                    File uploaded: {csvFile.name}
                  </p>
                )}
                {parseError && (
                  <p className="text-sm text-red-600 mt-2">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    {parseError}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Data Preview */}
          {fieldBookData && (
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">GPS Observations Preview</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{fieldBookData.observations.length}</div>
                  <div className="text-sm text-blue-800">Total Observations</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{fieldBookData.foundBeacons.length}</div>
                  <div className="text-sm text-green-800">Found Beacons</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{fieldBookData.placedBeacons.length}</div>
                  <div className="text-sm text-purple-800">Placed Beacons</div>
                </div>
              </div>

              {fieldBookData.observations.length > 0 && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h4 className="font-medium text-yellow-900 mb-2">Quality Control Summary</h4>
                  {(() => {
                    const avgHRMS = fieldBookData.observations.reduce((sum, obs) => sum + obs.hrms, 0) / fieldBookData.observations.length;
                    const avgVRMS = fieldBookData.observations.reduce((sum, obs) => sum + obs.vrms, 0) / fieldBookData.observations.length;
                    const maxHRMS = Math.max(...fieldBookData.observations.map(obs => obs.hrms));
                    const maxVRMS = Math.max(...fieldBookData.observations.map(obs => obs.vrms));
                    
                    return (
                      <div className="text-sm text-yellow-800 grid grid-cols-2 gap-4">
                        <div>
                          <p>Average HRMS: {avgHRMS.toFixed(3)}m</p>
                          <p>Maximum HRMS: {maxHRMS.toFixed(3)}m</p>
                        </div>
                        <div>
                          <p>Average VRMS: {avgVRMS.toFixed(3)}m</p>
                          <p>Maximum VRMS: {maxVRMS.toFixed(3)}m</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Generate PDF */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Generate Professional Documents</h3>
                <p className="text-gray-600">Create separate PDF documents for field book and computations</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={generateFieldBookPDF}
                disabled={!fieldBookData || !fieldBookConfig.surveyor}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center disabled:bg-gray-400"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Field Book
              </button>
              
              <button
                onClick={generateComputationsPDF}
                disabled={!fieldBookData || !fieldBookConfig.surveyor}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center disabled:bg-gray-400"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Computations
              </button>
              
              <button
                onClick={generateCoordinateListPDF}
                disabled={!fieldBookData || !fieldBookConfig.surveyor}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center disabled:bg-gray-400"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Coordinate List
              </button>
            </div>
            
            {(!fieldBookData || !fieldBookConfig.surveyor) && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  Please upload a CSV file and complete the field book configuration to generate PDFs
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};