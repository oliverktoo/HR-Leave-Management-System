import { supabase } from '../lib/supabaseClient';

export interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  category: 'laptop' | 'phone' | 'tablet' | 'vehicle_key' | 'access_card' | 'uniform' | 'equipment' | 'furniture' | 'other';
  make: string | null;
  model: string | null;
  serial_number: string | null;
  status: 'available' | 'assigned' | 'maintenance' | 'disposed' | 'lost';
  purchase_date: string | null;
  purchase_cost: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  current_assignee?: string | null;
  current_assignee_id?: string | null;
}

export interface AssetAssignment {
  id: string;
  asset_id: string;
  user_id: string;
  assigned_by: string;
  issued_at: string;
  returned_at: string | null;
  condition_on_issue: 'new' | 'good' | 'fair' | 'poor';
  condition_on_return: 'good' | 'fair' | 'poor' | 'damaged' | 'lost' | null;
  notes: string | null;
  return_notes: string | null;
  created_at: string;
  asset?: Asset;
  employee_name?: string;
}

// Get all assets with current assignee info
export const getAllAssets = async (): Promise<{ data: Asset[] | null; error: any }> => {
  try {
    const { data: assets, error } = await supabase
      .from('assets')
      .select('*')
      .order('asset_tag');
    if (error || !assets) return { data: null, error };

    // Get current assignments (no returned_at)
    const { data: assignments } = await supabase
      .from('asset_assignments')
      .select('asset_id, user_id')
      .is('returned_at', null);

    const assigneeIds = [...new Set(assignments?.map(a => a.user_id) || [])];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name')
      .in('id', assigneeIds);
    const profileMap = new Map(profiles?.map(p => [p.id, `${p.first_name} ${p.last_name}`]) || []);
    const assignMap = new Map(assignments?.map(a => [a.asset_id, a.user_id]) || []);

    const enriched = assets.map(a => ({
      ...a,
      current_assignee_id: assignMap.get(a.id) || null,
      current_assignee: assignMap.has(a.id) ? profileMap.get(assignMap.get(a.id)!) || null : null,
    }));

    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createAsset = async (asset: Omit<Asset, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'current_assignee' | 'current_assignee_id'>): Promise<{ data: Asset | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    const { data, error } = await supabase
      .from('assets')
      .insert({ ...asset, created_by: user.id })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const updateAsset = async (id: string, updates: Partial<Asset>): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('assets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};

// Issue an asset to an employee
export const issueAsset = async (assetId: string, userId: string, condition: AssetAssignment['condition_on_issue'], notes?: string): Promise<{ error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: { message: 'Not authenticated' } };

    await supabase.from('asset_assignments').insert({
      asset_id: assetId, user_id: userId, assigned_by: user.id,
      condition_on_issue: condition, notes,
    });
    await supabase.from('assets').update({ status: 'assigned', updated_at: new Date().toISOString() }).eq('id', assetId);
    return { error: null };
  } catch (err) {
    return { error: err };
  }
};

// Return an asset
export const returnAsset = async (assignmentId: string, assetId: string, condition: NonNullable<AssetAssignment['condition_on_return']>, returnNotes?: string): Promise<{ error: any }> => {
  try {
    await supabase.from('asset_assignments').update({
      returned_at: new Date().toISOString(),
      condition_on_return: condition,
      return_notes: returnNotes,
    }).eq('id', assignmentId);

    const newStatus = condition === 'damaged' || condition === 'lost' ? condition === 'lost' ? 'lost' : 'maintenance' : 'available';
    await supabase.from('assets').update({ status: newStatus as Asset['status'], updated_at: new Date().toISOString() }).eq('id', assetId);
    return { error: null };
  } catch (err) {
    return { error: err };
  }
};

// Get assignment history for an asset
export const getAssetHistory = async (assetId: string): Promise<{ data: AssetAssignment[] | null; error: any }> => {
  const { data, error } = await supabase
    .from('asset_assignments')
    .select('*')
    .eq('asset_id', assetId)
    .order('issued_at', { ascending: false });
  return { data, error };
};

// Get all assets assigned to current user
export const getMyAssets = async (): Promise<{ data: AssetAssignment[] | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    const { data, error } = await supabase
      .from('asset_assignments')
      .select('*, asset:asset_id(*)')
      .eq('user_id', user.id)
      .is('returned_at', null)
      .order('issued_at', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};
