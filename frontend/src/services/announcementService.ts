import { supabase } from '../lib/supabaseClient';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  target: 'all' | 'department' | 'role';
  department_id: string | null;
  target_role: string | null;
  is_pinned: boolean;
  is_active: boolean;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  read_count?: number;
  is_read?: boolean;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  target: 'all' | 'department' | 'role';
  department_id?: string;
  target_role?: string;
  is_pinned?: boolean;
  expires_at?: string;
}

// HR: get all announcements (for management view)
export const getAllAnnouncements = async (): Promise<{ data: Announcement[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !data) return { data: null, error };

    // Enrich with creator names
    const creatorIds = [...new Set(data.map(a => a.created_by))];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name')
      .in('id', creatorIds);
    const profileMap = new Map(profiles?.map(p => [p.id, `${p.first_name} ${p.last_name}`]) || []);

    // Read counts
    const { data: reads } = await supabase
      .from('announcement_reads')
      .select('announcement_id');
    const readCountMap = new Map<string, number>();
    reads?.forEach(r => {
      readCountMap.set(r.announcement_id, (readCountMap.get(r.announcement_id) || 0) + 1);
    });

    const enriched = data.map(a => ({
      ...a,
      creator_name: profileMap.get(a.created_by) || 'Unknown',
      read_count: readCountMap.get(a.id) || 0,
    }));

    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Staff: get announcements visible to current user
export const getMyAnnouncements = async (): Promise<{ data: Announcement[] | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !data) return { data: null, error };

    // Check which are read by this user
    const { data: reads } = await supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', user.id);
    const readSet = new Set(reads?.map(r => r.announcement_id) || []);

    const enriched = data.map(a => ({ ...a, is_read: readSet.has(a.id) }));
    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createAnnouncement = async (input: CreateAnnouncementInput): Promise<{ data: Announcement | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    const { data, error } = await supabase
      .from('announcements')
      .insert({ ...input, created_by: user.id })
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const updateAnnouncement = async (id: string, updates: Partial<CreateAnnouncementInput & { is_active: boolean; is_pinned: boolean }>): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('announcements')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};

export const deleteAnnouncement = async (id: string): Promise<{ error: any }> => {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  return { error };
};

export const markAnnouncementRead = async (announcementId: string): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('announcement_reads')
      .upsert({ announcement_id: announcementId, user_id: user.id }, { onConflict: 'announcement_id,user_id' });
  } catch { /* silent */ }
};
