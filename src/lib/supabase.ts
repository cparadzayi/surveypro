import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a default client even if env vars are missing to prevent build errors
const defaultUrl = 'https://placeholder.supabase.co';
const defaultKey = 'placeholder-key';

export const supabase = createClient(
  supabaseUrl || defaultUrl, 
  supabaseKey || defaultKey, 
  {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Check for missing environment variables at runtime
export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabaseKey && supabaseUrl !== defaultUrl && supabaseKey !== defaultKey);
};

// Database Management Utilities
export const databaseUtils = {
  // Clear all user data (for development/testing)
  async clearUserData() {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('You must be logged in to clear data');
      }

      // Delete user's data in correct order (respecting foreign keys)
      await supabase.from('beacon_descriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_beacons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_boundaries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('curvilinear_boundaries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('reference_marks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_calculations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('property_connections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_diagrams').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_certificates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_fees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('survey_projects').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      return { success: true, message: 'All user data cleared successfully' };
    } catch (error) {
      console.error('Error clearing user data:', error);
      throw error;
    }
  },

  // Get database statistics
  async getDatabaseStats() {
    try {
      const stats = await Promise.all([
        supabase.from('survey_projects').select('id', { count: 'exact', head: true }),
        supabase.from('survey_beacons').select('id', { count: 'exact', head: true }),
        supabase.from('survey_calculations').select('id', { count: 'exact', head: true }),
        supabase.from('survey_diagrams').select('id', { count: 'exact', head: true })
      ]);

      return {
        projects: stats[0].count || 0,
        beacons: stats[1].count || 0,
        calculations: stats[2].count || 0,
        diagrams: stats[3].count || 0
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      return { projects: 0, beacons: 0, calculations: 0, diagrams: 0 };
    }
  }
};

// Zimbabwe Cadastral Survey API
export const surveyingApi = {
  // Survey Projects
  async createProject(project: {
    project_name: string;
    project_type: 'cadastral' | 'engineering' | 'mining' | 'township' | 'subdivision';
    district: string;
    coordinate_system_id?: string;
    surveyor_name: string;
    surveyor_registration: string;
    field_work_start_date: string;
    field_work_end_date?: string;
    survey_purpose: string;
    parent_diagram_number?: string;
    parent_deed_type?: string;
    parent_deed_number?: string;
    original_title_deed_type?: string;
    original_title_deed_number?: string;
    original_diagram_number?: string;
    is_based_on_trigonometrical?: boolean;
    notes?: string;
  }) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('You must be logged in to create a project');
    }

    const { data, error } = await supabase
      .from('survey_projects')
      .insert([{
        ...project,
        created_by: user.id
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getProjects() {
    const { data, error } = await supabase
      .from('survey_projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async getProject(id: string) {
    const { data, error } = await supabase
      .from('survey_projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Survey Beacons
  async addBeacon(beacon: {
    project_id: string;
    beacon_name: string;
    beacon_type: 'corner' | 'indicatory' | 'reference_mark' | 'witness';
    y_coordinate: number;
    x_coordinate: number;
    elevation?: number;
    beacon_specification: string;
    centre_mark_type?: string;
    centre_mark_diameter?: number;
    centre_mark_depth?: number;
    has_cairn?: boolean;
    has_mound?: boolean;
    has_trenches?: boolean;
    beacon_status?: 'found' | 'placed' | 'replaced' | 'missing' | 'damaged';
    condition_when_found?: string;
    is_established_beacon?: boolean;
    accuracy_class?: 'A' | 'B' | 'C';
    survey_method?: string;
    surveyed_date?: string;
    surveyed_by?: string;
  }) {
    const { data, error } = await supabase
      .from('survey_beacons')
      .insert([beacon])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getBeacons(projectId: string) {
    const { data, error } = await supabase
      .from('survey_beacons')
      .select(`
        *,
        beacon_descriptions(*)
      `)
      .eq('project_id', projectId)
      .order('beacon_name');
    
    if (error) throw error;
    return data;
  },

  // Coordinate Systems
  async getCoordinateSystems() {
    const { data, error } = await supabase
      .from('coordinate_systems')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    return data;
  },

  // Survey Calculations
  async saveCalculation(calculation: {
    project_id: string;
    calculation_type: 'coordinate_calculation' | 'bearing_distance' | 'area_calculation' | 'traverse_adjustment' | 'alignment_check';
    calculation_method?: string;
    input_parameters: Record<string, unknown>;
    results: Record<string, unknown>;
    accuracy_achieved?: string;
    within_tolerance?: boolean;
    error_values?: Record<string, unknown>;
    calculated_by?: string;
    verified_by?: string;
    verified_at?: string;
    field_book_page?: string;
    computation_reference?: string;
  }) {
    const { data, error } = await supabase
      .from('survey_calculations')
      .insert([calculation])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getCalculations(projectId: string) {
    const { data, error } = await supabase
      .from('survey_calculations')
      .select('*')
      .eq('project_id', projectId)
      .order('calculated_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }
};