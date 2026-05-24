/**
 * Report on Survey Pattern Database
 * Contains templates and patterns learned from real Zimbabwe cadastral survey reports
 */

export interface SurveyTypePattern {
  purposeTemplates: string[]
  surveyBasisTemplates: string[]
  foundBeaconsTemplates: string[]
  placedBeaconsTemplates: string[]
  commentTemplates: string[]
}

export interface ReportPatterns {
  [surveyType: string]: SurveyTypePattern
}

/**
 * Pattern database derived from real survey reports
 */
export const REPORT_PATTERNS: ReportPatterns = {
  'mining-lease': {
    purposeTemplates: [
      'Survey of {name} vide Mining Affairs Board Letter dated {date}',
      'Survey of Mining Lease {number} vide {authority} approval dated {date}',
      'To establish Mining Lease {name} vide permit {reference} dated {date}'
    ],
    surveyBasisTemplates: [
      'Trig system, Lo {degrees}º through the use of Trigs {trigList}',
      'Trig Lo {degrees}º by adopting station {station} from {source}',
      'Trig system through the use of Trigs {trigList}. Office Calibration was done covering the area under survey, see calcs page {page}',
      'The survey was done using a {equipment} GPS, GPS base was set at a placed Station {station} and measurements were made to Trigs {checkPoints} as checks'
    ],
    foundBeaconsTemplates: [
      'NIL',
      'No beacons were found',
      'Beacon {id} was found in {condition} condition and adopted',
      'Beacons {list} were found and measured'
    ],
    placedBeaconsTemplates: [
      'Build Steel angle iron in concrete circular Masonry were measured and adopted as the mining Lease beacons',
      'Concrete beacons were placed at all corners of the mining lease area and measured',
      'Steel pegs in concrete were placed at all corners and adopted as the mining lease beacons',
      'All beacons were placed as per the approved mining lease plan'
    ],
    commentTemplates: [
      'Survey was straightforward',
      'None',
      'No unusual occurrences',
      'Survey completed without issues'
    ]
  },
  
  'subdivision': {
    purposeTemplates: [
      'To subdivide Private land vide permit number {permit} dated {date} and the attached subdivision plan',
      'Subdivision of {description} vide {authority} approval {reference} dated {date}',
      'To subdivide {landType} into {number} stands vide permit {reference}',
      'To subdivide Private land vide permit number {permit} dated {date}'
    ],
    surveyBasisTemplates: [
      'Trig Lo {degrees}º by adopting station {station} from {source} and Calibration Parameters from {source}',
      'Adopted station {station} was used as a base station in a RTK GPS survey',
      'Based on previous survey {srNumber} and control points {list}',
      'Trig system through the use of Town Survey Marks {list}'
    ],
    foundBeaconsTemplates: [
      'Existing beacons from previous survey were found and adopted',
      'Beacons {list} from {srNumber} were found in good condition',
      'NIL',
      'No original beacons were found'
    ],
    placedBeaconsTemplates: [
      'All beacons were placed according to existing developments. The existing developments were found to correspond with the proposed layout plan',
      'Steel pegs were placed at all stand corners as per the approved layout plan',
      'Concrete beacons were placed at all corners according to the subdivision plan',
      'All beacons were placed according to existing developments'
    ],
    commentTemplates: [
      'None',
      'Survey was straightforward',
      'Existing developments correspond with the proposed layout',
      'Minor adjustments made to accommodate existing features'
    ]
  },
  
  'state-land': {
    purposeTemplates: [
      'Survey of State Land vide {authority} approval {reference} dated {date}',
      'To demarcate State Land parcel {number} vide {authority} letter dated {date}',
      'Survey of State Land for {purpose} vide approval {reference}'
    ],
    surveyBasisTemplates: [
      'Trig system, Lo {degrees}º through the use of Trigs {trigList}',
      'Based on official control points {list} and trig system Lo {degrees}º',
      'Trig Lo {degrees}º by adopting official control points {list}'
    ],
    foundBeaconsTemplates: [
      'NIL',
      'No beacons were found',
      'Original beacons from {srNumber} were found and adopted'
    ],
    placedBeaconsTemplates: [
      'Concrete beacons were placed at all corners and measured',
      'Steel angle iron in concrete were placed at all corners',
      'All beacons were placed as per the approved plan'
    ],
    commentTemplates: [
      'Survey was straightforward',
      'None',
      'No unusual occurrences'
    ]
  },
  
  'municipal-land': {
    purposeTemplates: [
      'Survey of Municipal Land vide {council} approval {reference} dated {date}',
      'To establish Municipal stand {number} vide {council} resolution dated {date}',
      'Survey of Municipal Land for {purpose} vide approval {reference}'
    ],
    surveyBasisTemplates: [
      'Town Survey Marks {list} and trig system Lo {degrees}º',
      'Based on {council} control network and Town Survey Marks {list}',
      'Trig Lo {degrees}º by adopting Town Survey Marks {list}'
    ],
    foundBeaconsTemplates: [
      'Town Survey Marks {list} were found and adopted',
      'Existing municipal beacons were found in good condition',
      'NIL'
    ],
    placedBeaconsTemplates: [
      'Concrete beacons were placed at all corners as per municipal standards',
      'Steel pegs were placed at all corners and measured',
      'All beacons were placed according to the approved municipal plan'
    ],
    commentTemplates: [
      'Survey was straightforward',
      'None',
      'Coordinated with municipal surveyor'
    ]
  },
  
  'private-land': {
    purposeTemplates: [
      'Survey of Private land vide owner\'s request and permit {reference} dated {date}',
      'To establish Private land parcel {description} vide approval {reference}',
      'Survey of Private land for {purpose} vide permit {reference}'
    ],
    surveyBasisTemplates: [
      'Trig system, Lo {degrees}º through the use of Trigs {trigList}',
      'Based on previous survey {srNumber} and control points {list}',
      'Trig Lo {degrees}º by adopting station {station}'
    ],
    foundBeaconsTemplates: [
      'Original beacons from {srNumber} were found and adopted',
      'Beacons {list} were found in {condition} condition',
      'NIL'
    ],
    placedBeaconsTemplates: [
      'Concrete beacons were placed at all corners',
      'Steel pegs in concrete were placed at corners and measured',
      'All beacons were placed as per the approved plan'
    ],
    commentTemplates: [
      'Survey was straightforward',
      'None',
      'Owner was present during survey'
    ]
  },
  
  'servitude': {
    purposeTemplates: [
      'Survey of servitude vide agreement dated {date} between {parties}',
      'To establish servitude for {purpose} vide agreement {reference}',
      'Survey of servitude vide {authority} approval {reference} dated {date}'
    ],
    surveyBasisTemplates: [
      'Based on previous survey {srNumber} and control points {list}',
      'Trig system, Lo {degrees}º through the use of control points {list}',
      'Adopted control points from parent survey {srNumber}'
    ],
    foundBeaconsTemplates: [
      'Parent survey beacons from {srNumber} were found and adopted',
      'Beacons {list} were found in good condition',
      'NIL'
    ],
    placedBeaconsTemplates: [
      'Steel pegs were placed at servitude corners',
      'Markers were placed along the servitude route at {interval}m intervals',
      'All servitude markers were placed as per the agreement'
    ],
    commentTemplates: [
      'Survey was straightforward',
      'None',
      'Servitude route follows existing path'
    ]
  },
  
  'replacement': {
    purposeTemplates: [
      'Replacement diagram for {description} vide {authority} approval {reference}',
      'To replace diagram {srNumber} vide approval dated {date}',
      'Replacement survey for {purpose} vide permit {reference}'
    ],
    surveyBasisTemplates: [
      'Based on original survey {srNumber} and control points {list}',
      'Trig system as per original survey {srNumber}',
      'Adopted control from original survey {srNumber} and verified with {checkPoints}'
    ],
    foundBeaconsTemplates: [
      'Original beacons from {srNumber} were found and adopted',
      'Beacons {list} were found and verified',
      'Some original beacons were found in {condition} condition'
    ],
    placedBeaconsTemplates: [
      'Replacement beacons were placed at original positions',
      'New beacons were placed to replace missing originals',
      'All beacons were placed as per the original survey'
    ],
    commentTemplates: [
      'Replacement necessitated by {reason}',
      'Original survey details verified',
      'Survey matches original diagram'
    ]
  }
}

/**
 * Common phrases for different contexts
 */
export const COMMON_PHRASES = {
  calibration: [
    'Office Calibration was done covering the area under survey, see calcs page {page}',
    'Calibration parameters were derived from {source}',
    'Field calibration was performed using {method}'
  ],
  
  gpsSetup: [
    'The survey was done using a {equipment} GPS, GPS base was set at a placed Station {station}',
    'RTK GPS survey with base station at {station}',
    'Static GPS observations were made at {stations}',
    'GPS base was set at {station} and measurements were made to {checkPoints} as checks'
  ],
  
  existingDevelopments: [
    'The existing developments were found to correspond with the proposed layout plan',
    'All beacons were placed according to existing developments',
    'Existing features were incorporated into the survey',
    'Survey accommodated existing structures'
  ],
  
  straightforward: [
    'Survey was straightforward',
    'No unusual occurrences',
    'Survey completed without issues',
    'None'
  ]
}

/**
 * Equipment-specific phrases
 */
export const EQUIPMENT_PHRASES = {
  'Hi-Target GPS': 'The survey was done using a Hi-Target GPS',
  'Trimble GPS': 'The survey was done using a Trimble GPS',
  'Leica GPS': 'The survey was done using a Leica GPS',
  'Total Station': 'The survey was done using a Total Station',
  'RTK GPS': 'RTK GPS survey was conducted',
  'Static GPS': 'Static GPS observations were made'
}

/**
 * Coordinate system patterns
 */
export const COORDINATE_SYSTEMS = {
  'Lo 25': 'Lo 25º',
  'Lo 27': 'Lo 27º',
  'Lo 29': 'Lo 29º',
  'Lo 31': 'Lo 31º',
  'Lo 33': 'Lo 33º'
}
