// Zimbabwe cadastral surveying types based on SI 727 of 1979

// Main survey project container
export interface SurveyProject {
  id: string;
  project_name: string;
  project_type: 'cadastral' | 'engineering' | 'mining' | 'township' | 'subdivision';
  district: string;
  coordinate_system_id?: string;
  
  // Legal compliance fields
  surveyor_name: string;
  surveyor_registration: string;
  field_work_start_date: string;
  field_work_end_date?: string;
  survey_purpose: string;
  
  // Parent property information (Section 53)
  parent_diagram_number?: string;
  parent_deed_type?: string;
  parent_deed_number?: string;
  original_title_deed_type?: string;
  original_title_deed_number?: string;
  original_diagram_number?: string;
  
  // Project bounds in Zimbabwe coordinates
  bounds_geometry?: any; // PostGIS geometry
  min_y?: number; // westernmost
  max_y?: number; // easternmost  
  min_x?: number; // northernmost
  max_x?: number; // southernmost
  
  status: 'draft' | 'field_complete' | 'calculations_complete' | 'diagram_submitted' | 'approved' | 'registered';
  is_based_on_trigonometrical: boolean;
  
  created_by?: string;
  created_at: string;
  updated_at: string;
  notes?: string;
}

// Survey beacon with full Zimbabwe specifications
export interface SurveyBeacon {
  id: string;
  project_id: string;
  
  // Beacon identification
  beacon_name: string; // P, Q, R, etc.
  beacon_full_name?: string; // P(Y,X) format
  beacon_type: 'corner' | 'indicatory' | 'reference_mark' | 'witness';
  
  // Zimbabwe coordinates (Y increases westwards, X increases southwards)
  y_coordinate: number; // westwards from central meridian
  x_coordinate: number; // southwards from equator
  elevation?: number;
  geometry?: any; // PostGIS geometry - auto-generated
  
  // Beacon physical specifications (Section 22)
  beacon_specification: string; // e.g., 'iron_rail_2m', 'concrete_block', etc.
  centre_mark_type?: string; // 'iron_peg', 'iron_pipe', 'drilled_hole'
  centre_mark_diameter?: number; // in mm
  centre_mark_depth?: number; // in mm
  has_cairn: boolean;
  has_mound: boolean;
  has_trenches: boolean;
  
  // Status and condition
  beacon_status: 'found' | 'placed' | 'replaced' | 'missing' | 'damaged';
  condition_when_found?: string;
  is_established_beacon: boolean;
  
  // Survey metadata
  accuracy_class?: 'A' | 'B' | 'C';
  survey_method?: string; // 'triangulation', 'traverse', 'intersection', etc.
  
  surveyed_date?: string;
  surveyed_by?: string;
  created_at: string;
  updated_at: string;
}

// Beacon descriptions per Section 48
export interface BeaconDescription {
  id: string;
  beacon_id: string;
  description: string;
  marking_details?: string;
  witness_marks?: string;
  description_source?: string;
  source_survey_date?: string;
  source_reference?: string;
  created_at: string;
}

// Survey boundary with Zimbabwe bearing conventions
export interface SurveyBoundary {
  id: string;
  project_id: string;
  
  // Boundary definition
  from_beacon_id?: string;
  to_beacon_id?: string;
  boundary_type: 'rectilinear' | 'curvilinear' | 'circular_curve';
  
  // Bearing and distance (Zimbabwe convention: 0° = South)
  bearing_degrees?: number;
  bearing_minutes?: number;
  bearing_seconds?: number;
  bearing_decimal?: number; // calculated from DMS
  distance_metres?: number;
  
  // For circular curves (Section 17)
  radius_metres?: number;
  arc_length?: number;
  centre_y?: number;
  centre_x?: number;
  
  // Boundary status
  is_common_boundary: boolean;
  adjoining_property?: string;
  boundary_agreement_reference?: string;
  
  // Alignment information (Section 16)
  alignment_checked: boolean;
  alignment_within_tolerance?: boolean;
  displacement_metres?: number;
  
  created_at: string;
}

// Curvilinear boundaries per Section 19
export interface CurvilinearBoundary {
  id: string;
  project_id: string;
  boundary_name: string;
  boundary_description?: string;
  boundary_geometry?: any; // PostGIS LineString
  
  // Determination method (Section 19)
  determination_method?: 'field_survey' | 'photogrammetric' | 'previous_survey' | 'map_adoption';
  photo_contact_scale?: string;
  compilation_method?: string;
  compilation_scale?: string;
  stereo_instrument_type?: string;
  stereo_instrument_model?: string;
  photo_numbers?: string[];
  determined_by?: string;
  height_control_source?: string;
  
  // Area calculations
  rectilinear_area_sqm?: number;
  curvilinear_area_sqm?: number;
  total_area_sqm?: number;
  
  created_at: string;
}

// Reference marks per Section 26
export interface ReferenceMark {
  id: string;
  project_id: string;
  
  // Mark identification
  mark_name: string;
  mark_type: 'reference_mark' | 'town_survey_mark' | 'trigonometrical_station';
  
  // Coordinates
  y_coordinate: number;
  x_coordinate: number;
  elevation?: number;
  geometry?: any; // PostGIS geometry - auto-generated
  
  // Physical specification (Section 26.1)
  specification: string; // 'iron_peg_concrete', 'drilled_hole', etc.
  has_cairn: boolean;
  has_fencing_standard: boolean;
  is_subsurface: boolean; // 300mm below ground
  
  // Status
  mark_status: 'found' | 'placed' | 'missing' | 'damaged';
  condition_description?: string;
  
  created_at: string;
}

// Survey calculations with quality control
export interface SurveyCalculation {
  id: string;
  project_id: string;
  
  // Calculation details
  calculation_type: 'coordinate_calculation' | 'bearing_distance' | 'area_calculation' | 'traverse_adjustment' | 'alignment_check';
  calculation_method?: string;
  
  // Input parameters and results (JSON for flexibility)
  input_parameters: any;
  results: any;
  
  // Quality control
  accuracy_achieved?: string;
  within_tolerance?: boolean;
  error_values?: any; // closure errors, residuals, etc.
  
  // Audit trail
  calculated_by?: string;
  calculated_at?: string;
  verified_by?: string;
  verified_at?: string;
  
  // References
  field_book_page?: string;
  computation_reference?: string;
}

// Property connections per Section 44
export interface PropertyConnection {
  id: string;
  project_id: string;
  connection_type: 'quadrilateral' | 'linear' | 'coordinate_adoption';
  
  survey_beacon_id?: string;
  parent_beacon_name?: string;
  parent_beacon_y?: number;
  parent_beacon_x?: number;
  
  connection_bearing_degrees?: number;
  connection_bearing_minutes?: number;
  connection_bearing_seconds?: number;
  connection_distance_metres?: number;
  
  parent_coordinate_source?: string;
  parent_survey_reference?: string;
  parent_surveyor?: string;
  coordinate_adoption_distance?: number;
  
  created_at: string;
}

// Survey diagrams per Part V
export interface SurveyDiagram {
  id: string;
  project_id: string;
  
  // Diagram identification
  diagram_number?: string;
  diagram_type: 'subdivisional' | 'consolidated' | 'servitude' | 'building_location' | 'land_share';
  
  // Legal designation (Section 51)
  land_designation: string;
  
  // Diagram specifications (Section 28-32)
  paper_size: '297x210' | '297x385';
  scale_denominator: number;
  figure_area_sqmm?: number; // minimum 650 sq mm
  
  // Coordinate requirements
  coordinates_required: boolean;
  coordinates_based_on_trigonometrical: boolean;
  coordinate_origin_y?: number;
  coordinate_origin_x?: number;
  coordinate_reduction_constant_y?: number;
  coordinate_reduction_constant_x?: number;
  
  // Area information (Section 40.3)
  total_area_sqm: number;
  area_display_format?: 'square_metres' | 'hectares';
  area_formatted?: string; // e.g., "1.2345 ha (12,345 m²)"
  
  // Approval tracking (Section 59)
  submission_date?: string;
  approval_date?: string;
  approved_by?: string;
  approval_status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'amended';
  
  // Document references
  deed_type?: string;
  deed_number?: string;
  certificate_type?: string;
  
  created_at: string;
  updated_at: string;
}

// Survey records per Part VII
export interface SurveyRecord {
  id: string;
  project_id: string;
  
  record_type: 'field_book' | 'computations' | 'working_plan' | 'curvilinear_plan' | 'report' | 'photographs' | 'other';
  document_title: string;
  document_description?: string;
  file_path?: string;
  file_size_bytes?: number;
  file_type?: string;
  
  // Field book specific
  field_book_pages?: number;
  instruments_used?: string[];
  assistants?: string[];
  
  // Computations specific
  computation_pages?: number;
  coordinate_list_included?: boolean;
  consistency_check_included?: boolean;
  
  // Examination tracking
  examined_by?: string;
  examination_date?: string;
  examination_fee_paid?: boolean;
  
  created_at: string;
}

// Survey certificates
export interface SurveyCertificate {
  id: string;
  project_id: string;
  
  certificate_type: 'surveyor_qualification' | 'field_work_certificate' | 'diagram_approval' | 'final_approval';
  certificate_number?: string;
  issued_by: string;
  issued_date: string;
  valid_until?: string;
  certificate_text?: string;
  conditions?: string[];
  status: 'active' | 'expired' | 'revoked' | 'superseded';
  
  created_at: string;
}

// Survey fees per Sections 74-75
export interface SurveyFee {
  id: string;
  project_id: string;
  
  fee_type: 'survey_work' | 'examination' | 'diagram_approval' | 'certificate' | 'arbitration';
  description: string;
  base_amount: number;
  additional_charges?: number;
  total_amount: number;
  currency?: string;
  
  // Payment tracking
  invoice_date?: string;
  due_date?: string;
  paid_date?: string;
  payment_status: 'pending' | 'paid' | 'overdue' | 'disputed' | 'waived';
  disputed?: boolean;
  
  // Taxation (Section 75)
  taxed_amount?: number;
  taxed_by?: string;
  taxation_date?: string;
  
  created_at: string;
}

// Zimbabwe coordinate systems
export interface CoordinateSystem {
  id: string;
  name: string;
  code: string;
  description?: string;
  central_meridian?: number;
  false_easting: number;
  false_northing: number;
  is_active: boolean;
  created_at: string;
}