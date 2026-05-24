/**
 * DSG Certificate Pattern Database
 * 
 * Professional templates and patterns for DSG Certificate generation
 * Based on Zimbabwe cadastral standards and SI 727 requirements
 */

export interface DSGCertificatePattern {
  surveyOfTemplates: string[]
  certificationStatements: {
    statement1: string[]
    statement2: string[]
    statement3: string[]
    statement4: string[]
  }
  surveyorTitles: string[]
  additionalStatements?: string[]
}

/**
 * DSG Certificate patterns by survey type
 */
export const DSG_CERTIFICATE_PATTERNS: Record<string, DSGCertificatePattern> = {
  'subdivision': {
    surveyOfTemplates: [
      'STANDS {standNumbers}, {township} TOWNSHIP, {district} DISTRICT',
      'STANDS {standNumbers} AD VALOREM TOWNSHIP OF {township}, {district} DISTRICT',
      'SUBDIVISION OF STAND {standNumber}, {township} TOWNSHIP, {district} DISTRICT',
      'STANDS {standNumbers}, {township} MINE SURFACE RIGHTS A, {district} DISTRICT',
      'STANDS {standNumbers} MAGLAS TOWNSHIP OF {township}, {district} DISTRICT',
      'STAND {standNumber} {township} TOWNSHIP OF {description}, {district} DISTRICT'
    ],
    certificationStatements: {
      statement1: [
        'The consistency of data has been checked directly from the General Plan.',
        'The consistency of data has been checked directly from General Plans.',
        'the consistency of data has been checked directly from Diagrams and General Plan',
        'The consistency of data has been verified against the General Plan.',
        'Data consistency has been checked directly from the approved General Plan.'
      ],
      statement2: [
        'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
        'the coordinates of beacons on the diagram/s have been checked against the coordinate list and calculations of the fixes of the beacons',
        'Beacon coordinates on the diagrams have been verified against the coordinate list and beacon fix calculations.',
        'The coordinates of all beacons shown on the diagrams have been checked against the coordinate list and calculations.',
        'Beacon coordinates have been verified against the coordinate list and fix calculations.'
      ],
      statement3: [
        'All beacons shown on the diagrams have been placed and checked.',
        'all the beacons on the Diagrams and General Plan have been placed and checked',
        'the beacon descriptions on the Diagrams and General Plan have been checked against those recorded in the field book and those shown on the working plan',
        'All beacons depicted on the diagrams have been placed and verified in the field.',
        'All beacons shown on the diagrams have been placed, marked, and checked.',
        'All diagram beacons have been placed and field-checked.'
      ],
      statement4: [
        'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have satisfied myself of the correctness of the checks mentioned in sub paragraphs 1-4 above',
        'I have verified the correctness of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I am satisfied with the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have confirmed the accuracy of all checks mentioned in subparagraphs 1, 2 and 3 above.'
      ]
    },
    surveyorTitles: [
      'LAND SURVEYOR',
      'LAND SURVEYOR (Zim)',
      'REGISTERED LAND SURVEYOR',
      'PROFESSIONAL LAND SURVEYOR'
    ],
    additionalStatements: [
      'the beacon descriptions on the Diagrams and General Plan have been checked against those recorded in the field book and those shown on the working plan'
    ]
  },
  
  'mining-lease': {
    surveyOfTemplates: [
      '{name} MINING LEASE, {district} DISTRICT',
      'MINING LEASE {number}, {district} DISTRICT',
      '{name} MINING LEASE NO. {number}, {district} DISTRICT',
      'MINING LEASE - {name}, {district} DISTRICT'
    ],
    certificationStatements: {
      statement1: [
        'The consistency of data has been checked directly from the General Plan.',
        'Data consistency has been verified against the approved Mining Lease plan.',
        'The consistency of data has been checked against the Mining Affairs Board approved plan.',
        'Data consistency has been verified from the General Plan and mining records.'
      ],
      statement2: [
        'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
        'Beacon coordinates have been verified against the coordinate list and trigonometric calculations.',
        'The coordinates of all mining lease beacons have been checked against the coordinate list and calculations.',
        'Beacon coordinates have been verified against the coordinate list and GPS observations.'
      ],
      statement3: [
        'All beacons shown on the diagrams have been placed and checked.',
        'All mining lease beacons have been placed and verified in the field.',
        'All beacons depicted on the diagrams have been placed, marked with concrete, and checked.',
        'All diagram beacons have been placed and field-verified.'
      ],
      statement4: [
        'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have verified the correctness of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I am satisfied with the accuracy of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have confirmed the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.'
      ]
    },
    surveyorTitles: [
      'LAND SURVEYOR',
      'REGISTERED LAND SURVEYOR',
      'PROFESSIONAL LAND SURVEYOR',
      'MINING SURVEYOR'
    ]
  },
  
  'state-land': {
    surveyOfTemplates: [
      'STATE LAND {description}, {district} DISTRICT',
      '{description} STATE LAND, {district} DISTRICT',
      'STATE LAND PARCEL {number}, {district} DISTRICT',
      'GOVERNMENT LAND - {description}, {district} DISTRICT'
    ],
    certificationStatements: {
      statement1: [
        'The consistency of data has been checked directly from the General Plan.',
        'Data consistency has been verified against the State Land records.',
        'The consistency of data has been checked against the approved State Land plan.',
        'Data consistency has been verified from the General Plan and State records.'
      ],
      statement2: [
        'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
        'Beacon coordinates have been verified against the coordinate list and calculations.',
        'The coordinates of all beacons have been checked against the coordinate list and trigonometric calculations.',
        'Beacon coordinates have been verified against the coordinate list and GPS observations.'
      ],
      statement3: [
        'All beacons shown on the diagrams have been placed and checked.',
        'All State Land beacons have been placed and verified in the field.',
        'All beacons depicted on the diagrams have been placed and field-checked.',
        'All diagram beacons have been placed and verified.'
      ],
      statement4: [
        'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have verified the correctness of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I am satisfied with the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have confirmed the accuracy of all checks mentioned in subparagraphs 1, 2 and 3 above.'
      ]
    },
    surveyorTitles: [
      'LAND SURVEYOR',
      'REGISTERED LAND SURVEYOR',
      'PROFESSIONAL LAND SURVEYOR'
    ]
  },
  
  'municipal-land': {
    surveyOfTemplates: [
      'STANDS {standNumbers}, {township} TOWNSHIP, {municipality}',
      'STAND {standNumber} {township} TOWNSHIP OF {description}, {district} DISTRICT',
      'MUNICIPAL STANDS {standNumbers}, {township}, {district} DISTRICT',
      'STANDS {standNumbers}, {township} MUNICIPAL AREA, {municipality}',
      'SUBDIVISION OF MUNICIPAL LAND, {township}, {municipality}'
    ],
    certificationStatements: {
      statement1: [
        'The consistency of data has been checked directly from the General Plan.',
        'the consistency of data has been checked directly from Diagrams and General Plan',
        'Data consistency has been verified against the Municipal General Plan.',
        'The consistency of data has been checked against the approved municipal layout plan.',
        'Data consistency has been verified from the General Plan and municipal records.'
      ],
      statement2: [
        'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
        'the coordinates of beacons on the diagram/s have been checked against the coordinate list and calculations of the fixes of the beacons',
        'Beacon coordinates have been verified against the coordinate list and calculations.',
        'The coordinates of all municipal beacons have been checked against the coordinate list and calculations.',
        'Beacon coordinates have been verified against the coordinate list and municipal survey records.'
      ],
      statement3: [
        'All beacons shown on the diagrams have been placed and checked.',
        'the beacon descriptions on the Diagrams and General Plan have been checked against those recorded in the field book and those shown on the working plan',
        'all the beacons on the Diagrams and General Plan have been placed and checked',
        'All municipal beacons have been placed and verified in the field.',
        'All beacons depicted on the diagrams have been placed and field-checked.',
        'All diagram beacons have been placed and verified in accordance with municipal standards.'
      ],
      statement4: [
        'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have satisfied myself of the correctness of the checks mentioned in sub paragraphs 1-4 above',
        'I have verified the correctness of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I am satisfied with the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have confirmed the accuracy of all checks mentioned in subparagraphs 1, 2 and 3 above.'
      ]
    },
    surveyorTitles: [
      'LAND SURVEYOR',
      'LAND SURVEYOR (Zim)',
      'REGISTERED LAND SURVEYOR',
      'PROFESSIONAL LAND SURVEYOR',
      'MUNICIPAL SURVEYOR'
    ],
    additionalStatements: [
      'the beacon descriptions on the Diagrams and General Plan have been checked against those recorded in the field book and those shown on the working plan'
    ]
  },
  
  'private-land': {
    surveyOfTemplates: [
      '{description} PRIVATE LAND, {district} DISTRICT',
      'SUBDIVISION OF {description}, {district} DISTRICT',
      'PRIVATE LAND PARCEL - {description}, {district} DISTRICT',
      '{description}, {district} DISTRICT'
    ],
    certificationStatements: {
      statement1: [
        'The consistency of data has been checked directly from the General Plan.',
        'Data consistency has been verified against the title deed and General Plan.',
        'The consistency of data has been checked against the approved subdivision plan.',
        'Data consistency has been verified from the General Plan and title records.'
      ],
      statement2: [
        'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
        'Beacon coordinates have been verified against the coordinate list and calculations.',
        'The coordinates of all beacons have been checked against the coordinate list and trigonometric calculations.',
        'Beacon coordinates have been verified against the coordinate list and field observations.'
      ],
      statement3: [
        'All beacons shown on the diagrams have been placed and checked.',
        'All private land beacons have been placed and verified in the field.',
        'All beacons depicted on the diagrams have been placed and field-checked.',
        'All diagram beacons have been placed and verified.'
      ],
      statement4: [
        'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have verified the correctness of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I am satisfied with the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have confirmed the accuracy of all checks mentioned in subparagraphs 1, 2 and 3 above.'
      ]
    },
    surveyorTitles: [
      'LAND SURVEYOR',
      'REGISTERED LAND SURVEYOR',
      'PROFESSIONAL LAND SURVEYOR'
    ]
  },
  
  'servitude': {
    surveyOfTemplates: [
      'SERVITUDE OVER {description}, {district} DISTRICT',
      '{type} SERVITUDE, {description}, {district} DISTRICT',
      'SERVITUDE - {description}, {district} DISTRICT',
      '{type} SERVITUDE OVER STAND {standNumber}, {township}, {district} DISTRICT'
    ],
    certificationStatements: {
      statement1: [
        'The consistency of data has been checked directly from the General Plan.',
        'Data consistency has been verified against the servitude agreement and General Plan.',
        'The consistency of data has been checked against the approved servitude plan.',
        'Data consistency has been verified from the General Plan and servitude records.'
      ],
      statement2: [
        'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
        'Beacon coordinates have been verified against the coordinate list and calculations.',
        'The coordinates of all servitude beacons have been checked against the coordinate list and calculations.',
        'Beacon coordinates have been verified against the coordinate list and field measurements.'
      ],
      statement3: [
        'All beacons shown on the diagrams have been placed and checked.',
        'All servitude beacons have been placed and verified in the field.',
        'All beacons depicted on the diagrams have been placed and field-checked.',
        'All diagram beacons have been placed and verified along the servitude route.'
      ],
      statement4: [
        'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have verified the correctness of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I am satisfied with the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have confirmed the accuracy of all checks mentioned in subparagraphs 1, 2 and 3 above.'
      ]
    },
    surveyorTitles: [
      'LAND SURVEYOR',
      'REGISTERED LAND SURVEYOR',
      'PROFESSIONAL LAND SURVEYOR'
    ]
  },
  
  'replacement': {
    surveyOfTemplates: [
      'REPLACEMENT DIAGRAM FOR {description}, {district} DISTRICT',
      'REPLACEMENT OF DIAGRAM {number}, {description}, {district} DISTRICT',
      'REPLACEMENT SURVEY - {description}, {district} DISTRICT',
      'REPLACEMENT DIAGRAM - {description}, {district} DISTRICT'
    ],
    certificationStatements: {
      statement1: [
        'The consistency of data has been checked directly from the General Plan.',
        'Data consistency has been verified against the original diagram and General Plan.',
        'The consistency of data has been checked against the original survey records.',
        'Data consistency has been verified from the General Plan and original diagram.'
      ],
      statement2: [
        'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
        'Beacon coordinates have been verified against the coordinate list and original survey calculations.',
        'The coordinates of all beacons have been checked against the coordinate list and calculations.',
        'Beacon coordinates have been verified against the coordinate list and field observations.'
      ],
      statement3: [
        'All beacons shown on the diagrams have been placed and checked.',
        'All replacement beacons have been verified in the field.',
        'All beacons depicted on the diagrams have been field-checked and verified.',
        'All diagram beacons have been verified against original beacon positions.'
      ],
      statement4: [
        'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have verified the correctness of all checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I am satisfied with the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
        'I have confirmed the accuracy of all checks mentioned in subparagraphs 1, 2 and 3 above.'
      ]
    },
    surveyorTitles: [
      'LAND SURVEYOR',
      'REGISTERED LAND SURVEYOR',
      'PROFESSIONAL LAND SURVEYOR'
    ]
  }
}

/**
 * Common phrases for DSG certificates
 */
export const DSG_COMMON_PHRASES = {
  introductions: [
    'I, {surveyorName}, Land Surveyor, do hereby certify that:-',
    'I, {surveyorName}, Registered Land Surveyor, do hereby certify that:-',
    'I, {surveyorName}, Professional Land Surveyor, do hereby certify that:-',
    'I, {surveyorName}, Land Surveyor (License No. {licenseNumber}), do hereby certify that:-'
  ],
  
  closings: [
    '{surveyorName}\nLAND SURVEYOR',
    '{surveyorName}\nREGISTERED LAND SURVEYOR',
    '{surveyorName}\nPROFESSIONAL LAND SURVEYOR',
    '{surveyorName}\nLAND SURVEYOR\nLicense No. {licenseNumber}'
  ],
  
  additionalNotes: [
    'All measurements comply with SI 727 of 1979.',
    'Survey conducted in accordance with SI 727 of 1979.',
    'All beacons marked with concrete and iron pegs.',
    'Survey based on Cape Datum Lo {meridian}º coordinate system.',
    'All coordinates referenced to Cape Datum Lo {meridian}º.',
    'GPS observations processed using {equipment}.',
    'Survey tied to trigonometric beacons {trigList}.'
  ]
}

/**
 * Default DSG certificate structure
 */
export const DEFAULT_DSG_CERTIFICATE = {
  surveyOf: '',
  surveyorName: '',
  licenseNumber: '',
  statement1: DSG_CERTIFICATE_PATTERNS['subdivision'].certificationStatements.statement1[0],
  statement2: DSG_CERTIFICATE_PATTERNS['subdivision'].certificationStatements.statement2[0],
  statement3: DSG_CERTIFICATE_PATTERNS['subdivision'].certificationStatements.statement3[0],
  statement4: DSG_CERTIFICATE_PATTERNS['subdivision'].certificationStatements.statement4[0],
  surveyorTitle: 'LAND SURVEYOR',
  additionalNotes: '',
  date: new Date().toISOString().split('T')[0]
}
